"""Rate limiting: the sign-in limit in Redis, the global limit in memory.

Both used to be Redis counters, which put an Upstash round trip - an INCR,
and an EXPIRE on a visitor's first request each minute - in front of every
api request before it reached a route. Measured 2026-09-26 on a warm
connection: a cached product read and a bare 404 both cost ~0.50 s, of
which the page the storefront serves from memory needed ~0.10 s. The rest
was this counter. It was also the api's largest spender of the metered
Redis quota: two or three commands per shopper per minute, on the path
every page view takes, against a free tier that has already run out once
and stopped background processing for eight days.

So the split is by what each limit protects:

* **Sign-in** (10 a minute) guards OTP sends, which cost money per SMS and
  are the thing an attacker would hammer. It stays in Redis so the count
  is shared by every worker, and sign-in traffic is small enough that the
  commands do not matter.
* **Everything else** (100 a minute) guards against a scraper or a runaway
  client. A fixed-window count in this process does that at no cost. Each
  uvicorn worker keeps its own, so one address could reach the limit once
  per worker - two hundred a minute at today's two workers, against a
  storefront page that makes about five calls. That is the trade, taken
  on purpose.
"""
import logging
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.client_ip import client_ip
from app.core.config import settings

logger = logging.getLogger(__name__)

# Global-limit counters for this process: ip -> (window, count). Bounded, so
# a flood of distinct addresses cannot grow it without limit; dropping the
# table only forgives counts, it never blocks anyone.
_local: dict[str, tuple[int, int]] = {}
_LOCAL_MAX_KEYS = 50_000


def _local_hit(ip: str, window_id: int) -> int:
    w, n = _local.get(ip, (window_id, 0))
    if w != window_id:
        n = 0
    n += 1
    if len(_local) >= _LOCAL_MAX_KEYS and ip not in _local:
        _local.clear()
    _local[ip] = (window_id, n)
    return n

# Routes that fall under the stricter auth limit
_AUTH_PREFIXES = ("/api/v1/auth/",)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # The shopper, not Railway's proxy - see app/core/client_ip.py.
        ip = client_ip(request)
        path = request.url.path
        now = int(time.time())
        window = 60  # seconds

        if any(path.startswith(p) for p in _AUTH_PREFIXES):
            limit = settings.RATE_LIMIT_AUTH_PER_MINUTE
            key = f"rl:auth:{ip}:{now // window}"
            redis = getattr(request.app.state, "redis", None)
            try:
                current = await redis.incr(key) if redis is not None else 0
                if current == 1:
                    await redis.expire(key, window * 2)  # small buffer over the window
            except Exception:
                # Never block a request because Redis is unavailable
                current = 0
        else:
            limit = settings.RATE_LIMIT_GLOBAL_PER_MINUTE
            current = _local_hit(ip, now // window)

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

        return await call_next(request)
