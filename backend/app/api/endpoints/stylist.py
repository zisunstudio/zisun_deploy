"""The fit stylist: "I'm 160 cm and usually wear M - which size?"

The one place Claude answers a customer, and it is fenced on every side:

  * The size is decided by rules (app/services/fit.py), never by the model.
    Claude only turns the decision into a sentence in the label's voice, and
    a sentence that names any other size is thrown away.
  * Nothing the customer types reaches the prompt. The inputs are a number
    and two choices from fixed lists, so there is nothing to inject, and
    every possible answer can be cached: a product has at most a few hundred
    distinct questions, each paid for once.
  * A daily ceiling on model calls (STYLIST_DAILY_CAP) and an hourly limit
    per visitor (STYLIST_PER_IP_HOURLY). Past either, or with no key, no
    credits or a slow API, the rules answer is served as it stands - the
    customer always gets an answer, just a plainer one.

Redis carries the counters and the cache and is optional: if it is down
the endpoint still answers, from rules only.
"""
import hashlib
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.client_ip import client_ip
from app.core.config import settings
from app.core.database import get_async_db
from app.core.redis import get_redis_client
from app.services import ai
from app.services.catalog import CatalogService
from app.services.fit import SIZE_ORDER, FitAdvice, feet_inches, recommend

logger = logging.getLogger(__name__)
router = APIRouter()

CACHE_DAYS = 7

VOICE = (
    "You are Sushmita, founder of ZISUN, a small Indian women's clothing label. "
    "You are helping a customer choose a size, the way you would on WhatsApp: warm, "
    "plain Indian English, first person, no exclamation marks, no emoji, no hype. "
    "You never state a measurement, fabric or feature you were not given."
)


class FitRequest(BaseModel):
    product_id: uuid.UUID
    height_cm: int = Field(..., ge=130, le=200)
    usual_size: Literal["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"]
    preference: Literal["relaxed", "as_designed", "fitted"] = "as_designed"


class FitResponse(BaseModel):
    size: str
    headline: str
    reasons: list[str]
    confidence: str
    reference: Optional[str] = None
    height_delta_cm: Optional[int] = None
    note: Optional[str] = None          # Claude's sentence, when there is one
    source: Literal["stylist", "rules"] = "rules"


async def _redis():
    try:
        return await get_redis_client()
    except Exception:  # noqa: BLE001
        return None


async def _within(redis, key: str, limit: int, ttl: int) -> bool:
    """Count one use against `key`; True while under `limit`. Fails open."""
    if redis is None:
        return True
    try:
        n = await redis.incr(key)
        if n == 1:
            await redis.expire(key, ttl)
        return n <= limit
    except Exception:  # noqa: BLE001
        return True


def _names(text: str, size: str) -> bool:
    """The size as a word of its own - "M" in "Take M", not the M in "Me"."""
    return re.search(rf"(?<![A-Za-z0-9]){re.escape(size.upper())}(?![A-Za-z0-9])", text) is not None


def _mentions_other_size(text: str, size: str) -> bool:
    return any(_names(text, s) for s in SIZE_ORDER if s != size.upper())


async def _phrase(product_name: str, height_cm: int, usual: str, pref: str, advice: FitAdvice) -> Optional[str]:
    facts = "\n".join(f"- {r}" for r in advice.reasons)
    user = (
        f"Piece: {product_name}\n"
        f"Customer: {height_cm} cm ({feet_inches(height_cm)}), usually wears {usual}, "
        f"likes it {pref.replace('_', ' ')}.\n"
        f"Decided size: {advice.size}\n"
        f"Why (these are the only facts you may use):\n{facts}\n\n"
        f"Write one or two short sentences to her recommending {advice.size}. "
        f"Recommend exactly {advice.size} and mention no other size. 45 words at most."
    )
    schema = {
        "type": "object",
        "properties": {"note": {"type": "string", "maxLength": 320}},
        "required": ["note"],
        "additionalProperties": False,
    }
    result = await ai.extract(VOICE, user, schema, name="fit_note", max_tokens=200,
                              model=settings.STYLIST_MODEL, timeout=8.0)
    note = str(result.get("note") or "").strip()
    if not note or not _names(note, advice.size) or _mentions_other_size(note, advice.size):
        # The model may explain the decision, never change it.
        return None
    return note[:320]


@router.post("/fit", response_model=FitResponse)
async def fit(body: FitRequest, request: Request, db: AsyncSession = Depends(get_async_db)):
    product = await CatalogService(db).get_product(body.product_id)  # 404s itself
    if not product or not product.is_active:
        raise HTTPException(404, "That piece is not available.")

    in_stock = [v.size for v in product.variants if v.is_active and v.size and v.stock > 0]
    if not in_stock:
        raise HTTPException(409, "This piece is sold out in every size.")

    chart = product.size_chart or {}
    advice = recommend(
        available_sizes=in_stock,
        usual_size=body.usual_size,
        height_cm=body.height_cm,
        preference=body.preference,
        fit=getattr(product, "fit", None),
        garment_length=getattr(product, "garment_length", None),
        worn_by_founder=bool(getattr(product, "worn_by_founder", False)),
        model_size=getattr(product, "model_size", None),
        model_height=getattr(product, "model_height", None),
        has_size_chart=bool(chart.get("rows")),
    )
    response = FitResponse(**advice.__dict__)

    if not settings.has_ai:
        return response

    redis = await _redis()
    # The cache key includes the product's last edit, so changing the chart
    # or the photos' model invalidates every cached sentence for it.
    stamp = product.updated_at.isoformat() if product.updated_at else ""
    key = hashlib.sha256(
        f"{product.id}|{stamp}|{body.height_cm}|{body.usual_size}|{body.preference}|{advice.size}".encode()
    ).hexdigest()[:32]
    cache_key = f"stylist:v1:{key}"

    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                response.note = json.loads(cached).get("note")
                response.source = "stylist" if response.note else "rules"
                return response
        except Exception:  # noqa: BLE001
            pass

    # After a failure (no credits, bad key, Anthropic down) stop asking for
    # ten minutes: each attempt would cost the customer a round trip for an
    # answer that is going to be the rules one anyway.
    if redis is not None:
        try:
            if await redis.get("stylist:down"):
                return response
        except Exception:  # noqa: BLE001
            pass

    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    if not await _within(redis, f"stylist:ip:{client_ip(request)}:{hour}", settings.STYLIST_PER_IP_HOURLY, 3600):
        return response
    if not await _within(redis, f"stylist:calls:{today}", settings.STYLIST_DAILY_CAP, 86400 * 2):
        return response

    try:
        note = await _phrase(product.name, body.height_cm, body.usual_size, body.preference, advice)
    except ai.AIUnavailable as exc:
        logger.info("stylist falling back to rules: %s", exc)
        if redis is not None:
            try:
                await redis.set("stylist:down", str(exc)[:120], ex=600)
            except Exception:  # noqa: BLE001
                pass
        return response

    if redis is not None:
        try:
            await redis.set(cache_key, json.dumps({"note": note}), ex=86400 * CACHE_DAYS)
        except Exception:  # noqa: BLE001
            pass
    response.note = note
    response.source = "stylist" if note else "rules"
    return response
