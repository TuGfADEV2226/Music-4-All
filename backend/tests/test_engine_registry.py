"""Tests del EngineRegistry (motor Tidal por usuario, caché LRU/TTL + refcount)."""

from __future__ import annotations

import time
from types import SimpleNamespace

import fakeredis.aioredis
import pytest

import app.core.engine_registry as er
from app.core import user_session as us


class FakeEngine:
    """Doble de TidalDownloader: registra construcción, auth y limpieza de temp."""

    instances: list[FakeEngine] = []

    def __init__(self, log_callback=None, session_data=None, is_pkce=False):
        self.session_data = session_data or {}
        self.session = SimpleNamespace(access_token=self.session_data.get("access_token"))
        self.is_pkce = is_pkce
        self.cleaned = False
        self._auth_ok = True
        self._refresh_to: str | None = None
        FakeEngine.instances.append(self)

    def check_auth(self) -> bool:
        # Simula un refresco in-place del access_token si se configuró.
        if self._refresh_to is not None:
            self.session.access_token = self._refresh_to
        return self._auth_ok

    def _cleanup_temp_dir(self) -> None:
        self.cleaned = True


@pytest.fixture(autouse=True)
def _patch_engine(monkeypatch):
    FakeEngine.instances = []
    monkeypatch.setattr(er, "TidalDownloader", FakeEngine)
    yield


@pytest.fixture
async def redis():
    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield client
    await client.aclose()


async def _store(redis, uid: str, access: str = "tok"):
    await us.store_user_tokens(
        redis, uid, "oauth", {"access_token": access, "refresh_token": "r", "token_type": "Bearer"}
    )


# ── Creación perezosa + caché ─────────────────────────────────────────────────
async def test_get_returns_none_without_tokens(redis):
    reg = er.EngineRegistry()
    assert await reg.get(redis, "nouser") is None


async def test_get_creates_and_caches(redis):
    await _store(redis, "u1")
    reg = er.EngineRegistry()
    e1 = await reg.get(redis, "u1")
    e2 = await reg.get(redis, "u1")
    assert e1 is e2  # misma instancia cacheada
    assert len(FakeEngine.instances) == 1
    assert reg.size() == 1


# ── get_authenticated + refresco ──────────────────────────────────────────────
async def test_get_authenticated_none_when_auth_fails(redis):
    await _store(redis, "u2")
    reg = er.EngineRegistry()
    engine = await reg.get(redis, "u2")
    engine._auth_ok = False
    assert await reg.get_authenticated(redis, "u2") is None


async def test_get_authenticated_repersists_refreshed_token(redis):
    await _store(redis, "u3", access="old")
    reg = er.EngineRegistry()
    engine = await reg.get(redis, "u3")
    engine._refresh_to = "new"  # check_auth cambiará el access_token
    result = await reg.get_authenticated(redis, "u3")
    assert result is engine
    stored = await us.get_user_tokens(redis, "u3", "oauth")
    assert stored["access_token"] == "new"  # re-persistido cifrado


# ── Evicción por TTL ──────────────────────────────────────────────────────────
async def test_idle_engine_evicted_and_cleaned(redis):
    await _store(redis, "old")
    await _store(redis, "fresh")
    reg = er.EngineRegistry(max_engines=50, idle_ttl=1800)
    old_engine = await reg.get(redis, "old")
    # Envejecer artificialmente la entrada "old".
    reg._engines["oauth:old"].last_access = time.monotonic() - 10_000
    # Crear otro motor dispara la evicción por TTL.
    await reg.get(redis, "fresh")
    assert "oauth:old" not in reg._engines
    assert "oauth:fresh" in reg._engines
    assert old_engine.cleaned is True


# ── Tope LRU ──────────────────────────────────────────────────────────────────
async def test_lru_cap_evicts_least_recently_used(redis):
    await _store(redis, "a")
    await _store(redis, "b")
    reg = er.EngineRegistry(max_engines=1, idle_ttl=1800)
    ea = await reg.get(redis, "a")
    await reg.get(redis, "b")
    assert "oauth:a" not in reg._engines  # LRU evictado
    assert "oauth:b" in reg._engines
    assert ea.cleaned is True


# ── Fijado (refcount) ─────────────────────────────────────────────────────────
async def test_pinned_engine_not_evicted(redis):
    await _store(redis, "pinned")
    await _store(redis, "other")
    reg = er.EngineRegistry(max_engines=1, idle_ttl=1800)
    pinned = await reg.acquire(redis, "pinned")  # refcount = 1
    assert pinned is not None
    await reg.get(redis, "other")  # sobre el tope, pero no puede evictar al fijado
    assert "oauth:pinned" in reg._engines
    assert pinned.cleaned is False


