"""What a pincode already tells us about an address.

Customers type addresses badly - the wrong city for their pincode, a state
picked from a dropdown by accident, a locality spelled three ways - and a
parcel with a wrong city is a parcel a courier returns.

A pincode is authoritative. India Post publishes, free and without a key,
the district, state and every post office under a PIN. So the form stops
asking for what it can already know: enter six digits and the city and state
fill themselves in, and the localities under that PIN are offered as chips
so "Indiranagar" is a tap rather than a spelling.

Cached in Redis for a month. A PIN's district does not change, and the free
endpoint deserves to be asked once per pincode, not once per keystroke.
Fails soft everywhere: if India Post is unreachable the customer simply
types the city as before, which is exactly what happens today.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

INDIA_POST = "https://api.postalpincode.in/pincode"
CACHE_TTL = 30 * 24 * 3600
_KEY = "pincode:place:{}"


@dataclass
class Place:
    pincode: str
    city: Optional[str] = None       # district, which is what a courier wants
    state: Optional[str] = None
    localities: list[str] = field(default_factory=list)
    source: str = "live"             # live | cache | unknown


def _parse(pincode: str, payload) -> Place:
    try:
        block = (payload or [{}])[0]
        if block.get("Status") != "Success":
            return Place(pincode=pincode, source="unknown")
        offices = block.get("PostOffice") or []
        if not offices:
            return Place(pincode=pincode, source="unknown")
        first = offices[0]
        # Names, de-duplicated, order preserved: the first is usually the one
        # the customer means, and a list of forty is not a choice.
        seen, localities = set(), []
        for o in offices:
            name = (o.get("Name") or "").strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                localities.append(name)
        return Place(
            pincode=pincode,
            city=(first.get("District") or "").strip() or None,
            state=(first.get("State") or "").strip() or None,
            localities=localities[:12],
        )
    except Exception:  # noqa: BLE001
        logger.exception("Could not read India Post payload for %s", pincode)
        return Place(pincode=pincode, source="unknown")


async def resolve(pincode: str, redis=None) -> Place:
    """District, state and localities for a six-digit PIN."""
    pin = (pincode or "").strip()
    if not (len(pin) == 6 and pin.isdigit()):
        return Place(pincode=pin, source="unknown")

    if redis is not None:
        try:
            import json  # noqa: PLC0415

            cached = await redis.get(_KEY.format(pin))
            if cached:
                data = json.loads(cached if isinstance(cached, str) else cached.decode())
                return Place(pincode=pin, city=data.get("city"), state=data.get("state"),
                             localities=data.get("localities") or [], source="cache")
        except Exception:  # noqa: BLE001
            pass

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{INDIA_POST}/{pin}", timeout=6)
        if resp.status_code != 200:
            return Place(pincode=pin, source="unknown")
        place = _parse(pin, resp.json())
    except Exception as exc:  # noqa: BLE001
        logger.warning("India Post lookup failed for %s: %s", pin, exc)
        return Place(pincode=pin, source="unknown")

    if place.city and redis is not None:
        try:
            import json  # noqa: PLC0415

            await redis.setex(
                _KEY.format(pin), CACHE_TTL,
                json.dumps({"city": place.city, "state": place.state, "localities": place.localities}),
            )
        except Exception:  # noqa: BLE001
            pass
    return place
