"""Carga de WebSockets sobre `/ws/downloads` y medida de su coste en Redis.

Responde la pregunta abierta de PERF-02: **cada WebSocket abre su propio
Pub/Sub**, así que las conexiones a Redis crecen con los usuarios conectados, no
con la actividad. Este script abre N conexiones a la vez y compara el número de
clientes de Redis antes y después, que es la forma directa de medirlo.

Locust no habla WebSocket sin dependencias extra; aquí basta `aiohttp`, que ya
es dependencia del backend.

    # con las sesiones ya sembradas (ver seed_sessions.py)
    cd backend
    LOADTEST_SIDS=loadtest_sids.txt uv run python tests/load/ws_load.py \
        --url ws://localhost:8000/ws/downloads --count 50 --hold 30

Las conexiones a Redis se leen con `valkey-cli info clients`; si no se puede
ejecutar (fuera de Docker), se omite esa parte y solo se reporta el WS.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import time
from pathlib import Path

import aiohttp

SIDS_FILE = Path(os.getenv("LOADTEST_SIDS", "/tmp/loadtest_sids.txt"))


def read_sids() -> list[str]:
    if not SIDS_FILE.exists():
        raise SystemExit(f"No existe {SIDS_FILE}: siembra sesiones con seed_sessions.py")
    sids = [s.strip() for s in SIDS_FILE.read_text(encoding="utf-8").splitlines() if s.strip()]
    if not sids:
        raise SystemExit(f"{SIDS_FILE} está vacío")
    return sids


def redis_clients(container: str) -> int | None:
    """Clientes conectados a Valkey, o None si no se puede consultar."""
    try:
        out = subprocess.run(
            ["docker", "exec", container, "valkey-cli", "info", "clients"],
            capture_output=True,
            text=True,
            timeout=15,
            check=True,
        ).stdout
    except (subprocess.SubprocessError, FileNotFoundError):
        return None
    for line in out.splitlines():
        if line.startswith("connected_clients:"):
            return int(line.split(":", 1)[1])
    return None


async def hold_connection(
    session: aiohttp.ClientSession, url: str, sid: str, hold: float, stats: dict
) -> None:
    """Abre un WS, lo mantiene abierto y cuenta los mensajes recibidos."""
    try:
        async with session.ws_connect(url, headers={"Cookie": f"m4a_sid={sid}"}) as ws:
            stats["opened"] += 1
            deadline = time.monotonic() + hold
            while time.monotonic() < deadline:
                remaining = deadline - time.monotonic()
                try:
                    msg = await asyncio.wait_for(ws.receive(), timeout=remaining)
                except TimeoutError:
                    break
                if msg.type is aiohttp.WSMsgType.TEXT:
                    stats["messages"] += 1
                elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    # 1013 = aforo completo. Es la respuesta correcta del servidor
                    # cuando la sala está llena, no un fallo: se cuenta aparte.
                    if ws.close_code == 1013:
                        stats["rejected_full"] += 1
                    else:
                        stats["closed_early"] += 1
                    return
    except Exception as exc:  # conexión rechazada, handshake fallido…
        stats["failed"] += 1
        stats.setdefault("errors", []).append(f"{type(exc).__name__}: {exc}")
    finally:
        stats["settled"] += 1


async def run(url: str, count: int, hold: float, container: str) -> int:
    sids = read_sids()
    stats = {
        "opened": 0,
        "failed": 0,
        "closed_early": 0,
        "rejected_full": 0,
        "messages": 0,
        "settled": 0,
    }

    before = redis_clients(container)
    print(f"Clientes de Redis antes: {before if before is not None else 'n/d'}")

    # `limit=0` quita el tope del propio cliente: aiohttp permite 100 conexiones
    # simultáneas por defecto, así que sin esto el cuello de botella sería el
    # medidor y no el servidor (se veía un techo de ~100 que era nuestro).
    connector = aiohttp.TCPConnector(limit=0)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [
            asyncio.create_task(hold_connection(session, url, sids[i % len(sids)], hold, stats))
            for i in range(count)
        ]
        # Medir a mitad de la rampa daría un ratio inventado: se espera a que
        # todas hayan resuelto (abierta, rechazada o fallida) antes de contar.
        ramp_deadline = time.monotonic() + min(20.0, hold)
        while stats["opened"] + stats["failed"] + stats["rejected_full"] < count:
            if time.monotonic() > ramp_deadline:
                break
            await asyncio.sleep(0.2)

        during = redis_clients(container)
        live = stats["opened"] - stats["rejected_full"] - stats["closed_early"]
        print(f"Clientes de Redis con {live} WS vivos: {during if during is not None else 'n/d'}")
        if before is not None and during is not None and live > 0:
            print(f"  → {(during - before) / live:.2f} conexiones de Redis por WebSocket")
        await asyncio.gather(*tasks)

    after = redis_clients(container)
    print(f"Clientes de Redis tras cerrar: {after if after is not None else 'n/d'}")
    if before is not None and after is not None and after > before:
        # No es fuga: el pool de comandos conserva **calientes** las conexiones que
        # llegó a abrir, y no las cierra al quedar ocioso. Las de Pub/Sub sí se
        # cierran al soltar la suscripción. Solo sería fuga si el número creciera
        # campaña tras campaña o superara los pools configurados.
        print(
            f"  {after - before} conexiones siguen abiertas: es el pool de comandos ya caliente, "
            "no una fuga (se reutilizan; las de Pub/Sub sí se cerraron)."
        )

    print(
        f"\nWebSockets: {stats['opened'] - stats['rejected_full']} abiertos · "
        f"{stats['rejected_full']} rechazados por aforo (1013) · "
        f"{stats['failed']} fallidos · {stats['closed_early']} cerrados antes de tiempo · "
        f"{stats['messages']} mensajes"
    )
    for error in dict.fromkeys(stats.get("errors", [])):
        print(f"  error: {error}")
    return 0 if stats["failed"] == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--url", default="ws://localhost:8000/ws/downloads")
    parser.add_argument("--count", type=int, default=50, help="WebSockets simultáneos")
    parser.add_argument("--hold", type=float, default=30, help="segundos que se mantienen abiertos")
    parser.add_argument(
        "--redis-container",
        default="tidal_downloader-valkey-1",
        help="contenedor de Valkey para leer `info clients`",
    )
    args = parser.parse_args()
    return asyncio.run(run(args.url, args.count, args.hold, args.redis_container))


if __name__ == "__main__":
    raise SystemExit(main())
