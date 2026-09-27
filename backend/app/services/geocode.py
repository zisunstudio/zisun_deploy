"""Turn the phone's position into the address a courier needs.

Customers were typing addresses that couriers could not find - a flat
number with no street, a locality spelled three ways, the wrong pincode for
the area. The phone already knows where it is. One tap at checkout sends its
coordinates here and gets back the pincode, the road, the locality, the
city and the state, so the only thing left to type is the one thing no
satellite knows: which door.

The source is OpenStreetMap's Nominatim, which is free and needs no key, on
its public usage policy: an identifying User-Agent with a contact address,
no more than one request a second, and results cached rather than asked for
again. A checkout makes one call per customer who taps the button, so the
shop is nowhere near that ceiling; the lock below keeps it honest anyway.
The attribution travels with the answer because the licence requires it.

GPS indoors is often 20-100 m out, which in a dense city can cross a
pincode boundary. So the pincode Nominatim returns is not taken on trust:
it is checked against India Post (`services/pincode.py`), whose city and
state win, and the storefront shows her what was filled so she can correct
it. The written address is still what the courier drives to; this only
saves her writing most of it.

Coordinates leave the shop's servers only as far as Nominatim, only when
she taps, and they are not logged.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass, field

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
ATTRIBUTION = "© OpenStreetMap contributors"

# India, generously. A position outside it is a VPN, an emulator or a test,
# and there is no Indian address to find there.
_LAT = (6.0, 37.5)
_LNG = (68.0, 97.5)

_CACHE: dict[tuple[float, float], "Located"] = {}
_CACHE_MAX = 5_000
_lock = asyncio.Lock()
_last_call = 0.0


@dataclass
class Located:
    found: bool = False
    pincode: str | None = None
    line1: str | None = None          # the road; never a house number (see parse)
    locality: str | None = None       # neighbourhood / suburb - the courier's landmark
    city: str | None = None
    state: str | None = None
    attribution: str = ATTRIBUTION
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "found": self.found, "pincode": self.pincode, "line1": self.line1,
            "locality": self.locality, "city": self.city, "state": self.state,
            "attribution": self.attribution,
        }


def in_india(lat: float, lng: float) -> bool:
    return _LAT[0] <= lat <= _LAT[1] and _LNG[0] <= lng <= _LNG[1]


def parse(payload: dict) -> Located:
    """Nominatim's address block -> the fields the checkout form has."""
    a = (payload or {}).get("address") or {}
    if (a.get("country_code") or "").lower() not in ("", "in"):
        return Located()
    postcode = re.sub(r"\s+", "", a.get("postcode") or "")
    road = a.get("road") or a.get("pedestrian") or a.get("residential")
    # `house_number` is deliberately ignored. It is the nearest *mapped*
    # building, not hers: tested on a point in Indiranagar it answered
    # "375, 100 Feet Road". Pre-filled, that is a parcel delivered to a
    # neighbour whenever she does not notice it. The door is the one thing
    # she types.
    locality = (a.get("neighbourhood") or a.get("suburb") or a.get("quarter")
                or a.get("residential") or a.get("hamlet"))
    city = (a.get("city") or a.get("town") or a.get("village")
            or a.get("city_district") or a.get("municipality") or a.get("county"))
    line1 = road or None
    # A road named the same as its locality is one fact, not two.
    if locality and line1 and locality.strip().lower() == (road or "").strip().lower():
        locality = None
    return Located(
        found=bool(postcode or road or locality or city),
        pincode=postcode if re.fullmatch(r"\d{6}", postcode) else None,
        line1=line1,
        locality=locality,
        city=city,
        state=a.get("state"),
    )


async def _ask_nominatim(lat: float, lng: float) -> dict | None:
    global _last_call
    headers = {
        "User-Agent": f"ZISUN-checkout/1.0 (+https://zisun.in; {settings.LM_CONSUMER_CARE_EMAIL})",
        "Accept-Language": "en",
    }
    params = {"format": "jsonv2", "lat": f"{lat:.6f}", "lon": f"{lng:.6f}",
              "zoom": 18, "addressdetails": 1}
    async with _lock:
        wait = 1.0 - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                r = await client.get(NOMINATIM, params=params, headers=headers)
        except httpx.HTTPError as exc:
            logger.warning("reverse geocode unreachable: %s", type(exc).__name__)
            return None
    if r.status_code != 200:
        logger.warning("reverse geocode answered %s", r.status_code)
        return None
    try:
        return r.json()
    except ValueError:
        return None


async def reverse(lat: float, lng: float, redis=None) -> Located:
    """Best effort. Never raises: an empty answer means 'type it yourself'."""
    if not in_india(lat, lng):
        return Located()
    key = (round(lat, 4), round(lng, 4))          # ~11 m: one doorstep, one lookup
    if key in _CACHE:
        return _CACHE[key]

    payload = await _ask_nominatim(lat, lng)
    loc = parse(payload) if payload else Located()

    # India Post is the authority on what a pincode means; OSM's city and
    # state names are only used when it has nothing to say.
    if loc.pincode:
        try:
            from app.services.pincode import resolve as resolve_pincode
            place = await resolve_pincode(loc.pincode, redis=redis)
            loc.city = place.city or loc.city
            loc.state = place.state or loc.state
        except Exception as exc:                  # noqa: BLE001 - best effort
            logger.info("pincode confirm skipped: %s", type(exc).__name__)

    if payload is not None:                       # never cache an outage
        if len(_CACHE) >= _CACHE_MAX:
            _CACHE.clear()
        _CACHE[key] = loc
    return loc
