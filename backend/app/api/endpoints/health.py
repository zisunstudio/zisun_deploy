"""Enhanced health check — DB, Redis, Celery heartbeat."""
from fastapi import APIRouter
from sqlalchemy import text
from app.core.database import AsyncSessionLocal
from app.core.redis import get_redis_client

router = APIRouter()


@router.get("/health", tags=["Health"])
async def health_check():
    status = {"status": "ok", "components": {}}

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
