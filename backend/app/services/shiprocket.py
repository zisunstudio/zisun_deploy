"""Shiprocket logistics service — auth, AWB creation, webhook parsing."""
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SHIPROCKET_BASE = "https://apiv2.shiprocket.in/v1/external"
_TOKEN_KEY = "shiprocket:token"


async def _get_token(redis) -> Optional[str]:
    if not settings.SHIPROCKET_EMAIL or not settings.SHIPROCKET_PASSWORD:
        return None
    if redis:
        try:
            cached = await redis.get(_TOKEN_KEY)
            if cached:
                return cached.decode() if isinstance(cached, bytes) else cached
        except Exception:
            pass
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SHIPROCKET_BASE}/auth/login",
            json={
                "email": settings.SHIPROCKET_EMAIL,
                "password": settings.SHIPROCKET_PASSWORD,
            },
            timeout=10,
        )
        if resp.status_code != 200:
            logger.error("Shiprocket auth failed: %s", resp.text)
            return None
        token = resp.json().get("token")
        if token and redis:
            try:
                await redis.setex(_TOKEN_KEY, 82800, token)  # 23h TTL
            except Exception:
                pass
        return token


async def create_shipment(db, order) -> Optional[str]:
    """Create Shiprocket order when marked PACKED. Returns AWB number or None."""
    from app.core.redis import get_redis_client

    try:
        redis = await get_redis_client()
    except Exception:
        redis = None

    token = await _get_token(redis)
    if not token:
        logger.warning(
            "Shiprocket: no credentials — skipping AWB for order %s", order.id
        )
        return None

    # Build payload with available order data
    payload = {
        "order_id": str(order.id)[:20],
        "order_date": order.created_at.strftime("%Y-%m-%d %H:%M"),
        "pickup_location": "Primary",
        "channel_id": "",
        "comment": f"ZISUN order {order.id}",
        "billing_customer_name": "Customer",
        "billing_last_name": "",
        "billing_address": getattr(order.address, "line1", ""),
        "billing_city": getattr(order.address, "city", ""),
        "billing_pincode": getattr(order.address, "pincode", "110001"),
        "billing_state": getattr(order.address, "state", ""),
        "billing_country": "India",
        "billing_email": "",
        "billing_phone": "",
        "shipping_is_billing": True,
        "order_items": [
            {
                "name": "Item",
                "sku": str(item.product_variant_id)[:20],
                "units": item.quantity,
                "selling_price": item.unit_price / 100,
            }
            for item in order.items
        ],
        "payment_method": "Prepaid",
        "sub_total": order.total_amount / 100,
        "length": 10,
        "breadth": 10,
        "height": 10,
        "weight": 0.5,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SHIPROCKET_BASE}/orders/create/adhoc",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )

    if resp.status_code not in (200, 201):
        logger.error("Shiprocket create_shipment failed: %s", resp.text)
        return None

    data = resp.json()
    awb = data.get("awb_code") or data.get("awb_assign_status", {})
    return str(awb) if awb else None
