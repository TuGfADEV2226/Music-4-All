from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(
    settings.async_database_url,
    echo=settings.debug,
    future=True,
    # Valida la conexión antes de entregarla del pool: tras un rato ocioso, Postgres
    # (o un proxy/firewall intermedio) puede haber cerrado el socket y la primera
    # consulta fallaría con un error intermitente en vez de reconectar (PERF-08).
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependencia FastAPI que provee una sesión de base de datos por request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
