import json
from datetime import UTC, datetime

import redis.asyncio as aioredis
from redis.asyncio import Redis

REDIS_SESSION_KEY = "music4all:session"
REDIS_HISTORY_KEY = "music4all:downloads:history"
REDIS_QUEUE_KEY = "music4all:queue:downloads"
REDIS_JOB_PREFIX = "music4all:job:"
REDIS_JOB_PROGRESS_CHANNEL = "music4all:job:{job_id}:progress"
# RM-01: unified channel — all jobs publish here for /ws/downloads
REDIS_ALL_JOBS_CHANNEL = "music4all:progress:all"
HISTORY_MAX_SIZE = 200
JOB_TTL = 86400  # 24 horas

# Segundos que una petición espera a que se libere una conexión del pool de
# comandos antes de rendirse. Acotado a propósito: sin tope, una saturación se
# convertiría en peticiones colgadas en vez de en un error visible.
POOL_WAIT_TIMEOUT = 10


async def create_client(
    url: str, max_connections: int | None = None, block_when_full: bool = False
) -> Redis:
    """Cliente Redis con el tamaño del pool declarado explícitamente.

    `max_connections` no se deja al criterio de la librería: redis-py 8 lo bajó a
    100 (antes era prácticamente ilimitado), y como cada WebSocket de progreso
    retiene una conexión mientras está abierto, ese cambio convirtió "muchos
    usuarios con la pestaña abierta" en un fallo total de la API. Ver
    `settings.redis_max_connections` / `ws_max_connections`.

    `block_when_full` elige qué pasa cuando el pool se queda sin conexiones:

    - `False` (pool normal): la petición falla en el acto con
      `MaxConnectionsError`. Es lo que se quiere para las suscripciones de los
      WebSocket, donde el rechazo es la respuesta correcta (y ya hay aforo).
    - `True` (pool bloqueante): la petición **espera** a que se libere una. Es lo
      que se quiere para los comandos: una ráfaga de peticiones simultáneas mayor
      que el pool debe costar latencia, no un 500. Medido en 0.F: 120 handshakes
      a la vez agotaban un pool de 100 y cuatro se caían con 500.
    """
    if max_connections is None:
        return aioredis.from_url(url, decode_responses=True)
    if not block_when_full:
        return aioredis.from_url(url, decode_responses=True, max_connections=max_connections)
    pool = aioredis.BlockingConnectionPool.from_url(
        url,
        decode_responses=True,
        max_connections=max_connections,
        timeout=POOL_WAIT_TIMEOUT,
    )
    return aioredis.Redis(connection_pool=pool)


# ─── Session ──────────────────────────────────────────────────────────────────


async def save_session(redis: Redis, session_data: dict) -> None:
    ttl = _ttl_from_session(session_data)
    await redis.setex(REDIS_SESSION_KEY, ttl, json.dumps(session_data))


async def load_session(redis: Redis) -> dict | None:
    raw = await redis.get(REDIS_SESSION_KEY)
    return json.loads(raw) if raw else None


async def delete_session(redis: Redis) -> None:
    await redis.delete(REDIS_SESSION_KEY)


def _ttl_from_session(session_data: dict) -> int:
    try:
        expiry = datetime.fromisoformat(session_data["expiry_time"])
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=UTC)
        ttl = int((expiry - datetime.now(UTC)).total_seconds())
        return max(300, ttl)
    except Exception:
        return 3600


# ─── Download history (Redis list — cache rápido) ────────────────────────────


async def push_history(redis: Redis, record: dict) -> None:
    await redis.lpush(REDIS_HISTORY_KEY, json.dumps(record))
    await redis.ltrim(REDIS_HISTORY_KEY, 0, HISTORY_MAX_SIZE - 1)


async def get_history(redis: Redis) -> list[dict]:
    records = await redis.lrange(REDIS_HISTORY_KEY, 0, -1)
    return [json.loads(r) for r in records]


# ─── Job queue (Redis List como cola FIFO) ────────────────────────────────────


async def enqueue_job(redis: Redis, job: dict) -> None:
    """Empuja un job al final de la cola."""
    await redis.lpush(REDIS_QUEUE_KEY, json.dumps(job))


async def dequeue_job(redis: Redis, timeout: int = 2) -> dict | None:
    """Extrae el siguiente job de la cola (blocking). Devuelve None si hay timeout."""
    result = await redis.brpop(REDIS_QUEUE_KEY, timeout=timeout)
    if result:
        _, data = result
        return json.loads(data)
    return None


# ─── Job state ────────────────────────────────────────────────────────────────


async def set_job_state(redis: Redis, job_id: str, state: dict) -> None:
    """Persiste el estado de un job con TTL de 24h."""
    await redis.setex(f"{REDIS_JOB_PREFIX}{job_id}", JOB_TTL, json.dumps(state))


async def get_job_state(redis: Redis, job_id: str) -> dict | None:
    """Lee el estado actual de un job."""
    raw = await redis.get(f"{REDIS_JOB_PREFIX}{job_id}")
    return json.loads(raw) if raw else None


# ─── Pub/Sub de progreso ──────────────────────────────────────────────────────


async def publish_progress(redis: Redis, job_id: str, data: dict) -> None:
    """Publica un update de progreso en el canal del job Y en el canal global (RM-01)."""
    payload = json.dumps(data)
    # Legacy per-job channel — keeps /ws/progress/{job_id} working
    await redis.publish(REDIS_JOB_PROGRESS_CHANNEL.format(job_id=job_id), payload)
    # Unified channel — consumed by /ws/downloads
    await redis.publish(REDIS_ALL_JOBS_CHANNEL, payload)


def progress_channel(job_id: str) -> str:
    return REDIS_JOB_PROGRESS_CHANNEL.format(job_id=job_id)
