import logging
import sentry_sdk
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.core.config import settings
from app.core.logging_config import configure_logging
from app.core.redis import get_redis_client, close_redis
from app.core.security import _load_keys
from app.api.v1 import api_router
from app.api.admin.v1 import admin_router
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_id import RequestIDMiddleware

configure_logging()
logger = logging.getLogger(__name__)


# ── Sentry ────────────────────────────────────────────────────────────────────
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration(), StarletteIntegration()],
        traces_sample_rate=0.1,
        environment=settings.ENVIRONMENT,
        send_default_pii=False,
    )
    logger.info("Sentry initialised")


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    _load_keys()                           # Validate / generate RS256 keys
    redis = await get_redis_client()
    app.state.redis = redis
    await redis.ping()                     # Fail fast if Redis is unreachable
    logger.info("Redis connected")
    logger.info("ZISUN backend started", extra={"environment": settings.ENVIRONMENT})

    yield

    # Shutdown
    await close_redis()
    logger.info("ZISUN backend stopped")


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="ZISUN Content-Driven Commerce Platform API",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
)

# Middleware order matters — outermost runs first on request, last on response
app.add_middleware(RequestIDMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(o) for o in settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(api_router,   prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.ADMIN_V1_STR)


# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled exception",
        extra={"path": request.url.path, "request_id": getattr(request.state, "request_id", "")},
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"},
        },
    )


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check(request: Request):
    checks: dict = {"api": "ok"}

    # Redis
    try:
        await request.app.state.redis.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "degraded"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": overall, "service": settings.PROJECT_NAME, "checks": checks}
