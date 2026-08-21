"""Server-side enforcement of LAUNCH_MODE=browse.

Hiding the buttons in the storefront is presentation, not enforcement — the API
is public and anyone can POST to it. These guards are the actual rule: under
browse-only no request can create an order, so there is never an order sitting
in PAYMENT_PENDING holding stock against a gateway we have no keys for.
"""
from fastapi import HTTPException, status

from app.core.config import settings

CHECKOUT_DISABLED_DETAIL = (
    "Checkout is not open yet — the store is in preview. "
    "Browse the catalogue and message us on WhatsApp to place an order."
)


def checkout_disabled_error() -> HTTPException:
    """503 rather than 403: this is a temporary state of the deployment.

    Retry-After is deliberately absent — we do not know when KYC clears, and a
    wrong hint is worse than none.
    """
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=CHECKOUT_DISABLED_DETAIL,
    )


async def require_checkout_enabled() -> None:
    """FastAPI dependency — refuses the request before the handler runs."""
    if settings.is_browse_only:
        raise checkout_disabled_error()
