"""Aforo de WebSockets de progreso (Fase 0.F).

Cada conexión retiene una suscripción Pub/Sub, o sea **una conexión de Redis
mientras la pestaña siga abierta**. Medido en 0.F: con el pool único que había,
99 conexiones lo agotaban y a partir de ahí `/session/status` y `/history`
devolvían 500 — la sala llena tumbaba toda la API. Ahora hay dos defensas y estos
tests las fijan:

1. Las suscripciones salen de un cliente Redis **aparte** (`redis_pubsub`), así
   que nunca compiten con los comandos por el pool principal.
2. Hay un **aforo explícito** (`ws_max_connections`): al llenarse se cierra con
   1013 (Try Again Later) en vez de reventar el handshake con un 500.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config import settings
from app.main import app
from app.modules.download import ws as ws_module

# ─── Utilidades ───────────────────────────────────────────────────────────────


def _make_pubsub() -> MagicMock:
    ps = MagicMock()
    ps.subscribe = AsyncMock()
    ps.unsubscribe = AsyncMock()
    ps.aclose = AsyncMock()

    async def _get_message(
        ignore_subscribe_messages: bool = False, timeout: float | None = None
    ) -> None:
        await asyncio.sleep(0.01)
        return None

    ps.get_message = _get_message
    return ps


def _setup(*, authenticated: bool = True, separate_pubsub_client: bool = True) -> TestClient:
    commands = MagicMock()
    commands.pubsub = MagicMock(return_value=_make_pubsub())
    app.state.redis = commands

    if separate_pubsub_client:
        subs = MagicMock()
        subs.pubsub = MagicMock(return_value=_make_pubsub())
        app.state.redis_pubsub = subs
    elif hasattr(app.state, "redis_pubsub"):
        delattr(app.state, "redis_pubsub")

    engine = MagicMock()
    engine.check_auth = MagicMock(return_value=authenticated)
    app.state.engine = engine
    return TestClient(app)


def _close_code(ws) -> int | None:
    try:
        ws.receive_json()
    except WebSocketDisconnect as exc:
        return exc.code
    return None


def _reset_counter() -> None:
    ws_module._ws_connections = 0


# ─── Tests ────────────────────────────────────────────────────────────────────


class TestCapacity:
    def test_rejects_with_1013_when_full(self) -> None:
        """Sala llena → cierre 1013, no un 500 del handshake."""
        _reset_counter()
        client = _setup()
        original = settings.ws_max_connections
        settings.ws_max_connections = 1
        try:
            with client.websocket_connect("/ws/downloads"):
                with client.websocket_connect("/ws/downloads") as second:
                    assert _close_code(second) == 1013
        finally:
            settings.ws_max_connections = original
            _reset_counter()

    def test_slot_is_released_on_disconnect(self) -> None:
        """Al colgar se libera el hueco: si no, el aforo se llenaría de fantasmas."""
        _reset_counter()
        client = _setup()
        original = settings.ws_max_connections
        settings.ws_max_connections = 1
        try:
            with client.websocket_connect("/ws/downloads"):
                pass
            # El mismo hueco vuelve a estar disponible para el siguiente.
            with client.websocket_connect("/ws/downloads") as second:
                assert _close_code(second) != 1013
        finally:
            settings.ws_max_connections = original
            _reset_counter()

    def test_slot_is_released_when_auth_fails(self) -> None:
        """Un rechazo por sesión inválida tampoco puede dejar el hueco ocupado."""
        _reset_counter()
        client = _setup(authenticated=False)
        original = settings.ws_max_connections
        settings.ws_max_connections = 1
        try:
            with client.websocket_connect("/ws/downloads") as first:
                assert _close_code(first) == 1008
            assert ws_module._ws_connections == 0
        finally:
            settings.ws_max_connections = original
            _reset_counter()

    def test_rejection_is_counted(self) -> None:
        _reset_counter()
        client = _setup()
        from app.core import metrics

        before = metrics.ws_connections_rejected_total._value.get()
        original = settings.ws_max_connections
        settings.ws_max_connections = 1
        try:
            with client.websocket_connect("/ws/downloads"):
                with client.websocket_connect("/ws/downloads") as second:
                    _close_code(second)
            assert metrics.ws_connections_rejected_total._value.get() == before + 1
        finally:
            settings.ws_max_connections = original
            _reset_counter()


class TestPubsubIsolation:
    def test_subscription_uses_the_dedicated_client(self) -> None:
        """La suscripción sale de `redis_pubsub`, no del pool de comandos.

        Es lo que impide que una sala llena agote el pool que usan sesión,
        cuotas y caché — el fallo real medido en 0.F.
        """
        _reset_counter()
        client = _setup()
        with client.websocket_connect("/ws/downloads"):
            pass
        app.state.redis_pubsub.pubsub.assert_called()
        app.state.redis.pubsub.assert_not_called()

    def test_falls_back_to_the_main_client(self) -> None:
        """Sin `redis_pubsub` montado (tests antiguos) se sigue funcionando."""
        _reset_counter()
        client = _setup(separate_pubsub_client=False)
        with client.websocket_connect("/ws/downloads"):
            pass
        app.state.redis.pubsub.assert_called()
