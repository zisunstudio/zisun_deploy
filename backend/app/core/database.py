from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings

# ── Async engine (FastAPI routes) ─────────────────────────────────────────────
async_engine = create_async_engine(
    settings.async_database_uri,
    echo=False,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=3600,
)
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    expire_on_commit=False,
    class_=AsyncSession,
)

# ── Sync engine (Celery tasks / Alembic) — lazy to avoid psycopg2 import at test time ──
_sync_engine = None
_SessionLocal = None


def _get_sync_engine():
    global _sync_engine, _SessionLocal
    if _sync_engine is None:
        _sync_engine = create_engine(
            settings.sync_database_uri,
            echo=False,
            pool_pre_ping=True,
            pool_recycle=3600,
        )
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_sync_engine)
    return _sync_engine, _SessionLocal


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_async_db():  # type: ignore[return]
    async with AsyncSessionLocal() as session:
        yield session


def get_sync_db():
    _, factory = _get_sync_engine()
    db: Session = factory()
    try:
        yield db
    finally:
        db.close()
