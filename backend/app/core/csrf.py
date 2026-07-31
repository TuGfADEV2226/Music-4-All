"""Defensa contra *login CSRF* en el endpoint que emite la cookie de sesión.

``SameSite=Lax`` impide que la cookie de sesión **viaje** en peticiones cross-site,
pero no impide que una respuesta cross-site la **fije**. El polling del device flow
(``/session/device-auth/{device_code}``) es el único endpoint que crea sesión sin
exigir una previa: si un atacante autoriza un código con *su* cuenta Tidal y luego
consigue que el navegador de la víctima cargue esa URL (basta un ``<img>`` en
cualquier página), la víctima acaba navegando con la sesión del atacante, y sus
búsquedas y descargas van a parar a un historial ajeno. CORS no lo evita: el
atacante no necesita leer la respuesta, solo provocarla.

El guard se apoya en ``Sec-Fetch-Site``, que pone el navegador y la página atacante
no puede falsear, con ``Origin`` como respaldo. Los clientes que no son navegadores
(tests, curl, un cliente móvil) no mandan ninguna de las dos y pasan sin más: el
ataque solo existe dentro de un navegador.
"""

from __future__ import annotations

from fastapi import Request

from app.config import settings
from app.core.exceptions import ApiException

# same-origin/same-site: la petición sale de la propia app. "none" es una navegación
# iniciada por la persona (barra de direcciones, marcador), que un atacante tampoco
# puede provocar desde su página. Solo "cross-site" delata el ataque.
_SAFE_FETCH_SITES = frozenset({"same-origin", "same-site", "none"})


def _blocked() -> ApiException:
    return ApiException(
        code="CROSS_SITE_BLOCKED",
        message="Petición cross-site bloqueada.",
        http_status=403,
        retriable=False,
    )


def assert_not_cross_site(request: Request) -> None:
    """Rechaza (403) la petición si el navegador declara que viene de otro sitio."""
    fetch_site = request.headers.get("sec-fetch-site")
    if fetch_site:
        if fetch_site.strip().lower() not in _SAFE_FETCH_SITES:
            raise _blocked()
        return

    # Navegadores sin Sec-Fetch-Metadata (Safari < 16.4): en una petición cross-site
    # de este tipo sí mandan Origin, y el nuestro no estaría en la lista de CORS.
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        raise _blocked()
