import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.core import abuse
from app.core import redis_client as rc
from app.core import user_session as us
from app.core.database import AsyncSessionLocal, engine
from app.core.engine_registry import EngineRegistry
from app.core.exceptions import ApiException
from app.core.job_controls import JobControlRegistry
from app.core.logging_config import get_logger, setup_logging
from app.core.rate_limiter import limiter
from app.core.reconciliation import reconcile_stale_jobs
from app.core.tidal import TidalDownloader
from app.core.worker import start_worker

# ── Routers de módulos (la separación legacy/v2 se ve en los include_router) ──
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.download.router import router as download_router
from app.modules.download.ws import router as ws_router
from app.modules.history.router import router as history_router
from app.modules.jobs.router import router as jobs_router
from app.modules.metadata.router import router as metadata_router
from app.modules.push.router import router as push_router
from app.modules.search.router import router as search_router
from app.modules.session.router import router as session_router

setup_logging(level="DEBUG" if settings.debug else "INFO")
logger = get_logger(__name__)


def _setup_tracing() -> None:
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Music 4 All API", extra={"version": "7.0.0"})

    # Guard de producción: no arrancar con defaults de desarrollo inseguros. Falla
    # rápido y ruidoso en vez de servir una web pública con tokens sin cifrado
    # persistente, cookies no-Secure o CORS de localhost. En desarrollo no aplica.
    if settings.is_production:
        problems = settings.production_config_errors()
        if problems:
            raise RuntimeError(
                "Configuración insegura para ENVIRONMENT=production:\n  - "
                + "\n  - ".join(problems)
            )

    # El esquema es responsabilidad de Alembic (`alembic upgrade head`, que el
    # contenedor ejecuta antes de arrancar; en local, ver docs/development.md).
    # Antes se llamaba aquí a `Base.metadata.create_all`, que solo crea tablas
    # que faltan y **nunca altera las existentes**: las bases ya desplegadas se
    # quedaban sin las columnas nuevas y el arranque no se enteraba.

    app.state.redis = await rc.create_client(settings.redis_url)

    # Motor Tidal por usuario (multiusuario). El motor global se mantiene solo para
    # los routers legacy (`/auth/*`) y como fallback de auth del WS sin cookie.
    app.state.engine_registry = EngineRegistry(
        max_engines=settings.max_user_engines,
        idle_ttl=settings.engine_idle_ttl,
    )
    session_data = await rc.load_session(app.state.redis)
    app.state.engine = TidalDownloader(session_data=session_data)
    app.state.pending_oauth = None
    app.state.pending_oauth_v2 = {}  # dict[device_code → {session, future}]
    app.state.job_controls = JobControlRegistry()

    # RM-09.1: Mark any in-progress jobs from a previous process as failed
    # before the worker starts, so they are never picked up as zombies.
    await reconcile_stale_jobs(app.state.redis)

    worker_task = asyncio.create_task(
        start_worker(
            app.state.engine_registry,
            app.state.redis,
            AsyncSessionLocal,
            app.state.job_controls,
        )
    )

    yield

    logger.info("Shutting down Music 4 All API")
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass

    await app.state.engine_registry.cleanup_all()
    await app.state.redis.aclose()
    await engine.dispose()
    app.state.engine._cleanup_temp_dir()


app = FastAPI(
    title="Music 4 All API",
    description="API para descargar música de Tidal",
    version="7.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
)

# ── Rate limiting ──────────────────────────────────────────────────────────────
app.state.limiter = limiter


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Registra un strike de abuso para el usuario limitado y delega en slowapi.

    Best-effort: cualquier fallo aquí no debe enmascarar el 429. El usuario puede no
    estar resuelto en ``request.state`` (el límite por defecto salta en el middleware
    antes de las dependencias), así que se intenta también por la cookie de sesión.
    """
    try:
        redis = getattr(request.app.state, "redis", None)
        if redis is not None:
            user = getattr(request.state, "current_user", None)
            uid = user.tidal_user_id if user is not None else None
            if uid is None:
                sid = request.cookies.get(settings.session_cookie_name)
                if sid:
                    data = await us.get_app_session(redis, sid, touch=False)
                    if data:
                        uid = str(data["tidal_user_id"])
            if uid is not None:
                await abuse.record_strike(redis, uid, kind="rate_limit")
    except Exception:  # noqa: BLE001 — la telemetría de abuso nunca rompe la respuesta
        pass
    return _rate_limit_exceeded_handler(request, exc)


app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)  # type: ignore[arg-type]  # slowapi handler signature compatible at runtime
app.add_middleware(SlowAPIMiddleware)

# ── Compresión de respuestas ───────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    # X-Background-Request: marca el auto-refresco del frontend para que no cuente
    # como actividad del usuario (ver app/dependencies.py).
    allow_headers=["Content-Type", "Authorization", "X-Background-Request"],
)

# ── Cabeceras de seguridad ──────────────────────────────────────────────────────
# Defensa en profundidad para las respuestas del API (JSON/archivos). La CSP real de
# la web (Next.js) vive en nginx; aquí un CSP mínimo bloquea que este origen sirva
# contenido activo. Se omite en las rutas de docs para no romper Swagger UI. HSTS solo
# lo honran los navegadores sobre HTTPS (nginx termina TLS en producción).
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    if not request.url.path.startswith(_DOCS_PATHS):
        response.headers.setdefault(
            "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
        )
    return response


# ── Prometheus ────────────────────────────────────────────────────────────────
Instrumentator(
    should_group_status_codes=True,
    excluded_handlers=["/metrics", "/health"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# ── OpenTelemetry ─────────────────────────────────────────────────────────────
# Desactivado en producción por defecto: el único exportador es la consola y va con
# SimpleSpanProcessor (síncrono en el event loop). Ver `settings.tracing_enabled`.
if settings.tracing_enabled:
    _setup_tracing()
    FastAPIInstrumentor.instrument_app(app)
else:
    logger.info("OpenTelemetry tracing deshabilitado", extra={"environment": settings.environment})


# ── Handler global de ApiException (produce {"error": {...}}) ─────────────────
@app.exception_handler(ApiException)
async def api_exception_handler(request: Request, exc: ApiException) -> JSONResponse:
    body: dict = {
        "error": {
            "code": exc.code,
            "message": exc.message,
            "http_status": exc.http_status,
            "retriable": exc.retriable,
        }
    }
    if exc.existing_job_id:
        body["error"]["existing_job_id"] = exc.existing_job_id
    return JSONResponse(status_code=exc.http_status, content=body)


# ── Handler global de RequestValidationError — D-08 ───────────────────────────
# Transforma errores de validación de Pydantic/FastAPI al formato uniforme del spec.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = " → ".join(str(part) for part in first.get("loc", []))
    msg = str(first.get("msg", "Error de validación"))
    message = f"{loc}: {msg}" if loc else msg
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "SERVER_ERROR",
                "message": message,
                "http_status": 422,
                "retriable": False,
            }
        },
    )


# ── Legacy routers — mantener compatibilidad total ────────────────────────────
app.include_router(auth_router)
app.include_router(download_router)
app.include_router(ws_router)
app.include_router(metadata_router)
app.include_router(history_router)

# ── V2 routers — contratos del Technical Specification v1.0 ───────────────────
app.include_router(search_router)
app.include_router(jobs_router)
app.include_router(session_router)
app.include_router(admin_router)
app.include_router(push_router)


@app.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "healthy", "service": "Music 4 All API", "version": "7.0.0"}
