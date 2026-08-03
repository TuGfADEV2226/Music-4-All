"""
Métricas Prometheus personalizadas para Music 4 All.
Las métricas HTTP generales (latencia, request count, error rate) son
añadidas automáticamente por prometheus-fastapi-instrumentator en main.py.
"""

from prometheus_client import Counter, Gauge, Histogram

# ── Descargas ─────────────────────────────────────────────────────────────────

downloads_total = Counter(
    "music4all_downloads_total",
    "Número total de tracks descargados",
    ["status"],  # completed | failed
)

downloads_in_progress = Gauge(
    "music4all_downloads_in_progress",
    "Número de descargas en curso en este momento",
)

download_duration_seconds = Histogram(
    "music4all_download_duration_seconds",
    "Tiempo total de descarga de un job (todos los tracks)",
    buckets=[15, 30, 60, 120, 300, 600, 1800, float("inf")],
)

tracks_downloaded_total = Counter(
    "music4all_tracks_downloaded_total",
    "Número total de tracks individuales descargados con éxito",
)

# ── Queue / concurrency ───────────────────────────────────────────────────────

queue_depth = Gauge(
    "music4all_queue_depth",
    "Jobs pendientes en la cola de descargas Redis",
)

downloads_concurrency_limit = Gauge(
    "music4all_downloads_concurrency_limit",
    "Límite máximo de descargas simultáneas (MAX_CONCURRENT_DOWNLOADS)",
)

# ── Cuotas por usuario ────────────────────────────────────────────────────────

quota_rejections_total = Counter(
    "music4all_quota_rejections_total",
    "Descargas rechazadas por superar la cuota del usuario",
    ["quota"],  # daily | concurrent
)

# ── Auth ──────────────────────────────────────────────────────────────────────

auth_logins_total = Counter(
    "music4all_auth_logins_total",
    "Número de inicios de sesión Tidal completados",
    ["status"],  # success | failure
)

# ── Anti-abuso / administración (Fase 6) ──────────────────────────────────────

bans_total = Counter(
    "music4all_bans_total",
    "Acciones de ban/unban aplicadas a usuarios",
    ["action"],  # ban | unban
)

# Un "strike" se registra cada vez que un usuario topa una cuota o es limitado por
# rate-limit. Al acumular strikes suficientes en la ventana se emite una alerta
# (music4all_abuse_alerts_total) para revisión manual — el ban sigue siendo humano.
abuse_strikes_total = Counter(
    "music4all_abuse_strikes_total",
    "Infracciones de abuso registradas (cuota/rate-limit) por tipo",
    ["kind"],  # quota_daily | quota_concurrent | rate_limit
)

abuse_alerts_total = Counter(
    "music4all_abuse_alerts_total",
    "Alertas de abuso emitidas (un usuario superó el umbral de strikes en la ventana)",
)

# ── Web Push (PWA P1-C) ───────────────────────────────────────────────────────

push_notifications_total = Counter(
    "music4all_push_notifications_total",
    "Notificaciones Web Push intentadas por resultado",
    ["result"],  # sent | expired (suscripción muerta, se purga) | error
)

# ── Caché de catálogo Tidal (Fase 4) ──────────────────────────────────────────
# Protege el rate-limit del client_id compartido: las lecturas del catálogo
# (búsqueda/metadata/detalle) son globales y se cachean. `result=hit` significa
# que NO se golpeó a Tidal.

tidal_cache_total = Counter(
    "music4all_tidal_cache_total",
    "Lecturas del catálogo Tidal servidas desde caché (hit) o desde Tidal (miss)",
    ["kind", "result"],  # kind: search|metadata_search|album|artist ; result: hit|miss
)

tidal_api_errors_total = Counter(
    "music4all_tidal_api_errors_total",
    "Errores de la API de Tidal relevantes para el client_id compartido",
    ["kind"],  # rate_limited (429, abre el circuit breaker) | auth (401)
)

# ── WebSocket de progreso (Fase 0.F) ──────────────────────────────────────────
# Cada conexión retiene una conexión Pub/Sub de Redis mientras esté abierta, así
# que es una capacidad acotada y hay que poder verla: `ws_connections_active`
# contra `settings.ws_max_connections` dice cuánto margen queda, y un
# `ws_connections_rejected_total` creciendo significa que la sala está llena.

ws_connections_active = Gauge(
    "music4all_ws_connections_active",
    "WebSockets de progreso abiertos en este momento",
)

ws_connections_rejected_total = Counter(
    "music4all_ws_connections_rejected_total",
    "WebSockets rechazados por haberse alcanzado el máximo de conexiones",
)
