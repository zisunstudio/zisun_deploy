from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import settings

# ── Async engine (FastAPI routes) ─────────────────────────────────────────────
def _async_connect_args() -> dict:
    """asyncpg options that a transaction-mode pooler requires.

    PgBouncer/Supavisor in transaction mode may route each statement to a
    different backend, so a prepared statement created on one is absent on the
    next. asyncpg caches aggressively by default and fails with
    `prepared statement "__asyncpg_stmt_N__" does not exist` — intermittently,
    only under concurrency, which makes it a nightmare to reproduce.

    Both caches must be off: statement_cache_size covers asyncpg's own cache,
    prepared_statement_cache_size covers SQLAlchemy's dialect-level one.
    """
    if not settings.DB_PGBOUNCER_MODE:
        return {}
    return {"statement_cache_size": 0, "prepared_statement_cache_size": 0}


async_engine = create_async_engine(
    settings.async_database_uri,
    echo=False,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args=_async_connect_args(),
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
        # Without explicit sizes SQLAlchemy defaults to pool_size=5 plus
        # max_overflow=10 — fifteen connections per process. The Celery worker
        # and beat each build one of these, and Supavisor's session pooler caps
        # the whole project at fifteen clients, so two idle background services
        # could exhaust the budget on their own and the API would fail to
        # connect with EMAXCONNSESSION. Honour the same settings the async
        # engine uses, so the total is something you can actually add up.
        _sync_engine = create_engine(
            settings.sync_database_uri,
            echo=False,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
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
