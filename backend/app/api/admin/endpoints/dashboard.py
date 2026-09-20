"""The analytics board — one request, everything the board renders.

Deliberately a single endpoint rather than eight. The board is read at a glance
on a phone between other jobs, and eight parallel requests over a connection to
Sydney is eight chances for one panel to arrive late and make the page look
broken.

Every section reports whether it has data, because most of them do not yet and
saying so is the honest answer. A revenue panel showing a confident zero reads
as "we sold nothing"; what it actually means today is "no order can be created
at all", which is a different fact and the one worth showing.

Two things about how it is built, both learned the hard way:

* Each panel is its own coroutine on its own session, and they run together.
  The database is a continent away; nine queries in a row cost nine crossings
  (~20s), nine at once cost one. A panel that fails names itself in
  `meta.errors` and the rest of the board still renders — on 2026-09-20 the
  whole board 500'd for a day over one missing variable, and nobody could see
  anything.
* The result is cached in this process and served stale while it refreshes in
  the background, and it is computed once at startup. The founder should
  never wait on the first load, and the metered Redis is not involved.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

import sqlalchemy as sa
from fastapi import APIRouter, Query
from sqlalchemy.future import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.analytics import AnalyticsEvent
from app.models.catalog import Product, ProductMedia, ProductVariant
from app.models.coupon import Coupon
from app.models.order import Order, OrderStatus, PaymentMethod
from app.models.user import User, UserRole
from app.services import ai
from app.services.shelf import (
    EVENT_WEIGHTS,
    WINDOW_DAYS,
    attention_score_subquery,
    half_life_days,
)

router = APIRouter()
logger = logging.getLogger(__name__)

FUNNEL_STEPS = [
    ("impressions", "product_impression", "Products shown"),
    ("views", "product_viewed", "Product opened"),
    ("size_guide", "size_guide_opened", "Size guide read"),
    ("add_to_cart", "add_to_cart", "Added to bag"),
    ("checkout", "checkout_initiated", "Checkout started"),
]
LOW_STOCK_THRESHOLD = 5

FRESH_SECONDS = 60          # served as-is
STALE_SECONDS = 60 * 60     # served, and refreshed behind the request
BRIEF_TTL_SECONDS = 15 * 60
IST = timezone(timedelta(hours=5, minutes=30))


# ── Cache: process-local, stale-while-revalidate ─────────────────────────────

_CACHE: dict[str, tuple[datetime, dict]] = {}
_REFRESHING: set[str] = set()


def _age(key: str) -> float | None:
    hit = _CACHE.get(key)
    return (datetime.now(timezone.utc) - hit[0]).total_seconds() if hit else None


async def _cached(key: str, ttl_fresh: int, ttl_stale: int, compute: Callable[[], Awaitable[dict]], refresh: bool = False) -> dict:
    """Fresh → return. Stale → return it now, recompute in the background.
    Missing → compute inline (the only case anyone waits)."""
    age = _age(key)
    if not refresh and age is not None and age < ttl_fresh:
        return _CACHE[key][1]
    if not refresh and age is not None and age < ttl_stale:
        if key not in _REFRESHING:
            _REFRESHING.add(key)

            async def _bg():
                try:
                    _CACHE[key] = (datetime.now(timezone.utc), await compute())
                except Exception:  # noqa: BLE001
                    logger.exception("dashboard: background refresh of %s failed", key)
                finally:
                    _REFRESHING.discard(key)

            asyncio.create_task(_bg())
        return _CACHE[key][1]
    payload = await compute()
    _CACHE[key] = (datetime.now(timezone.utc), payload)
    return payload


# ── Query helpers: one session per query, so they can run together ───────────

async def _scalar(stmt):
    async with AsyncSessionLocal() as s:
        return (await s.execute(stmt)).scalar_one()


async def _one(stmt):
    async with AsyncSessionLocal() as s:
        return (await s.execute(stmt)).one()


async def _all(stmt):
    async with AsyncSessionLocal() as s:
        return (await s.execute(stmt)).all()


async def _panels(**coros: Awaitable[Any]) -> tuple[dict[str, Any], list[str]]:
    """Run every panel's query at once. A failure becomes a name in `errors`
    and a None result, never a dead page."""
    names = list(coros)
    results = await asyncio.gather(*coros.values(), return_exceptions=True)
    out: dict[str, Any] = {}
    errors: list[str] = []
    for name, r in zip(names, results):
        if isinstance(r, BaseException):
            logger.error("dashboard: panel %s failed: %r", name, r)
            errors.append(f"{name}: {type(r).__name__}")
            out[name] = None
        else:
            out[name] = r
    return out, errors


def product_id_matches(column):
    """Join `analytics_events.properties->>'product_id'` to a product id.

    Uses the `->>` operator rather than `.astext`, which exists only on JSONB.
    `AnalyticsEvent.properties` is plain `JSON`, so `.astext` raises at query
    *construction* time — an AttributeError, not a SQL error, which means it
    cannot be caught by any amount of care about the database and only shows up
    when the endpoint is actually called. `->>` is valid for both json and jsonb
    and returns text either way.

    Extracted so a test can build it without a database.
    """
    return AnalyticsEvent.properties.op("->>")("product_id") == sa.cast(column, sa.Text)


def _count_of(event_type: str):
    return sa.func.count(sa.case((AnalyticsEvent.event_type == event_type, AnalyticsEvent.id)))


def _rate(num: int, den: int):
    return round(num / den, 4) if den else None


# ── The board ────────────────────────────────────────────────────────────────

async def compute_dashboard(days: int = 30) -> dict:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    previous = since - timedelta(days=days)
    attention_sq = attention_score_subquery()
    live_products = sa.and_(Product.deleted_at.is_(None), Product.is_active.is_(True))

    def sessions_between(a, b):
        return _scalar(
            select(sa.func.count(sa.distinct(AnalyticsEvent.session_id))).where(
                AnalyticsEvent.session_id.isnot(None),
                AnalyticsEvent.created_at >= a, AnalyticsEvent.created_at < b,
            )
        )

    r, errors = await _panels(
        # Four independent counts in one round trip.
        totals=_one(select(
            select(sa.func.count(Order.id)).scalar_subquery().label("orders_total"),
            select(sa.func.count(User.id)).where(User.role == UserRole.user).scalar_subquery().label("customers"),
            select(sa.func.count(AnalyticsEvent.id)).scalar_subquery().label("events_total"),
        )),
        sessions=sessions_between(since, now),
        sessions_previous=sessions_between(previous, since),
        revenue=_one(
            select(sa.func.count(Order.id), sa.func.coalesce(sa.func.sum(Order.total_amount), 0))
            .where(Order.created_at >= since)
        ),
        by_method=_all(
            select(Order.payment_method, sa.func.count(Order.id), sa.func.coalesce(sa.func.sum(Order.total_amount), 0))
            .where(Order.created_at >= since).group_by(Order.payment_method)
        ),
        by_status=_all(select(Order.status, sa.func.count(Order.id)).group_by(Order.status)),
        steps=_all(
            select(AnalyticsEvent.event_type, sa.func.count(AnalyticsEvent.id))
            .where(AnalyticsEvent.event_type.in_([e for _, e, _ in FUNNEL_STEPS]), AnalyticsEvent.created_at >= since)
            .group_by(AnalyticsEvent.event_type)
        ),
        # Per-product funnel in ONE grouped query: impressions, opens, bag adds
        # and checkouts as conditional counts, joined to the attention score the
        # shelf sorts by. A left join keeps products nobody has opened — those
        # rows are the point.
        products=_all(
            select(
                Product.id, Product.name, Product.shelf_rank,
                _count_of("product_impression").label("impressions"),
                _count_of("product_viewed").label("views"),
                _count_of("add_to_cart").label("add_to_cart"),
                _count_of("checkout_initiated").label("checkout"),
                sa.func.coalesce(attention_sq.c.score, 0.0).label("attention"),
            )
            .select_from(Product)
            .outerjoin(AnalyticsEvent, sa.and_(
                AnalyticsEvent.event_type.in_(["product_impression", "product_viewed", "add_to_cart", "checkout_initiated"]),
                AnalyticsEvent.created_at >= since,
                product_id_matches(Product.id),
            ))
            .outerjoin(attention_sq, attention_sq.c.product_id == sa.cast(Product.id, sa.Text))
            .where(live_products)
            .group_by(Product.id, Product.name, Product.shelf_rank, attention_sq.c.score)
            .order_by(sa.desc("attention"), sa.desc("views"))
        ),
        # Stock, by size and running low. Sizes are the unit the founder counts
        # in ("how many M are left"), and "running low" is the list she reorders
        # from.
        by_size=_all(
            select(ProductVariant.size, sa.func.count(ProductVariant.id), sa.func.coalesce(sa.func.sum(ProductVariant.stock), 0))
            .join(Product, Product.id == ProductVariant.product_id)
            .where(live_products, ProductVariant.is_active.is_(True))
            .group_by(ProductVariant.size)
        ),
        low_stock=_all(
            select(Product.name, ProductVariant.size, ProductVariant.color, ProductVariant.sku, ProductVariant.stock)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(live_products, ProductVariant.is_active.is_(True), ProductVariant.stock <= LOW_STOCK_THRESHOLD)
            .order_by(ProductVariant.stock.asc(), Product.name.asc()).limit(30)
        ),
    )

    totals = r["totals"]
    orders_total = int(totals.orders_total or 0) if totals else 0
    customers = int(totals.customers or 0) if totals else 0
    events_total = int(totals.events_total or 0) if totals else 0
    sessions = int(r["sessions"] or 0)
    sessions_previous = int(r["sessions_previous"] or 0)
    orders_window = int(r["revenue"][0] or 0) if r["revenue"] else 0
    revenue_window = int(r["revenue"][1] or 0) if r["revenue"] else 0
    by_method = {
        str(getattr(m, "value", m)): {"orders": int(c or 0), "revenue": int(v or 0)}
        for m, c, v in (r["by_method"] or [])
    }
    by_status = {str(getattr(s, "value", s)): int(c or 0) for s, c in (r["by_status"] or [])}
    step_counts = {et: int(n or 0) for et, n in (r["steps"] or [])}
    # A step nobody has reached is absent from the grouping and must still
    # appear as a zero — a gap in the funnel is the thing worth seeing.
    funnel = [{"key": k, "event": e, "label": l, "count": step_counts.get(e, 0)} for k, e, l in FUNNEL_STEPS]
    # Orders are the last step and come from the orders table, not an event: a
    # purchase that only exists as an analytics event is one we cannot ship.
    funnel.append({"key": "orders", "event": None, "label": "Ordered", "count": orders_window})

    # ctr = opens / shown says whether the card earns a tap; cart_rate = bag
    # adds / opens says whether the page earns the sale. High ctr and low
    # cart_rate is a photograph better than its page; the reverse, a page
    # better than its photograph. None, not 0, when the denominator is 0.
    products_attention = [
        {
            "id": str(p.id), "name": p.name, "shelf_rank": p.shelf_rank,
            "impressions": int(p.impressions or 0), "views": int(p.views or 0),
            "add_to_cart": int(p.add_to_cart or 0), "checkout": int(p.checkout or 0),
            "ctr": _rate(int(p.views or 0), int(p.impressions or 0)),
            "cart_rate": _rate(int(p.add_to_cart or 0), int(p.views or 0)),
            "attention": round(float(p.attention or 0.0), 2),
        }
        for p in (r["products"] or [])
    ]
    products_by_views = sorted(
        ({"id": p["id"], "name": p["name"], "views": p["views"]} for p in products_attention),
        key=lambda p: -p["views"],
    )
    by_size = sorted(
        ({"size": s or "One size", "variants": int(v or 0), "units": int(u or 0)} for s, v, u in (r["by_size"] or [])),
        key=lambda x: -x["units"],
    )
    low_stock = [
        {"product": n, "size": s or "", "colour": c or "", "sku": sku, "stock": int(st or 0)}
        for n, s, c, sku, st in (r["low_stock"] or [])
    ]

    return {
        "meta": {
            "window_days": days,
            "generated_at": now.isoformat(),
            "checkout_enabled": settings.checkout_enabled,
            "launch_mode": settings.LAUNCH_MODE or "live",
            "events_recorded": events_total,
            "errors": errors,
        },
        "commerce": {
            "orders_all_time": orders_total,
            "orders_window": orders_window,
            "revenue_window_paise": revenue_window,
            "by_payment_method": by_method,
            "by_status": by_status,
            "customers": customers,
            # Contribution margin needs four inputs nobody has entered. Null with
            # its reasons, rather than a number built on guesses.
            "contribution_margin": None,
            "contribution_margin_blocked_on": ["cost per garment", "shipping cost per parcel", "payment gateway fee", "RTO reserve"],
        },
        "attention": {
            "sessions": sessions,
            "sessions_previous": sessions_previous,
            "funnel": funnel,
            "products_by_views": products_by_views,
            "never_viewed": [p for p in products_by_views if p["views"] == 0],
            "products": products_attention,
            "ranking": {"window_days": WINDOW_DAYS, "half_life_days": round(half_life_days(), 1), "weights": EVENT_WEIGHTS},
        },
        "inventory": {
            "units": sum(x["units"] for x in by_size),
            "variants": sum(x["variants"] for x in by_size),
            "by_size": by_size,
            "low_stock": low_stock,
            "low_stock_threshold": LOW_STOCK_THRESHOLD,
        },
    }


@router.get("/dashboard", tags=["Admin — Dashboard"])
async def admin_dashboard(
    days: int = Query(30, ge=1, le=365, description="Window for time-bounded figures"),
    refresh: bool = Query(False, description="Skip the cache and rebuild"),
):
    return await _cached(f"dashboard:{days}", FRESH_SECONDS, STALE_SECONDS, lambda: compute_dashboard(days), refresh)


# ── The brief ────────────────────────────────────────────────────────────────
#
# "What is happening today, this week, and is anything critical" — the
# question the founder actually opens the console with. The numbers come from
# the queries below; the sentences come from Claude when a key is set and from
# plain rules when it is not, so the panel never depends on the model to exist.

async def _brief_facts() -> dict:
    now = datetime.now(timezone.utc)
    today_start = now.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    week_start = now - timedelta(days=7)
    prev_week_start = now - timedelta(days=14)

    def orders_since(since):
        return _one(
            select(sa.func.count(Order.id), sa.func.coalesce(sa.func.sum(Order.total_amount), 0))
            .where(Order.created_at >= since, Order.status != OrderStatus.CANCELLED)
        )

    def sessions_between(a, b):
        return _scalar(
            select(sa.func.count(sa.distinct(AnalyticsEvent.session_id))).where(
                AnalyticsEvent.session_id.isnot(None), AnalyticsEvent.created_at >= a, AnalyticsEvent.created_at < b,
            )
        )

    live = sa.and_(Product.deleted_at.is_(None), Product.is_active.is_(True))
    r, errors = await _panels(
        today=orders_since(today_start),
        week=orders_since(week_start),
        waiting=_scalar(select(sa.func.count(Order.id)).where(
            Order.status.in_([OrderStatus.PAID, OrderStatus.PACKED]), Order.created_at < now - timedelta(days=2))),
        cod_unconfirmed=_scalar(select(sa.func.count(Order.id)).where(
            Order.payment_method == PaymentMethod.COD, Order.cod_confirmed_at.is_(None),
            Order.status.in_([OrderStatus.CREATED, OrderStatus.PAID]))),
        sessions_week=sessions_between(week_start, now),
        sessions_prev=sessions_between(prev_week_start, week_start),
        top=_all(
            select(Product.name, sa.func.count(AnalyticsEvent.id).label("views"))
            .select_from(Product)
            .join(AnalyticsEvent, sa.and_(AnalyticsEvent.event_type == "product_viewed", AnalyticsEvent.created_at >= week_start, product_id_matches(Product.id)))
            .where(Product.deleted_at.is_(None)).group_by(Product.name).order_by(sa.desc("views")).limit(3)
        ),
        live_products=_scalar(select(sa.func.count(Product.id)).where(live)),
        sold_out=_scalar(
            select(sa.func.count(ProductVariant.id)).join(Product, Product.id == ProductVariant.product_id)
            .where(live, ProductVariant.is_active.is_(True), ProductVariant.stock == 0)),
        low=_all(
            select(Product.name, ProductVariant.size, ProductVariant.color, ProductVariant.stock)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(live, ProductVariant.is_active.is_(True), ProductVariant.stock > 0, ProductVariant.stock <= LOW_STOCK_THRESHOLD)
            .order_by(ProductVariant.stock.asc()).limit(8)),
        no_photos=_all(
            select(Product.name).outerjoin(ProductMedia, ProductMedia.product_id == Product.id)
            .where(live).group_by(Product.id, Product.name).having(sa.func.count(ProductMedia.id) == 0).limit(8)),
        coupons=_scalar(select(sa.func.count(Coupon.id)).where(
            Coupon.is_active.is_(True), Coupon.is_referral.is_(False),
            sa.or_(Coupon.expires_at.is_(None), Coupon.expires_at > now))),
    )
    today = r["today"] or (0, 0)
    week = r["week"] or (0, 0)
    return {
        "as_of": now.isoformat(),
        "errors": errors,
        "today": {"orders": int(today[0] or 0), "revenue_paise": int(today[1] or 0)},
        "week": {"orders": int(week[0] or 0), "revenue_paise": int(week[1] or 0),
                 "sessions": int(r["sessions_week"] or 0), "sessions_previous_week": int(r["sessions_prev"] or 0),
                 "top_products": [{"name": n, "views": int(v)} for n, v in (r["top"] or [])]},
        "orders": {"waiting_to_ship_over_2_days": int(r["waiting"] or 0), "cod_unconfirmed": int(r["cod_unconfirmed"] or 0)},
        "catalogue": {"live_products": int(r["live_products"] or 0), "sold_out_variants": int(r["sold_out"] or 0),
                      "low_stock": [{"product": n, "size": s, "colour": c, "stock": int(st)} for n, s, c, st in (r["low"] or [])],
                      "without_photos": [row[0] for row in (r["no_photos"] or [])],
                      "coupons_live": int(r["coupons"] or 0)},
        "system": {"launch_mode": settings.LAUNCH_MODE or "live", "checkout_enabled": settings.checkout_enabled, "ai": settings.has_ai},
    }


def _rule_brief(f: dict) -> dict:
    """The brief without a model: the same shape, in plain sentences."""
    rs = lambda p: f"₹{p // 100:,}"  # noqa: E731
    bullets, critical = [], []
    browse = not f["system"]["checkout_enabled"]
    if browse:
        bullets.append("The shop is in browse mode: orders come in over WhatsApp, not through checkout.")
    else:
        bullets.append(f"Today: {f['today']['orders']} orders, {rs(f['today']['revenue_paise'])}. This week: {f['week']['orders']} orders, {rs(f['week']['revenue_paise'])}.")
    sw, sp = f["week"]["sessions"], f["week"]["sessions_previous_week"]
    # A percentage on a tiny base is noise: 2 visits to 141 is "+6950%", which
    # reads as a bug. Below twenty last week, say the two numbers instead.
    if sp >= 20:
        change = round((sw - sp) / sp * 100)
        bullets.append(f"{sw} visits this week, {'+' if change >= 0 else ''}{change}% on last week.")
    elif sp:
        bullets.append(f"{sw} visits this week, {sp} the week before.")
    else:
        bullets.append(f"{sw} visits this week.")
    if f["week"]["top_products"]:
        bullets.append("Most opened: " + ", ".join(f"{p['name']} ({p['views']})" for p in f["week"]["top_products"]) + ".")
    if f["orders"]["waiting_to_ship_over_2_days"]:
        critical.append(f"{f['orders']['waiting_to_ship_over_2_days']} paid orders have waited over two days to ship.")
    if f["orders"]["cod_unconfirmed"]:
        critical.append(f"{f['orders']['cod_unconfirmed']} COD orders are still unconfirmed.")
    if f["catalogue"]["without_photos"]:
        critical.append("Live without photographs: " + ", ".join(f["catalogue"]["without_photos"][:4]) + ".")
    if f["catalogue"]["sold_out_variants"]:
        bullets.append(f"{f['catalogue']['sold_out_variants']} sizes/colours show zero stock across {f['catalogue']['live_products']} live products.")
    if f["catalogue"]["low_stock"]:
        bullets.append("Running low: " + ", ".join(f"{l['product']} {l['size'] or ''} {l['colour'] or ''}".strip() + f" ({l['stock']})" for l in f["catalogue"]["low_stock"][:4]) + ".")
    if not f["catalogue"]["coupons_live"]:
        bullets.append("No coupon is live — the Deals band on the home page is empty.")
    headline = "Quiet day in browse mode." if browse and not critical else ("Something needs you today." if critical else "All clear today.")
    return {"headline": headline, "bullets": bullets, "critical": critical, "source": "rules"}


BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string", "description": "One line, at most twelve words, in plain English."},
        "bullets": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 6,
                    "description": "What happened today and this week, one fact per bullet, numbers included."},
        "critical": {"type": "array", "items": {"type": "string"},
                     "description": "Only things that need action today. Empty when nothing does."},
    },
    "required": ["headline", "bullets", "critical"],
}


async def compute_brief() -> dict:
    facts = await _brief_facts()
    brief = _rule_brief(facts)
    if settings.has_ai:
        try:
            import json
            written = await ai.extract(
                "You write a morning brief for the founder of ZISUN, a small handloom clothing label. "
                "Plain English, no hype, numbers exactly as given, rupees not paise (divide paise by 100). "
                "Say what needs doing today under `critical`, and only that. Never invent a fact.",
                json.dumps(facts, ensure_ascii=False),
                BRIEF_SCHEMA, name="brief", description="The founder's brief for today.", max_tokens=700,
            )
            brief = {**written, "source": settings.AI_MODEL}
        except ai.AIUnavailable as exc:
            brief["note"] = f"Claude unavailable: {exc}."
    return {"brief": brief, "facts": facts}


@router.get("/dashboard/brief", tags=["Admin — Dashboard"])
async def admin_dashboard_brief(refresh: bool = Query(False, description="Skip the cache and rebuild")):
    return await _cached("brief", BRIEF_TTL_SECONDS, 6 * 60 * 60, compute_brief, refresh)


# ── Warm-up ──────────────────────────────────────────────────────────────────

async def warm_dashboard(every_seconds: int = 300) -> None:
    """Compute the board and the brief before anyone asks, then keep them warm.

    Started from the api's lifespan. One replica, one loop; the cost is a
    handful of queries every five minutes, and the reward is that the founder
    never watches a spinner.
    """
    await asyncio.sleep(3)
    while True:
        for key, ttl, fn in (("dashboard:30", FRESH_SECONDS, lambda: compute_dashboard(30)), ("brief", BRIEF_TTL_SECONDS, compute_brief)):
            age = _age(key)
            if age is None or age >= ttl:
                try:
                    _CACHE[key] = (datetime.now(timezone.utc), await fn())
                except Exception:  # noqa: BLE001
                    logger.exception("dashboard: warm-up of %s failed", key)
        await asyncio.sleep(every_seconds)
