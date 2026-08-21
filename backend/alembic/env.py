from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

import sys
from os.path import dirname, abspath
sys.path.insert(0, dirname(dirname(abspath(__file__))))

# Import ALL models so Alembic can detect every table
import app.models  # noqa: F401 — side-effect: registers all ORM classes
from app.models import Base
from app.core.config import settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)



def _migration_url() -> str:
    """The sync URL, moved to SESSION pooling when the app is on TRANSACTION.

    Migrations are the one workload the transaction pooler cannot carry. Two
    reasons, and the first one bites before any DDL runs:

      * SQLAlchemy's psycopg2 dialect probes for hstore OIDs in its on-connect
        hook. Supavisor on :6543 closes the connection during that exchange —
        `SSL connection has been closed unexpectedly`, on connect, every time.
      * DDL wants one connection for the whole transaction. A transaction-mode
        pooler is free to hand each statement a different backend.

    The session pooler is the same IPv4 host on :5432, so this needs no extra
    variable and no second credential — only the port changes. The app stays on
    :6543 where connection reuse is worth having.
    """
    url = settings.sync_database_uri
    if settings.DB_PGBOUNCER_MODE and ":6543/" in url:
        url = url.replace(":6543/", ":5432/")
    return url


config.set_main_option("sqlalchemy.url", _migration_url())
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # Belt and braces for the on-connect probe described above: this schema
        # uses JSONB, never hstore, so the lookup buys nothing and is one more
        # round trip a pooler can sever.
        use_native_hstore=False,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
