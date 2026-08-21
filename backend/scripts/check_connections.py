#!/usr/bin/env python3
"""Preflight the external data stores before a deploy depends on them.

DEPLOYMENT.md section 1.2 lists the two traps that actually bit: Supabase's
direct host publishes no A record, and Upstash's console hands out a redis://
URL for a TLS-only port. Both fail as a timeout or a connection reset several
layers down, in a container, minutes after a green build -- which is the
expensive way to find out. This checks them in seconds, from anywhere.

Reads the same POSTGRES_* / REDIS_URL variables the app does.

    python scripts/check_connections.py

Exit code 0 = every check passed.
"""
import asyncio
import os
import socket
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

OK, BAD, WARN = "[ ok ]", "[FAIL]", "[warn]"
_failures = 0


def report(status: str, label: str, detail: str = "") -> None:
    global _failures
    if status is BAD:
        _failures += 1
    print(f"  {status} {label}" + (f" -- {detail}" if detail else ""))


def check_dns(host: str) -> None:
    """A pooler host must have an A record; Railway egress is IPv4 by default."""
    try:
        v4 = sorted({ai[4][0] for ai in socket.getaddrinfo(host, None, socket.AF_INET)})
    except socket.gaierror:
        v4 = []
    try:
        v6 = sorted({ai[4][0] for ai in socket.getaddrinfo(host, None, socket.AF_INET6)})
    except socket.gaierror:
        v6 = []

    if v4:
        report(OK, f"DNS A record for {host}", ", ".join(v4))
    elif v6:
        report(BAD, f"DNS for {host}", 
               f"IPv6 only ({v6[0]}) -- Railway cannot reach this without IPv6 egress. "
               f"Use the pooler host aws-0-<region>.pooler.supabase.com instead.")
    else:
        report(BAD, f"DNS for {host}", "does not resolve at all")


async def check_postgres(settings) -> None:
    import asyncpg

    host, port = settings.POSTGRES_SERVER, int(settings.POSTGRES_PORT)
    pooler = ".pooler.supabase.com" in host
    if pooler and port == 6543 and not settings.DB_PGBOUNCER_MODE:
        report(BAD, "DB_PGBOUNCER_MODE",
               "port 6543 is the TRANSACTION pooler but DB_PGBOUNCER_MODE=0 -- asyncpg will "
               "fail intermittently under load with 'prepared statement already exists'. Set it to 1.")
    elif pooler and port == 5432 and settings.DB_PGBOUNCER_MODE:
        report(WARN, "DB_PGBOUNCER_MODE",
               "port 5432 is SESSION mode, where statement caching is safe and faster. "
               "DB_PGBOUNCER_MODE=1 only costs performance here.")
    elif settings.DB_PGBOUNCER_MODE:
        report(OK, "DB_PGBOUNCER_MODE=1", "prepared-statement caching disabled")
    else:
        report(OK, "DB_PGBOUNCER_MODE=0", "direct or session-mode connection")

    if pooler and port == 6543 and not settings.POSTGRES_USER.startswith("postgres."):
        report(BAD, "POSTGRES_USER",
               f"'{settings.POSTGRES_USER}' -- the pooler needs the tenant-qualified form "
               "postgres.<project-ref>")

    try:
        conn = await asyncio.wait_for(
            asyncpg.connect(
                host=host, port=port, user=settings.POSTGRES_USER,
                password=settings.POSTGRES_PASSWORD, database=settings.POSTGRES_DB,
                ssl="require",
                statement_cache_size=0 if settings.DB_PGBOUNCER_MODE else 100,
            ),
            timeout=15,
        )
    except asyncio.TimeoutError:
        report(BAD, "Postgres connect", f"timed out after 15s against {host}:{port}")
        return
    except Exception as exc:
        report(BAD, "Postgres connect", f"{type(exc).__name__}: {exc}")
        return

    try:
        version = await conn.fetchval("SHOW server_version")
        report(OK, "Postgres connect", f"{host}:{port} as {settings.POSTGRES_USER} (v{version})")

        # Does the schema exist yet? This is what `alembic upgrade head` produces.
        rev = await conn.fetchval(
            "SELECT version_num FROM alembic_version LIMIT 1"
        ) if await conn.fetchval(
            "SELECT to_regclass('public.alembic_version') IS NOT NULL"
        ) else None
        if rev:
            report(OK, "alembic_version", f"schema is at {rev}")
        else:
            report(WARN, "alembic_version", "no migrations applied yet -- run `alembic upgrade head`")

        n = await conn.fetchval("SELECT to_regclass('public.products') IS NOT NULL")
        if n:
            count = await conn.fetchval("SELECT count(*) FROM products")
            report(OK if count else WARN, "products table",
                   f"{count} row(s)" + ("" if count else " -- storefront will render empty"))
    finally:
        await conn.close()


async def check_redis(settings) -> None:
    url = settings.REDIS_URL
    if url.startswith("redis://") and ("upstash.io" in url or "rediss" in url):
        report(BAD, "REDIS_URL scheme",
               "starts with redis:// -- Upstash is TLS-only. redis-py will open plaintext "
               "to a TLS port and Celery will crash-loop. Use rediss://.")
    else:
        report(OK, "REDIS_URL scheme", url.split("://", 1)[0] + "://")

    import redis.asyncio as aioredis
    client = aioredis.from_url(url, socket_connect_timeout=10)
    try:
        await asyncio.wait_for(client.ping(), timeout=15)
        report(OK, "Redis PING", url.split("@")[-1])
    except Exception as exc:
        report(BAD, "Redis PING", f"{type(exc).__name__}: {exc}")
    finally:
        await client.aclose()


async def main() -> int:
    from app.core.config import settings

    print(f"\nENVIRONMENT={settings.ENVIRONMENT}  LAUNCH_MODE={settings.LAUNCH_MODE or '(unset)'}"
          f"  checkout_enabled={settings.checkout_enabled}\n")

    print("Postgres")
    check_dns(settings.POSTGRES_SERVER)
    await check_postgres(settings)

    print("\nRedis")
    await check_redis(settings)

    print()
    if _failures:
        print(f"{_failures} check(s) FAILED -- deploying now will not work.")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
