"""Registro de motores Tidal por usuario (multiusuario, 1 réplica).

Sustituye al motor único global (`app.state.engine`) por una caché de
`TidalDownloader` **por `(tidal_user_id, kind)`**. Cada motor se crea de forma
perezosa a partir de los tokens del usuario (cifrados en Redis) y se descarta
cuando queda ocioso, liberando su directorio temporal de descargas.

`kind` distingue las dos sesiones Tidal que puede tener un usuario (Fase 5):
  - ``oauth`` — sesión device-flow (Automotive HiRes): navegación, streaming y
    descargas hi-res 24-bit + AAC. Es el motor por defecto.
  - ``pkce``  — segunda sesión web PKCE del mismo usuario: la única que entrega
    16-bit LOSSLESS real. Se usa solo para descargar el tier ``HIGH``.
Ambos motores comparten esta caché (una sola por proceso) pero se cachean bajo
claves distintas, así que conviven sin pisarse.

Diseño (apto para 1 réplica; el estado vive en el proceso):
  - Caché LRU + TTL: se acotan por `max_engines` (evicción del menos usado) y por
    `idle_ttl` (evicción por inactividad). La evicción **nunca** toca motores con
    descargas en curso (refcount > 0).
  - Fijado (pin) por refcount: el worker toma un motor con `acquire()` y lo suelta
    con `release()`; así una descarga larga no puede ser evictada a mitad.
  - Refresco de token: `get_authenticated` re-persiste los tokens cifrados si
    `check_auth` refrescó el access_token (si no, el token nuevo se perdería al
    reiniciar), respetando el `kind` (los tokens PKCE se re-guardan como PKCE).

Toda la mutación del estado de la caché ocurre en el hilo del event loop y se
protege con un `asyncio.Lock`; las llamadas potencialmente bloqueantes al motor
(`TidalDownloader(...)`, `check_auth`, `_cleanup_temp_dir`) se derivan a un hilo.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from pathlib import Path

from app.core import user_session as us
from app.core.logging_config import get_logger
from app.core.tidal import TidalDownloader

logger = get_logger(__name__)


def _cache_key(uid: str, kind: str) -> str:
    """Clave de caché por usuario y tipo de sesión (``oauth`` | ``pkce``)."""
    return f"{kind}:{uid}"


@dataclass
class _Entry:
    engine: TidalDownloader
    last_access: float = field(default_factory=time.monotonic)
    refcount: int = 0
    # Momento de la última validación **contra Tidal** (0 = nunca). Ver
    # `EngineRegistry.auth_recheck_interval`.
    last_auth_check: float = 0.0

    def touch(self) -> None:
        self.last_access = time.monotonic()


class EngineRegistry:
    """Caché de motores Tidal por (usuario, kind) con evicción LRU/TTL y limpieza de temp."""

    def __init__(
        self,
        max_engines: int = 50,
        idle_ttl: int = 1800,
        auth_recheck_interval: int = 60,
        download_dir: str = "",
    ) -> None:
        self.max_engines = max_engines
        self.idle_ttl = idle_ttl
        # Carpeta persistente donde caen las descargas. Cada usuario tiene la suya
        # dentro: la ruta no es una frontera de autorización (esa es
        # `assert_job_owner`), pero evita que dos usuarios que bajan el mismo
        # álbum se pisen los ficheros. Vacío = directorio temporal por motor,
        # que es lo que había y borra la música al evictar.
        self.download_dir = download_dir
        # `check_auth()` llama a `session.check_login()`, que es **una petición HTTP
        # a Tidal**. Como es una dependencia de todos los endpoints autenticados, se
        # pagaba una vez por petición: medido en 0.F, un suelo de ~130 ms incluso
        # cuando la respuesta salía de la caché de Redis, y —peor— una llamada al
        # `client_id` compartido por cada vista, justo lo que la caché de la Fase 4
        # existe para evitar. Revalidar cada N segundos por motor mantiene la
        # detección de sesiones muertas (el fallo real sale igual como 401 de la
        # petición siguiente) sin repetir el viaje. 0 = comportamiento anterior.
        self.auth_recheck_interval = auth_recheck_interval
        self._engines: dict[str, _Entry] = {}
        self._lock = asyncio.Lock()

    # ── Creación perezosa ────────────────────────────────────────────────────
    async def _create_engine(self, redis, uid: str, kind: str) -> TidalDownloader | None:
        tokens = await us.get_user_tokens(redis, uid, kind)
        if not tokens:
            return None
        # Construcción del motor: crea un temp dir y detecta ffmpeg (E/S local) →
        # a un hilo para no bloquear el event loop. is_pkce=True hace que tidalapi
        # refresque el token con el cliente PKCE (necesario para el 16-bit).
        return await asyncio.to_thread(
            TidalDownloader,
            log_callback=lambda msg, _uid=uid: logger.debug("engine[%s]: %s", _uid, msg),
            session_data=tokens,
            is_pkce=(kind == "pkce"),
            download_dir=self._user_download_dir(uid),
        )

    def _user_download_dir(self, uid: str) -> str | None:
        """Carpeta del usuario dentro de la de descargas, o None si no hay."""
        if not self.download_dir:
            return None
        # `uid` viene de Tidal (numérico) o es sintético en pruebas; se sanea de
        # todos modos porque acaba siendo un nombre de carpeta.
        safe_uid = "".join(c for c in str(uid) if c.isalnum() or c in "-_") or "unknown"
        return str(Path(self.download_dir) / safe_uid)

    async def get(self, redis, uid: str, kind: str = "oauth") -> TidalDownloader | None:
        """Devuelve el motor del usuario (creándolo si hace falta), o None sin tokens."""
        ck = _cache_key(uid, kind)
        async with self._lock:
            entry = self._engines.get(ck)
            if entry is not None:
                entry.touch()
                return entry.engine

        engine = await self._create_engine(redis, uid, kind)
        if engine is None:
            return None

        async with self._lock:
            # Otra corrutina pudo crearlo mientras liberábamos el lock: descartar
            # el nuestro (y su temp dir) y devolver el ya cacheado.
            existing = self._engines.get(ck)
            if existing is not None:
                await asyncio.to_thread(engine._cleanup_temp_dir)
                existing.touch()
                return existing.engine
            self._engines[ck] = _Entry(engine)
            await self._evict_locked()
            return engine

    async def get_authenticated(
        self, redis, uid: str, kind: str = "oauth"
    ) -> TidalDownloader | None:
        """Motor del usuario verificando/refrescando la sesión Tidal.

        Devuelve None si no hay tokens o la sesión no puede autenticarse. Si
        `check_auth` refresca el access_token, re-persiste los tokens cifrados
        bajo el mismo `kind`.
        """
        engine = await self.get(redis, uid, kind)
        if engine is None:
            return None

        # Validación reciente → se ahorra el viaje a Tidal (ver auth_recheck_interval).
        ck = _cache_key(uid, kind)
        now = time.monotonic()
        if self.auth_recheck_interval > 0:
            async with self._lock:
                entry = self._engines.get(ck)
                if entry is not None and now - entry.last_auth_check < self.auth_recheck_interval:
                    return engine

        token_before = getattr(engine.session, "access_token", None)
        ok = await asyncio.to_thread(engine.check_auth)
        if not ok:
            return None
        token_after = getattr(engine.session, "access_token", None)
        if token_after and token_after != token_before:
            token_data = us.token_data_from_session(engine.session)
            await us.store_user_tokens(redis, uid, kind, token_data)

        async with self._lock:
            entry = self._engines.get(ck)
            if entry is not None:
                entry.last_auth_check = time.monotonic()
        return engine

    # ── Fijado (worker) ──────────────────────────────────────────────────────
    async def acquire(self, redis, uid: str, kind: str = "oauth") -> TidalDownloader | None:
        """Toma el motor autenticado del usuario y lo fija (no evictable) hasta release()."""
        engine = await self.get_authenticated(redis, uid, kind)
        if engine is None:
            return None
        ck = _cache_key(uid, kind)
        async with self._lock:
            entry = self._engines.get(ck)
            if entry is None:
                # Evictado en una carrera: re-registrar el motor que tenemos en mano.
                entry = _Entry(engine)
                self._engines[ck] = entry
            entry.refcount += 1
            entry.touch()
        return engine

    async def release(self, uid: str, kind: str = "oauth") -> None:
        ck = _cache_key(uid, kind)
        async with self._lock:
            entry = self._engines.get(ck)
            if entry is not None and entry.refcount > 0:
                entry.refcount -= 1
                entry.touch()

    # ── Evicción ─────────────────────────────────────────────────────────────
    async def _evict_locked(self) -> None:
        """Evicta motores ociosos (TTL) y aplica el tope LRU. Requiere el lock tomado."""
        now = time.monotonic()
        # 1) TTL: fuera los ociosos sin descargas en curso.
        stale = [
            key
            for key, e in self._engines.items()
            if e.refcount == 0 and now - e.last_access > self.idle_ttl
        ]
        for key in stale:
            await self._remove_locked(key)

        # 2) LRU: si excede el tope, evicta el menos-recientemente-usado (refcount 0).
        while len(self._engines) > self.max_engines:
            candidates = [(key, e) for key, e in self._engines.items() if e.refcount == 0]
            if not candidates:
                break  # todos en uso: no forzar
            lru_key = min(candidates, key=lambda kv: kv[1].last_access)[0]
            await self._remove_locked(lru_key)

    async def _remove_locked(self, key: str) -> None:
        entry = self._engines.pop(key, None)
        if entry is not None:
            await asyncio.to_thread(entry.engine._cleanup_temp_dir)
            logger.debug("engine[%s] evicted", key)

    # ── Invalidación / apagado ───────────────────────────────────────────────
    async def invalidate(self, uid: str, kind: str = "oauth") -> None:
        """Descarta el motor de un usuario (p.ej. logout total / tokens revocados)."""
        async with self._lock:
            await self._remove_locked(_cache_key(uid, kind))

    async def cleanup_all(self) -> None:
        """Limpia todos los motores y sus directorios temporales (shutdown)."""
        async with self._lock:
            for key in list(self._engines.keys()):
                await self._remove_locked(key)

    def size(self) -> int:
        return len(self._engines)
