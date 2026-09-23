"""Enhanced health check — DB, Redis, Celery heartbeat."""
from datetime import datetime, timezone
from time import perf_counter
from fastapi import APIRouter
from sqlalchemy import text
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.redis import get_redis_client

router = APIRouter()


@router.get("/health", tags=["Health"])
async def health_check():
    # launch_mode is reported here so "is checkout actually closed?" is one
    # curl away, rather than an inference from the container's env vars.
    status = {
        "status": "ok",
        "launch_mode": settings.LAUNCH_MODE or "normal",
        "checkout_enabled": settings.checkout_enabled,
        "components": {},
        # Round-trip time to each dependency, in milliseconds. Cheap, and the
        # only way to tell "the app is slow" from "the database is a continent
        # away" without guessing: the app runs in Singapore and Supabase is in
        # ap-southeast-2 (Sydney), so every query crosses ~100ms of ocean.
        "timings_ms": {},
    }

    # DB check
    _t0 = perf_counter()
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        status["components"]["database"] = "ok"
        status["timings_ms"]["database"] = round((perf_counter() - _t0) * 1000)
    except Exception as e:
        status["components"]["database"] = f"degraded: {e}"
        status["status"] = "degraded"

    # Redis check
    _t1 = perf_counter()
    try:
        redis = await get_redis_client()
        await redis.ping()
        status["components"]["redis"] = "ok"
        status["timings_ms"]["redis"] = round((perf_counter() - _t1) * 1000)
    except Exception as e:
        status["components"]["redis"] = f"degraded: {e}"
        status["status"] = "degraded"

    # Worker liveness, read from a stamp rather than asked over the broker.
    #
    # This used to call celery_app.control.inspect().active() — a synchronous
    # broadcast that waits for replies. Over TLS to Upstash it measured ~6s,
    # longer than the probe's own timeout, so a perfectly healthy worker was
    # reported "unavailable"; and once browse mode lifted it ran on every
    # health check, spending broker commands from a metered quota on a
    # question the worker can answer for free.
    #
    # The worker now stamps a key when it starts and after every outbox
    # sweep. Reading it is one GET, it is instant, and it proves a task
    # actually EXECUTED — which is the failure that matters here. A worker
    # can hold a broker connection and still be wedged, and that is silent:
    # orders reach PAID and nothing ever ships.
    try:
        from app.core.redis import WORKER_HEARTBEAT_KEY

        redis = await get_redis_client()
        stamp = await redis.get(WORKER_HEARTBEAT_KEY)
        if stamp:
            seen = datetime.fromisoformat(stamp if isinstance(stamp, str) else stamp.decode())
            age = int((datetime.now(timezone.utc) - seen).total_seconds())
            # The sweep runs every 120s; anything under five minutes is normal.
            if age <= 300:
                status["components"]["celery"] = f"ok (last task {age}s ago)"
            else:
                status["components"]["celery"] = f"stale — last task {age}s ago"
                status["status"] = "degraded"
        else:
            status["components"]["celery"] = "no heartbeat — worker down or starting"
            status["status"] = "degraded"
    except Exception as exc:  # noqa: BLE001
        status["components"]["celery"] = f"unknown: {type(exc).__name__}"

    # Can we actually take a prepaid payment?
    #
    # This is here because razorpay 1.4.1 imports pkg_resources, Python 3.12
    # stopped shipping it, and the client silently failed to construct. The
    # API then did the right thing - refused to create a prepaid order rather
    # than write one no webhook could ever match - but the only evidence was a
    # single warning line in the container log, and real orders were lost
    # while everything looked healthy. A shop that cannot charge a card is not
    # "ok", so this degrades the whole report.
    if settings.checkout_enabled and not settings.PAYMENTS_COD_ONLY:
        try:
            from app.services.checkout import _razorpay_client  # noqa: PLC0415

            if _razorpay_client() is None:
                status["components"]["razorpay"] = "unavailable — prepaid orders are being refused"
                status["status"] = "degraded"
            else:
                status["components"]["razorpay"] = "ok"
        except Exception as exc:  # noqa: BLE001
            status["components"]["razorpay"] = f"unavailable: {type(exc).__name__}"
            status["status"] = "degraded"
    else:
        status["components"]["razorpay"] = "not required (COD only)"

    return status