async def test_release_unpins(redis):
    await _store(redis, "u")
    reg = er.EngineRegistry()
    await reg.acquire(redis, "u")
    assert reg._engines["oauth:u"].refcount == 1
    await reg.release("u")
    assert reg._engines["oauth:u"].refcount == 0


async def test_cleanup_all_clears_everything(redis):
    await _store(redis, "x")
    await _store(redis, "y")
    reg = er.EngineRegistry()
    ex = await reg.get(redis, "x")
    ey = await reg.get(redis, "y")
    await reg.cleanup_all()
    assert reg.size() == 0
    assert ex.cleaned and ey.cleaned


async def test_invalidate_removes_single_user(redis):
    await _store(redis, "z")
    reg = er.EngineRegistry()
    ez = await reg.get(redis, "z")
    await reg.invalidate("z")
    assert "oauth:z" not in reg._engines
    assert ez.cleaned is True


# ── Segunda sesión PKCE (16-bit): convive con la oauth sin pisarse ────────────
async def test_pkce_and_oauth_engines_coexist(redis):
    await us.store_user_tokens(
        redis, "dual", "oauth", {"access_token": "o", "refresh_token": "r", "token_type": "Bearer"}
    )
    await us.store_user_tokens(
        redis, "dual", "pkce", {"access_token": "p", "refresh_token": "r", "token_type": "Bearer"}
    )
    reg = er.EngineRegistry()

    e_oauth = await reg.get(redis, "dual", "oauth")
    e_pkce = await reg.get(redis, "dual", "pkce")

    assert e_oauth is not e_pkce  # motores distintos, cacheados por separado
    assert e_oauth.is_pkce is False
    assert e_pkce.is_pkce is True  # tidalapi refrescará con el cliente PKCE
    assert "oauth:dual" in reg._engines
    assert "pkce:dual" in reg._engines
    assert reg.size() == 2


async def test_pkce_engine_none_without_pkce_tokens(redis):
    # Tiene sesión oauth pero no ha conectado la Hi-Fi: el motor pkce no existe.
    await _store(redis, "only_oauth")
    reg = er.EngineRegistry()
    assert await reg.get(redis, "only_oauth", "pkce") is None
    assert await reg.acquire(redis, "only_oauth", "pkce") is None


# ── Revalidación de sesión: no una llamada a Tidal por petición ───────────────
# `check_auth()` es `session.check_login()`, o sea una petición HTTP a Tidal, y
# es dependencia de todos los endpoints autenticados. Medido en la Fase 0.F:
# ~130 ms de suelo por petición aunque la respuesta saliera de la caché, y una
# llamada al client_id compartido por cada vista.


class CountingEngine(FakeEngine):
    """Cuenta cuántas veces se valida la sesión contra Tidal."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.auth_calls = 0

    def check_auth(self) -> bool:
        self.auth_calls += 1
        return super().check_auth()


@pytest.fixture
def counting_engine(monkeypatch):
    FakeEngine.instances = []
    monkeypatch.setattr(er, "TidalDownloader", CountingEngine)
    return FakeEngine.instances


async def test_auth_is_not_rechecked_within_the_interval(redis, counting_engine):
    await _store(redis, "u_recheck")
    reg = er.EngineRegistry(auth_recheck_interval=60)

    for _ in range(5):
        assert await reg.get_authenticated(redis, "u_recheck") is not None

    assert counting_engine[0].auth_calls == 1  # una sola vez, no cinco


async def test_auth_is_rechecked_once_the_interval_passes(redis, counting_engine):
    await _store(redis, "u_expire")
    reg = er.EngineRegistry(auth_recheck_interval=60)

    await reg.get_authenticated(redis, "u_expire")
    # Envejece la marca de la última validación en lugar de esperar de verdad.
    reg._engines["oauth:u_expire"].last_auth_check -= 61
    await reg.get_authenticated(redis, "u_expire")

    assert counting_engine[0].auth_calls == 2


async def test_interval_zero_checks_every_time(redis, counting_engine):
    """Escotilla de escape: con 0 se recupera el comportamiento anterior."""
    await _store(redis, "u_always")
    reg = er.EngineRegistry(auth_recheck_interval=0)

    for _ in range(3):
        await reg.get_authenticated(redis, "u_always")

    assert counting_engine[0].auth_calls == 3


async def test_failed_auth_is_not_cached(redis, counting_engine):
    """Una sesión muerta no debe quedar validada durante el intervalo."""
    await _store(redis, "u_dead")
    reg = er.EngineRegistry(auth_recheck_interval=60)

    engine = await reg.get(redis, "u_dead")
    engine._auth_ok = False

    assert await reg.get_authenticated(redis, "u_dead") is None
    assert await reg.get_authenticated(redis, "u_dead") is None
    assert engine.auth_calls == 2  # se reintenta, no se da por buena
