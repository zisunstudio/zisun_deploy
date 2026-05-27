"""Redis-backed sliding-window rate limiter middleware."""
import logging
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger(__name__)

# Routes that fall under the stricter auth limit
_AUTH_PREFIXES = ("/api/v1/auth/",)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting if Redis isn't available (graceful degradation)
        try:
            redis = request.app.state.redis
        except AttributeError:
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"
        path = request.url.path
        now = int(time.time())

        is_auth_route = any(path.startswith(p) for p in _AUTH_PREFIXES)
        limit = (
            settings.RATE_LIMIT_AUTH_PER_MINUTE
            if is_auth_route
            else settings.RATE_LIMIT_GLOBAL_PER_MINUTE
        )
        window = 60  # seconds
        key = f"rl:{'auth' if is_auth_route else 'global'}:{ip}:{now // window}"

        try:
            current = await redis.incr(key)
            if current == 1:
                await redis.expire(key, window * 2)  # small buffer over the window

            if current > limit:
                retry_after = window - (now % window)
                logger.warning("rate_limit_exceeded", extra={"ip": ip, "path": path})
                return JSONResponse(
                    status_code=429,
                    content={
                        "success": False,
                        "error": {
                            "code": "RATE_LIMIT_EXCEEDED",
                            "message": "Too many requests. Please slow down.",
                        },
                    },
                    headers={"Retry-After": str(retry_after)},
                )
        except Exception:
            # Never block a request because Redis is unavailable
            pass

        return await call_next(request)
