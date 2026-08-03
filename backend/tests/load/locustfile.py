"""Pruebas de carga con Locust para Music 4 All.

Mide la API **v2 autenticada**, que es la que usa el frontend. La versión previa
no servía para nada: `AuthenticatedUser` no tenía sesión (`on_start: pass`), así
que todas sus peticiones devolvían 401, y golpeaba rutas legacy
(`/metadata/search`, `/auth/status`) que el frontend ya no usa.

Requisito: sembrar sesiones antes (ver `seed_sessions.py`). El fichero de sids se
pasa por `LOADTEST_SIDS` (por defecto `/tmp/loadtest_sids.txt`) y cada usuario
simulado toma uno, de modo que cuotas, rate-limit e historial se ejerciten por
usuario y no todos contra el mismo.

    # 1) sembrar (dentro del contenedor del backend)
    docker compose exec backend /app/.venv/bin/python tests/load/seed_sessions.py \
        --source-user <uid> --count 20 --out /tmp/loadtest_sids.txt
    docker compose exec backend cat /tmp/loadtest_sids.txt > backend/loadtest_sids.txt

    # 2) cargar (desde el host)
    cd backend
    LOADTEST_SIDS=loadtest_sids.txt uv run locust -f tests/load/locustfile.py \
        --host http://localhost:8000 --headless -u 20 -r 5 --run-time 2m

    # 3) limpiar
    docker compose exec backend /app/.venv/bin/python tests/load/seed_sessions.py --purge

## Qué se mide y qué NO, a propósito

- **Búsqueda y detalle**: desde un conjunto **pequeño y fijo** de consultas. El
  catálogo de Tidal se cachea en Redis (Fase 4), así que la carga golpea la
  caché, que es el escenario real cuando hay varios usuarios. Hacer consultas
  únicas mediría a Tidal, no a nosotros, y el `client_id` es compartido: es el
  riesgo transversal del proyecto, no se martillea.
- **Descargas**: se encolan y se **cancelan acto seguido**. Lo caro (streaming +
  ffmpeg) no se multiplica; lo que se ejercita es el camino de encolado, que es
  donde viven la cuota, el rate-limit y la escritura del job. Con
  `LOADTEST_KEEP_DOWNLOADS=1` no se cancelan, para medir el worker de verdad —
  usar solo con pocos usuarios y a sabiendas de que bajan ficheros reales.
- **Los 429 no son fallos**: la cuota por usuario (3 concurrentes / 50 al día) y
  el rate-limit son el comportamiento que se quiere comprobar bajo carga. Se
  cuentan aparte, no como error.
"""

from __future__ import annotations

import os
import random
from pathlib import Path

from locust import HttpUser, between, events, task

# ─── Configuración ────────────────────────────────────────────────────────────

SIDS_FILE = Path(os.getenv("LOADTEST_SIDS", "/tmp/loadtest_sids.txt"))
KEEP_DOWNLOADS = os.getenv("LOADTEST_KEEP_DOWNLOADS") == "1"

# Conjunto fijo: la segunda petición y siguientes salen de la caché de Redis.
QUERIES = ["Pink Floyd", "Daft Punk", "Radiohead", "System of a Down", "Bohemian Rhapsody"]

# IDs **reales** del catálogo de Tidal. Comprobados contra la API: los del
# fixture de los e2e son inventados y aquí darían 404 en `/albums/{id}` y un 500
# en `/downloads`, midiendo el camino de error en vez del real.
ALBUM_IDS = ["20115556"]  # Random Access Memories — Daft Punk
ARTIST_IDS = ["8847"]  # Daft Punk

_sids: list[str] = []


@events.test_start.add_listener
def _load_sids(**_kwargs) -> None:
    """Carga los sids una vez al arrancar; sin ellos la campaña no mide nada."""
    if not SIDS_FILE.exists():
        raise SystemExit(
            f"No existe {SIDS_FILE}. Siembra sesiones primero:\n"
            "  docker compose exec backend /app/.venv/bin/python "
            "tests/load/seed_sessions.py --source-user <uid> --count 20"
        )
    _sids.extend(s.strip() for s in SIDS_FILE.read_text(encoding="utf-8").splitlines() if s.strip())
    if not _sids:
        raise SystemExit(f"{SIDS_FILE} está vacío.")
    print(f"[loadtest] {len(_sids)} sesiones disponibles")


# ─── Usuarios ─────────────────────────────────────────────────────────────────


class AnonymousUser(HttpUser):
    """Tráfico que no requiere sesión: sondas de salud y métricas."""

    weight = 1
    wait_time = between(1, 3)

    @task(5)
    def health(self):
        self.client.get("/health", name="/health")

    @task(1)
    def metrics(self):
        self.client.get("/metrics", name="/metrics")


class BrowsingUser(HttpUser):
    """Navegación autenticada: lo que hace un usuario mirando el catálogo."""

    weight = 8
    wait_time = between(2, 5)

    def on_start(self):
        # Un sid por usuario simulado: así cada uno tiene su cuota y su rate-limit.
        self.client.cookies.set("m4a_sid", random.choice(_sids))

    @task(10)
    def search(self):
        self.client.get(
            "/search",
            params={"q": random.choice(QUERIES), "limit": 20},
            name="/search",
        )

    @task(4)
    def album_detail(self):
        self.client.get(f"/albums/{random.choice(ALBUM_IDS)}", name="/albums/{id}")

    @task(3)
    def artist_detail(self):
        self.client.get(f"/artists/{random.choice(ARTIST_IDS)}", name="/artists/{id}")

    @task(3)
    def history(self):
        self.client.get("/history", name="/history")

    @task(2)
    def history_stats(self):
        self.client.get("/history/stats", name="/history/stats")

    @task(2)
    def session_status(self):
        self.client.get("/session/status", name="/session/status")

    @task(1)
    def keepalive(self):
        self.client.post("/session/keepalive", name="/session/keepalive")


class DownloadUser(HttpUser):
    """Encola descargas y las cancela: ejercita cuota, rate-limit y cola."""

    weight = 2
    wait_time = between(5, 10)

    def on_start(self):
        self.client.cookies.set("m4a_sid", random.choice(_sids))

    @task
    def enqueue_and_cancel(self):
        with self.client.post(
            "/downloads",
            json={"album_id": random.choice(ALBUM_IDS), "quality": "NORMAL"},
            name="/downloads [POST]",
            catch_response=True,
        ) as response:
            # 429 = cuota o rate-limit. Es la defensa haciendo su trabajo, no un
            # fallo: marcarlo como error escondería los fallos de verdad.
            if response.status_code == 429:
                response.success()
                return
            if response.status_code != 200:
                response.failure(f"HTTP {response.status_code}: {response.text[:200]}")
                return
            response.success()
            job_id = response.json().get("job_id")

        if job_id and not KEEP_DOWNLOADS:
            self.client.delete(f"/downloads/{job_id}", name="/downloads/{id} [DELETE]")
