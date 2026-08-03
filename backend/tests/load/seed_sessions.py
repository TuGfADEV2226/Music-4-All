"""Siembra sesiones de app sintéticas para las pruebas de carga.

Los endpoints que importan medir están **autenticados**: sin sesión, locust solo
mide 401. Este script crea N sesiones válidas en Redis y escribe sus `sid` en un
fichero que consumen `locustfile.py` y `ws_load.py`.

Cada usuario sintético (`loadtest-1`, `loadtest-2`, …) recibe una **copia de los
tokens Tidal** de una cuenta real ya autenticada. Así cada uno cuenta como un
usuario distinto para cuotas, rate-limit e historial — que es lo que se quiere
medir — mientras que las llamadas a Tidal salen de una sola cuenta. Sin esa
copia, `/search` y `/downloads` fallarían al no encontrar motor.

Se ejecuta **dentro del contenedor del backend**, que es quien tiene la URL de
Redis y la `SESSION_ENCRYPTION_KEY` con la que están cifrados los tokens:

    docker compose exec backend python tests/load/seed_sessions.py \
        --source-user 197033432 --count 20 --out /tmp/loadtest_sids.txt

Al terminar la campaña, borrar lo sembrado (sesiones, tokens copiados, cuotas y
contadores de abuso de los usuarios sintéticos):

    docker compose exec backend python tests/load/seed_sessions.py --purge

Lo que este script **no** toca: los tokens ni el historial de la cuenta real.
Las filas que los usuarios sintéticos dejen en `downloads`/`audit_logs` se
borran con `--purge-db` (requiere DATABASE_URL, la usa el propio backend).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Permite ejecutarlo como script suelto (`python tests/load/seed_sessions.py`).
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.config import settings  # noqa: E402
from app.core import redis_client, user_session  # noqa: E402

USER_PREFIX = "loadtest-"


def synthetic_uid(index: int) -> str:
    return f"{USER_PREFIX}{index}"


async def seed(source_user: str, count: int, out: Path) -> int:
    redis = await redis_client.create_client(settings.redis_url)
    try:
        tokens = await user_session.get_user_tokens(redis, source_user, "oauth")
        if tokens is None:
            print(
                f"ERROR: no hay tokens Tidal para el usuario {source_user!r}.\n"
                "Entra una vez en la app con esa cuenta (los tokens viven en Redis) "
                "o pasa --no-tokens para sembrar solo sesiones (sin acceso a Tidal).",
                file=sys.stderr,
            )
            return 1

        sids: list[str] = []
        for i in range(1, count + 1):
            uid = synthetic_uid(i)
            await user_session.store_user_tokens(redis, uid, "oauth", tokens)
            sid = await user_session.create_app_session(redis, uid, ip="127.0.0.1", ua="locust")
            sids.append(sid)

        out.write_text("\n".join(sids) + "\n", encoding="utf-8")
        print(f"{count} sesiones sembradas (usuarios {USER_PREFIX}1..{count}) → {out}")
        print(f"Tokens Tidal clonados de {source_user}. Recuerda --purge al terminar.")
        return 0
    finally:
        await redis.aclose()


async def seed_without_tokens(count: int, out: Path) -> int:
    """Sesiones válidas pero sin tokens: solo sirven para endpoints sin Tidal."""
    redis = await redis_client.create_client(settings.redis_url)
    try:
        sids = [
            await user_session.create_app_session(
                redis, synthetic_uid(i), ip="127.0.0.1", ua="locust"
            )
            for i in range(1, count + 1)
        ]
        out.write_text("\n".join(sids) + "\n", encoding="utf-8")
        print(f"{count} sesiones sin tokens sembradas → {out}")
        return 0
    finally:
        await redis.aclose()


async def purge() -> int:
    redis = await redis_client.create_client(settings.redis_url)
    deleted = 0
    try:
        # Sesiones de app: hay que abrirlas para saber de quién son.
        async for key in redis.scan_iter(match="app:session:*", count=500):
            raw = await redis.get(key)
            if raw and f'"{USER_PREFIX}' in raw:
                await redis.delete(key)
                deleted += 1

        # Todo lo demás va indexado por uid, así que basta el patrón.
        for pattern in (
            f"user:{USER_PREFIX}*",
            f"music4all:user:{USER_PREFIX}*",
            f"music4all:banned:{USER_PREFIX}*",
            f"music4all:abuse:{USER_PREFIX}*",
        ):
            async for key in redis.scan_iter(match=pattern, count=500):
                await redis.delete(key)
                deleted += 1

        print(f"{deleted} claves de prueba borradas.")
        return 0
    finally:
        await redis.aclose()


async def purge_db() -> int:
    """Borra las filas que los usuarios sintéticos dejaron en la base de datos."""
    from sqlalchemy import text

    from app.core.database import engine

    async with engine.begin() as conn:
        downloads = await conn.execute(
            text("DELETE FROM downloads WHERE user_id LIKE :p"), {"p": f"{USER_PREFIX}%"}
        )
        audits = await conn.execute(
            text("DELETE FROM audit_logs WHERE user_id LIKE :p"), {"p": f"{USER_PREFIX}%"}
        )
    print(f"Filas borradas — downloads: {downloads.rowcount}, audit_logs: {audits.rowcount}")
    await engine.dispose()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--source-user", help="uid Tidal real cuyos tokens se clonan")
    parser.add_argument("--count", type=int, default=20, help="número de usuarios sintéticos")
    parser.add_argument(
        "--out", type=Path, default=Path("/tmp/loadtest_sids.txt"), help="fichero de sids"
    )
    parser.add_argument(
        "--no-tokens",
        action="store_true",
        help="siembra sesiones sin tokens Tidal (solo endpoints que no llaman a Tidal)",
    )
    parser.add_argument("--purge", action="store_true", help="borra lo sembrado en Redis")
    parser.add_argument("--purge-db", action="store_true", help="borra las filas en PostgreSQL")
    args = parser.parse_args()

    if args.purge:
        return asyncio.run(purge())
    if args.purge_db:
        return asyncio.run(purge_db())
    if args.no_tokens:
        return asyncio.run(seed_without_tokens(args.count, args.out))
    if not args.source_user:
        parser.error("--source-user es obligatorio (o usa --no-tokens / --purge)")
    return asyncio.run(seed(args.source_user, args.count, args.out))


if __name__ == "__main__":
    raise SystemExit(main())
