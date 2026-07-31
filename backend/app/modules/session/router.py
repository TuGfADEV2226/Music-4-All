from fastapi import APIRouter, Depends, Request, Response

from app.config import settings
from app.core.csrf import assert_not_cross_site
from app.core.exceptions import ApiException
from app.core.rate_limiter import limiter
from app.dependencies import CurrentUser, get_current_user, get_current_user_optional

from .schemas import (
    DeviceAuthInitResponse,
    DeviceAuthPollResponse,
    KeepaliveResponse,
    PkceCompleteRequest,
    PkceStartResponse,
    PkceStatusResponse,
    SessionListResponse,
    SessionStatusResponse,
)
from .service import SessionService, clear_session_cookie

router = APIRouter(prefix="/session", tags=["session-v2"])
_service = SessionService()


@router.get("/status", response_model=SessionStatusResponse)
@limiter.limit("30/minute")
async def get_session_status(
    request: Request,
    user: CurrentUser | None = Depends(get_current_user_optional),
):
    """Estado de la sesión Tidal **del usuario actual** (resuelto por la cookie de app)."""
    if user is None:
        return SessionStatusResponse(status="expired", user=None, expires_at=None)
    try:
        registry = request.app.state.engine_registry
        engine = await registry.get_authenticated(request.app.state.redis, user.tidal_user_id)
        if engine is None:
            return SessionStatusResponse(status="expired", user=None, expires_at=None)
        return await _service.get_status(engine)
    except Exception as exc:
        raise ApiException("SERVER_ERROR", str(exc), 500, retriable=True) from exc


@router.post("/device-auth", response_model=DeviceAuthInitResponse)
@limiter.limit("5/minute")
async def start_device_auth(request: Request):
    """Inicia el flujo OAuth Device Authorization de Tidal."""
    try:
        return await _service.start_device_auth(request.app.state)
    except Exception as exc:
        raise ApiException(
            "SERVER_ERROR",
            f"Error iniciando autenticación con Tidal: {exc}",
            500,
            retriable=True,
        ) from exc


@router.get("/device-auth/{device_code}", response_model=DeviceAuthPollResponse)
@limiter.limit("120/minute")
async def poll_device_auth(
    request: Request,
    response: Response,
    device_code: str,
):
    """Polling de autorización durante el Device Auth flow. Llamar cada `interval` segundos.

    Al autorizarse, emite la cookie httpOnly de sesión de app (Set-Cookie en `response`).
    Por eso exige que la petición no sea cross-site: es el único endpoint que crea
    sesión sin tener una, y SameSite=Lax no impide *fijar* la cookie desde fuera
    (login CSRF; ver `app/core/csrf.py`).
    """
    assert_not_cross_site(request)
    try:
        result = await _service.poll_device_auth(device_code, request, response)
    except ApiException:
        # Errores de dominio (p.ej. ACCOUNT_BANNED) conservan su código/estado.
        raise
    except Exception as exc:
        raise ApiException("SERVER_ERROR", str(exc), 500, retriable=True) from exc

    # Estados terminales con error → 400
    if result.status in ("expired", "denied"):
        raise ApiException(
            "DEVICE_AUTH_EXPIRED",
            "El código de dispositivo ha expirado o fue denegado. Reinicia el flujo de autorización.",
            400,
            retriable=False,
        )

    return result


# ─── PKCE: sesión Hi-Fi 16-bit (Fase 5) ───────────────────────────────────────


@router.post("/pkce/start", response_model=PkceStartResponse)
@limiter.limit("5/minute")
async def start_pkce(request: Request, user: CurrentUser = Depends(get_current_user)):
    """Inicia el login PKCE para conectar la sesión Hi-Fi (16-bit) del usuario."""
    try:
        return await _service.start_pkce(request.app.state, user.tidal_user_id)
    except Exception as exc:
        raise ApiException(
            "SERVER_ERROR", f"Error iniciando el login Hi-Fi: {exc}", 500, retriable=True
        ) from exc


@router.post("/pkce/complete", response_model=PkceStatusResponse)
@limiter.limit("10/minute")
async def complete_pkce(
    request: Request,
    body: PkceCompleteRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Canjea la URL pegada por el usuario y guarda su sesión Hi-Fi (16-bit)."""
    return await _service.complete_pkce(request.app.state, user.tidal_user_id, body.redirect_url)


@router.get("/pkce/status", response_model=PkceStatusResponse)
@limiter.limit("30/minute")
async def pkce_status(request: Request, user: CurrentUser = Depends(get_current_user)):
    """¿El usuario tiene conectada la sesión Hi-Fi (16-bit)?"""
    return await _service.pkce_status(request.app.state.redis, user.tidal_user_id)


@router.delete("/pkce", response_model=PkceStatusResponse)
@limiter.limit("10/minute")
async def disconnect_pkce(request: Request, user: CurrentUser = Depends(get_current_user)):
    """Desconecta la sesión Hi-Fi (16-bit) del usuario (borra sus tokens PKCE)."""
    return await _service.disconnect_pkce(
        request.app.state.redis, user.tidal_user_id, request.app.state.engine_registry
    )


@router.post("/keepalive", response_model=KeepaliveResponse)
@limiter.limit("60/minute")
async def keepalive(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Reporta actividad real del usuario y renueva el TTL idle de la sesión.

    Lo llama el vigilante de inactividad del navegador, que es el único que puede
    ver si el usuario sigue ahí (ratón/teclado). Las peticiones automáticas de la
    app se marcan con `X-Background-Request` y **no** renuevan nada, así que este
    endpoint es la única vía por la que una sesión sobrevive sin navegar.

    Deliberadamente barato: `get_current_user` ya renovó el TTL al resolver la
    cookie; aquí no se toca Tidal ni la base de datos.
    """
    return KeepaliveResponse(
        idle_ttl_seconds=settings.session_idle_ttl,
        expires_in_seconds=settings.session_idle_ttl,
    )


@router.post("/logout")
@limiter.limit("10/minute")
async def logout(
    request: Request,
    response: Response,
    user: CurrentUser | None = Depends(get_current_user_optional),
):
    """Cierra la sesión de app actual (borra la cookie y la sesión en Redis)."""
    sid = user.sid if user else request.cookies.get(settings.session_cookie_name)
    return await _service.logout(request.app.state.redis, sid, response)


@router.get("/sessions", response_model=SessionListResponse)
@limiter.limit("30/minute")
async def list_sessions(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Lista las sesiones de app activas del usuario (panel de sesiones)."""
    return await _service.list_sessions(request.app.state.redis, user.tidal_user_id, user.sid)


@router.delete("/sessions")
@limiter.limit("10/minute")
async def revoke_other_sessions(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Cierra todas las demás sesiones del usuario, conservando la actual."""
    return await _service.revoke_other_sessions(
        request.app.state.redis, user.tidal_user_id, keep_sid=user.sid
    )


@router.delete("/sessions/{sid}")
@limiter.limit("20/minute")
async def revoke_session(
    request: Request,
    sid: str,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
):
    """Cierra una sesión concreta del usuario. Si es la actual, también borra la cookie."""
    result = await _service.revoke_session(request.app.state.redis, user.tidal_user_id, sid)
    if sid == user.sid:
        clear_session_cookie(response)
    return result
