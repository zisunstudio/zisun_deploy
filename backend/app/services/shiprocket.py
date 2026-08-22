"""Shiprocket logistics service — auth, serviceability, AWB creation."""
import json
import logging
from dataclasses import dataclass, asdict
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SHIPROCKET_BASE = "https://apiv2.shiprocket.in/v1/external"
_TOKEN_KEY = "shiprocket:token"

# One parcel's worth of kurti. Serviceability barely varies by weight in this
# range, but the API requires the field and rate accuracy depends on it.
DEFAULT_PARCEL_KG = 0.5


@dataclass(frozen=True)
class Serviceability:
    """What the product page and checkout need to know about one pincode."""

    serviceable: bool
    cod_available: bool
    estimated_days: Optional[int]
    courier: Optional[str]
    # "live" when Shiprocket answered, "cache" when served from Redis, and
    # "assumed" when we failed open. The caller should never silently present
    # an assumed answer as a promise.
    source: str


def _fail_open(reason: str) -> Serviceability:
    """Assume deliverable when Shiprocket cannot be reached.

    Refusing an order we could have fulfilled is the expensive error: it is a
    sale lost outright. Accepting one we cannot is recoverable, because the COD
    confirmation call happens before dispatch and catches it. So the failure
    mode is deliberately optimistic, and marked so the UI does not promise a
    delivery date it never received.
    """
    logger.warning("Serviceability failing open: %s", reason)
    return Serviceability(True, True, None, None, "assumed")


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


def _cache_keys(pincode: str) -> tuple[str, str]:
    pickup = settings.SHIPROCKET_PICKUP_PINCODE
    return (
        f"ship:serv:{pickup}:{pincode}",
        f"ship:serv:cod:{pickup}:{pincode}",
    )


async def check_serviceability(
    pincode: str,
    *,
    cod: bool = True,
    weight_kg: float = DEFAULT_PARCEL_KG,
    redis=None,
) -> Serviceability:
    """Whether we can deliver to `pincode`, how fast, and whether COD is on.

    One call to Shiprocket answers all three: `courier/serviceability` returns
    the available couriers with per-courier cost, estimated days and COD
    eligibility, so the product page's delivery estimate and checkout's COD
    switch come from the same source rather than drifting apart.

    Cached in two parts on purpose — see SERVICEABILITY_*_CACHE_SECONDS.
    """
    if not settings.SHIPROCKET_EMAIL or not settings.SHIPROCKET_PASSWORD:
        return _fail_open("Shiprocket credentials not configured")

    base_key, cod_key = _cache_keys(pincode)

    cached = None
    if redis:
        try:
            raw = await redis.get(base_key)
            if raw:
                cached = json.loads(raw if isinstance(raw, str) else raw.decode())
        except Exception:
            cached = None

    if cached is not None:
        # The COD flag expires sooner than the rest. When it has gone, the
        # cached coverage and ETA are still good; only COD needs re-asking, and
        # until it is re-asked we do not claim COD is available.
        cod_flag = None
        if redis:
            try:
                raw = await redis.get(cod_key)
                if raw is not None:
                    cod_flag = (raw if isinstance(raw, str) else raw.decode()) == "1"
            except Exception:
                cod_flag = None
        if cod_flag is not None or not cod:
            return Serviceability(
                serviceable=cached["serviceable"],
                cod_available=bool(cod_flag) if cod_flag is not None else False,
                estimated_days=cached.get("estimated_days"),
                courier=cached.get("courier"),
                source="cache",
            )

    token = await _get_token(redis)
    if not token:
        return _fail_open("could not obtain a Shiprocket token")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SHIPROCKET_BASE}/courier/serviceability/",
                params={
                    "pickup_postcode": settings.SHIPROCKET_PICKUP_PINCODE,
                    "delivery_postcode": pincode,
                    "weight": weight_kg,
                    "cod": 1 if cod else 0,
                },
                headers={"Authorization": f"Bearer {token}"},
                timeout=8,
            )
    except Exception as exc:
        return _fail_open(f"{type(exc).__name__} calling serviceability")

    if resp.status_code != 200:
        return _fail_open(f"serviceability returned HTTP {resp.status_code}")

    try:
        couriers = resp.json()["data"]["available_courier_companies"]
    except Exception:
        return _fail_open("unexpected serviceability response shape")

    if not couriers:
        # An empty list is a real answer, not a failure: nobody delivers there.
        result = Serviceability(False, False, None, None, "live")
    else:
        # Fastest courier decides the estimate; the customer sees one date and
        # a slower courier picked later would make it a lie.
        best = min(
            couriers,
            key=lambda c: _as_int(c.get("estimated_delivery_days")) or 99,
        )
        result = Serviceability(
            serviceable=True,
            cod_available=any(_as_int(c.get("cod")) == 1 for c in couriers),
            estimated_days=_as_int(best.get("estimated_delivery_days")),
            courier=best.get("courier_name"),
            source="live",
        )

    if redis:
        try:
            await redis.setex(
                base_key,
                settings.SERVICEABILITY_CACHE_SECONDS,
                json.dumps(
                    {
                        "serviceable": result.serviceable,
                        "estimated_days": result.estimated_days,
                        "courier": result.courier,
                    }
                ),
            )
            await redis.setex(
                cod_key,
                settings.SERVICEABILITY_COD_CACHE_SECONDS,
                "1" if result.cod_available else "0",
            )
        except Exception:
            pass  # a cache we cannot write is not a reason to fail the request

    return result


def _as_int(value) -> Optional[int]:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


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
