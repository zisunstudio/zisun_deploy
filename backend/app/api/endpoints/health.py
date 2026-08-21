"""Enhanced health check — DB, Redis, Celery heartbeat."""
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

    # Celery heartbeat check (optional — won't fail health if unavailable)
    try:
        from app.celery_app import celery_app
        inspect = celery_app.control.inspect(timeout=1.0)
        active = inspect.active()
        status["components"]["celery"] = "ok" if active else "no workers"
    except Exception:
        status["components"]["celery"] = "unavailable"

    return status
