from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Music 4 All"
    debug: bool = False

    # Entorno de despliegue. En "production"/"prod" el arranque valida la config
    # sensible y **falla rápido** si sigue con defaults de desarrollo (ver
    # `production_config_errors` y el guard en main.py). Por defecto: desarrollo.
    environment: str = "development"

    # Tidal
    tidal_quality: str = "LOSSLESS"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Sesión de app (multiusuario) — cookie m4a_sid mapeada en Redis a un usuario Tidal.
    # session_encryption_key cifra los tokens Tidal en reposo: OBLIGATORIA en producción
    # (si va vacía, en dev se usa una clave efímera y los tokens no sobreviven al reinicio).
    session_encryption_key: str = ""
    session_idle_ttl: int = 1800  # 30 min de inactividad (TTL deslizante)
    session_absolute_ttl: int = 86400  # 24 h máximo por sesión
    session_cookie_name: str = "m4a_sid"
    cookie_secure: bool = False  # True en producción (cookies solo por HTTPS)
    cookie_samesite: str = "lax"  # Lax: cookie viaja en navegaciones top-level (middleware)

    # Conexiones a Redis. Se declaran explícitamente porque el valor por defecto de
    # la librería cambió bajo nuestros pies: redis-py 8 limita el pool a 100
    # conexiones (antes era prácticamente ilimitado). Cada WebSocket de progreso
    # retiene una conexión del pool mientras esté abierto, así que con el pool
    # único que había, ~100 usuarios con la pestaña abierta lo agotaban y **toda**
    # la API empezaba a devolver 500 (medido en la Fase 0.F). De ahí los dos pools:
    #   - redis_max_connections: comandos (sesión, cuotas, jobs, caché).
    #   - ws_max_connections: suscripciones Pub/Sub de los WebSocket, en su propio
    #     cliente, para que una sala llena nunca pueda tumbar el resto de la API.
    redis_max_connections: int = 100
    ws_max_connections: int = 200

    # EngineRegistry (multiusuario) — un motor Tidal por usuario, con caché LRU/TTL.
    # max_user_engines acota la memoria/temp dirs; engine_idle_ttl evicta motores
    # ociosos (sin descargas en curso) para liberar su directorio temporal.
    max_user_engines: int = 50
    engine_idle_ttl: int = 1800  # 30 min sin uso → evicción
    # Carpeta persistente de descargas (en Docker, el volumen montado). Vacío =
    # un directorio temporal por motor, que se borra al evictarlo: la música
    # desaparecía sola a los 30 min y engordaba el disco del contenedor en vez
    # del volumen. Cada usuario tiene su subcarpeta dentro.
    download_dir: str = ""
    # Cada validación de sesión es una petición HTTP a Tidal, y era una por cada
    # petición autenticada: ~130 ms de suelo aunque la respuesta viniera de caché,
    # y una llamada al client_id compartido por vista. Se revalida como mucho una
    # vez cada N segundos por motor. 0 = validar siempre (comportamiento anterior).
    engine_auth_recheck_interval: int = 60

    # Caché de catálogo Tidal (Fase 4) — búsqueda/metadata/detalle. Es la red de
    # seguridad del client_id compartido: las lecturas del catálogo son globales
    # (idénticas para todos los usuarios), así que se cachean en Redis SIN scope de
    # usuario y una búsqueda repetida (del mismo o de otro usuario) no vuelve a
    # golpear a Tidal. TTL corto para búsqueda (más "viva") y largo para detalle.
    tidal_cache_enabled: bool = True
    tidal_cache_search_ttl: int = 300  # 5 min — /search y /metadata/search
    tidal_cache_detail_ttl: int = 3600  # 1 h — detalle de álbum/artista (cambia poco)
    # Circuit breaker ante 429 (TooManyRequests) de Tidal: al recibir un 429 se abre
    # un backoff global; mientras esté abierto, las lecturas NO cacheadas devuelven
    # 503 en vez de seguir presionando al client_id de terceros (revocable).
    tidal_breaker_ttl: int = 30  # cooldown por defecto si Tidal no manda Retry-After
    tidal_breaker_max_ttl: int = 300  # tope del cooldown aunque Retry-After sea mayor

    # Worker concurrency
    max_concurrent_downloads: int = 3

    # Cuotas por usuario — acotan el consumo individual de la cola compartida y del
    # rate-limit del client_id de Tidal. 0 o negativo = sin límite (desarrollo).
    max_downloads_per_day: int = 50
    max_concurrent_jobs_per_user: int = 3

    # Administración / anti-abuso (Fase 6) — IDs de usuario Tidal con acceso a
    # `/admin/*` (banear/desbanear, revisar strikes). Lista vacía = nadie es admin
    # (todo `/admin/*` responde 403). En env, mismo formato que cors_origins:
    # ADMIN_TIDAL_USER_IDS='["197033432"]'.
    admin_tidal_user_ids: list[str] = []

    # Detección de abuso (Fase 6, 6B) — se cuenta un "strike" cada vez que un usuario
    # topa una cuota o es limitado por rate-limit. Al acumular strike_alert_threshold
    # strikes dentro de la ventana se emite una alerta (log + métrica) para revisión
    # manual; el ban sigue siendo decisión humana (no hay auto-ban). 0 = desactivado.
    abuse_strike_window: int = 3600  # ventana deslizante (s) en la que se cuentan strikes
    abuse_strike_alert_threshold: int = 20  # strikes en la ventana que disparan la alerta

    # Web Push (PWA P1-C) — VAPID. Vacías = push DESACTIVADO (la app funciona igual).
    # VAPID_PUBLIC_KEY = applicationServerKey (base64url) que usa el navegador.
    # VAPID_PRIVATE_KEY = base64url del DER PKCS8 (una línea). Generar ambas con el
    # script de `.env.example`. vapid_subject debe ser un mailto: real en producción.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    # PostgreSQL — SQLite solo en desarrollo local
    database_url: str = "sqlite+aiosqlite:///./dev.db"

    # Tracing OpenTelemetry. El exportador configurado es la CONSOLA con
    # SimpleSpanProcessor: exporta cada span de forma síncrona en el event loop e
    # infla los logs, y sin collector no aporta nada en producción (PERF-01). Por
    # eso el default es "activo en desarrollo, inactivo en producción"; None deja
    # ese default y OTEL_TRACING_ENABLED=true/false lo fuerza explícitamente.
    otel_tracing_enabled: bool | None = None

    @property
    def tracing_enabled(self) -> bool:
        """Si se instala el TracerProvider e instrumenta FastAPI con OTel."""
        if self.otel_tracing_enabled is not None:
            return self.otel_tracing_enabled
        return not self.is_production

    @property
    def push_enabled(self) -> bool:
        """El push solo está activo si hay par de claves VAPID configurado."""
        return bool(self.vapid_public_key and self.vapid_private_key)

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    def production_config_errors(self) -> list[str]:
        """Config que hace inseguro un despliegue público. Lista vacía = OK.

        La consume el guard de arranque (main.py): si `is_production` y esto no está
        vacío, la app se niega a arrancar en vez de servir con defaults de desarrollo.
        """
        problems: list[str] = []
        if not self.session_encryption_key:
            problems.append(
                "SESSION_ENCRYPTION_KEY vacía: los tokens se cifran con una clave "
                "efímera que no sobrevive al reinicio (las sesiones se perderían)."
            )
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE=False: la cookie de sesión viajaría también por HTTP.")
        dev_origins = [o for o in self.cors_origins if "localhost" in o or "127.0.0.1" in o]
        if dev_origins:
            problems.append(f"CORS_ORIGINS aún incluye orígenes de desarrollo: {dev_origins}")
        return problems

    @property
    def async_database_url(self) -> str:
        """Asegura el driver async correcto en la URL."""
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url  # sqlite+aiosqlite ya tiene el driver correcto

    # CORS — en producción pasar CORS_ORIGINS="http://mydomain.com" via env var
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://frontend:3000",
    ]

    class Config:
        env_file = ".env"


settings = Settings()
