"""Guard anti login-CSRF del polling del device flow (`app/core/csrf.py`).

El endpoint que emite la cookie de sesión es el único que crea sesión sin tener
una: si se pudiera provocar desde otro sitio, un atacante podría dejar a la
víctima navegando con la sesión de él. Ver el docstring del módulo.
"""

from __future__ import annotations

import pytest
from starlette.requests import Request

from app.core.csrf import assert_not_cross_site
from app.core.exceptions import ApiException


def _request(headers: dict[str, str]) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "method": "GET", "path": "/", "headers": raw})


@pytest.mark.parametrize("site", ["same-origin", "same-site", "none", "Same-Origin"])
def test_browser_requests_from_our_own_site_pass(site):
    # No lanza = pasa.
    assert_not_cross_site(_request({"sec-fetch-site": site}))


def test_cross_site_browser_request_is_blocked():
    with pytest.raises(ApiException) as exc:
        assert_not_cross_site(_request({"sec-fetch-site": "cross-site"}))
    assert exc.value.http_status == 403
    assert exc.value.code == "CROSS_SITE_BLOCKED"


def test_non_browser_clients_pass():
    # Sin Sec-Fetch-Site ni Origin (curl, tests, un cliente móvil): el ataque solo
    # existe dentro de un navegador, así que no hay nada que bloquear.
    assert_not_cross_site(_request({}))


def test_foreign_origin_is_blocked_without_sec_fetch_site():
    # Navegador antiguo (sin Sec-Fetch-Metadata) pero que sí manda Origin.
    with pytest.raises(ApiException):
        assert_not_cross_site(_request({"origin": "https://evil.example"}))


def test_known_origin_passes_without_sec_fetch_site():
    from app.config import settings

    assert_not_cross_site(_request({"origin": settings.cors_origins[0]}))


def test_poll_endpoint_rejects_cross_site_request(api_client_with_state):
    resp = api_client_with_state.get(
        "/session/device-auth/some-device-code",
        headers={"sec-fetch-site": "cross-site"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "CROSS_SITE_BLOCKED"
