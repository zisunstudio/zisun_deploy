"""Enhanced health check — DB, Redis, Celery heartbeat."""
import asyncio
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
    }

    # DB check
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        status["components"]["database"] = "ok"
    except Exception as e:
        status["components"]["database"] = f"degraded: {e}"
        status["status"] = "degraded"

    # Redis check
    try:
        redis = await get_redis_client()
        await redis.ping()
        status["components"]["redis"] = "ok"
    except Exception as e:
        status["components"]["redis"] = f"degraded: {e}"
        status["status"] = "degraded"

    # Celery heartbeat check (optional — won't fail health if unavailable).
    #
    # inspect.active() is a synchronous broadcast that waits for replies. Its
    # `timeout` bounds how long it waits for answers, not the call itself:
    # measured at 6.3s against a TLS broker with no workers responding. Called
    # straight from this coroutine it blocked the event loop for that whole
    # time, which is enough for the platform healthcheck to give up on the
    # container — an "optional" probe taking the service down with it.
    #
    # Off the loop now, and hard-bounded. A slow answer costs an "unavailable"
    # label instead of the deployment.
    if settings.is_browse_only:
        # Browse-only creates no orders, so nothing is queued and there is
        # nothing for a worker to be doing. Probing for one costs seconds on
        # every healthcheck to learn something we already know.
        status["components"]["celery"] = "not probed (browse mode)"
        return status

    try:
        from app.celery_app import celery_app

        def _probe():
            return celery_app.control.inspect(timeout=1.0).active()

        active = await asyncio.wait_for(asyncio.to_thread(_probe), timeout=2.0)
        status["components"]["celery"] = "ok" if active else "no workers"
    except Exception:
        status["components"]["celery"] = "unavailable"

    return status
