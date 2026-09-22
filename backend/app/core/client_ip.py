"""The visitor's address, as seen through Railway's edge.

uvicorn runs without --proxy-headers, so `request.client.host` is Railway's
proxy - the same address for every shopper. The rate limiter keyed on it,
which made its limits *site-wide*: 100 API calls a minute for everyone put
together, and 10 sign-in attempts a minute across all customers. A single
WhatsApp drop announcement would have locked the shop for all of them.

Railway's edge sets X-Real-IP to the connecting address (api.zisun.in is
not proxied through Cloudflare, so that is the shopper). The last
X-Forwarded-For hop is the fallback - the last one, because it is the hop
the edge appended, whereas the first can be whatever the client sent.
"""
from starlette.requests import Request


def client_ip(request: Request) -> str:
    real = (request.headers.get("x-real-ip") or "").strip()
    if real:
        return real
    forwarded = [h.strip() for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
    if forwarded:
        return forwarded[-1]
    return request.client.host if request.client else "unknown"
