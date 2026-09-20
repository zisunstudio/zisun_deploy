"""The admin dashboard aggregate — one request, everything the board renders.

Deliberately a single endpoint rather than eight. The board is read at a glance
on a phone between other jobs, and eight parallel requests over a connection to
Sydney is eight chances for one panel to arrive late and make the page look
broken.

Every section reports whether it has data, because most of them do not yet and
saying so is the honest answer. A revenue panel showing a confident zero reads
as "we sold nothing"; what it actually means today is "no order can be created
at all", which is a different fact and the one worth showing.
"""
from datetime import datetime, timedelta, timezone

import json
import logging

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.core.database import get_async_db
from app.core.redis import get_redis
from app.models.analytics import AnalyticsEvent
from app.models.catalog import Product, ProductMedia, ProductVariant
from app.models.coupon import Coupon
from app.services import ai
from app.models.order import Order, OrderStatus, PaymentMethod
from app.models.user import User, UserRole
from app.services.shelf import (
    EVENT_WEIGHTS,
    WINDOW_DAYS,
    attention_score_subquery,
    half_life_days,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# The funnel, in the order a shopper walks it. Kept as data rather than a chain
# of queries so a missing step reports as zero rather than vanishing from the
# response and leaving a gap in the chart.
FUNNEL_STEPS = [
    ("impressions", "product_impression", "Products shown"),
    ("views", "product_viewed", "Product opened"),
    ("size_guide", "size_guide_opened", "Size guide read"),
    ("add_to_cart", "add_to_cart", "Added to bag"),
    ("checkout", "checkout_initiated", "Checkout started"),
]

# Below this a variant is worth flagging on the board rather than buried in the
# inventory screen. Chosen to match the storefront, which starts saying "only N
# left" at five.
LOW_STOCK_THRESHOLD = 5

# The board is a glance, not a live feed, and every figure on it moves on the
# scale of hours. Sixty seconds of cache turns a five-second page into an
# instant one for everybody after the first, at a cost of two Redis commands
# a minute - which matters, because the Upstash tier is metered and has been
# exhausted once already.
CACHE_KEY = "admin:dashboard:v2"
CACHE_SECONDS = 60

# Process-local cache, checked before Redis. Redis is metered (and has spent
# its quota once already); this costs nothing and survives it being down. One
# api replica means one cache, which is the only case that matters today.
_LOCAL: dict[str, tuple[datetime, dict]] = {}


def _local_get(key: str, ttl: int):
    hit = _LOCAL.get(key)
    if hit and (datetime.now(timezone.utc) - hit[0]).total_seconds() < ttl:
        return hit[1]
    return None


def _local_set(key: str, payload: dict) -> None:
    _LOCAL[key] = (datetime.now(timezone.utc), payload)


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


@router.get("/dashboard", tags=["Admin — Dashboard"])
async def admin_dashboard(
    days: int = Query(30, ge=1, le=365, description="Window for time-bounded figures"),
    db: AsyncSession = Depends(get_async_db),
    redis=Depends(get_redis),
):
    cache_key = f"{CACHE_KEY}:{days}"
    local = _local_get(cache_key, CACHE_SECONDS)
    if local is not None:
        return local
    if redis is not None:
        try:
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            # A dashboard is not worth failing over a cache miss or a Redis
            # hiccup; fall through and compute it.
            pass

    since = datetime.now(timezone.utc) - timedelta(days=days)

    # ── Commerce ─────────────────────────────────────────────────────────────
    # Four independent counts in one round trip. Postgres evaluates the scalar
    # subqueries together; issuing them separately cost four crossings to
    # Sydney for four integers.
    totals = (
        await db.execute(
            select(
                select(sa.func.count(Order.id)).scalar_subquery().label("orders_total"),
                select(sa.func.count(User.id))
                .where(User.role == UserRole.user)
                .scalar_subquery()
                .label("customers"),
                select(sa.func.count(AnalyticsEvent.id))
                .scalar_subquery()
                .label("events_total"),
                select(sa.func.count(sa.distinct(AnalyticsEvent.session_id)))
                .where(
                    AnalyticsEvent.session_id.isnot(None),
                    AnalyticsEvent.created_at >= since,
                )
                .scalar_subquery()
                .label("sessions"),
            )
        )
    ).one()
    orders_total = int(totals.orders_total or 0)
    customers = int(totals.customers or 0)
    events_total = int(totals.events_total or 0)
    sessions = int(totals.sessions or 0)

    revenue_row = (
        await db.execute(
            select(
                sa.func.count(Order.id),
                sa.func.coalesce(sa.func.sum(Order.total_amount), 0),
            ).where(Order.created_at >= since)
        )
    ).one()
    orders_window, revenue_window = int(revenue_row[0] or 0), int(revenue_row[1] or 0)

    by_method = {
        str(getattr(m, "value", m)): {"orders": int(c or 0), "revenue": int(r or 0)}
        for m, c, r in (
            await db.execute(
                select(
                    Order.payment_method,
                    sa.func.count(Order.id),
                    sa.func.coalesce(sa.func.sum(Order.total_amount), 0),
                )
                .where(Order.created_at >= since)
                .group_by(Order.payment_method)
            )
        ).all()
    }

    by_status = {
        str(getattr(s, "value", s)): int(c or 0)
        for s, c in (
            await db.execute(
                select(Order.status, sa.func.count(Order.id)).group_by(Order.status)
            )
        ).all()
    }

    # ── Attention ────────────────────────────────────────────────────────────
    # One grouped query, not one per step. Five round trips to Sydney for five
    # integers is most of a second on its own.
    step_counts = {
        et: int(n or 0)
        for et, n in (
            await db.execute(
                select(AnalyticsEvent.event_type, sa.func.count(AnalyticsEvent.id))
                .where(
                    AnalyticsEvent.event_type.in_([e for _, e, _ in FUNNEL_STEPS]),
                    AnalyticsEvent.created_at >= since,
                )
                .group_by(AnalyticsEvent.event_type)
            )
        ).all()
    }
    funnel = [
        # A step nobody has reached is absent from the grouping, and must still
        # appear as a zero — a gap in the funnel is the thing worth seeing.
        {"key": key, "event": event_type, "label": label,
         "count": step_counts.get(event_type, 0)}
        for key, event_type, label in FUNNEL_STEPS
    ]
    # Orders are the last step, and they come from the orders table rather than
    # an event: a purchase that only exists as an analytics event is a purchase
    # we cannot ship.
    funnel.append(
        {"key": "orders", "event": None, "label": "Ordered", "count": orders_window}
    )

    # Views per product, including the ones nobody has opened — those are the
    # point. A left join keeps a product with zero views in the result, where an
    # inner join would silently drop exactly the rows worth seeing.
    # Per-product funnel in ONE grouped query: impressions, opens, bag adds and
    # checkouts, each as a conditional count, joined to the same attention score
    # the shelf sorts by. A left join keeps products nobody has opened in the
    # result — those rows are the point.
    #
    # The two rates are what the founder actually asked for: "where is the
    # attention going". ctr = opens / impressions says whether the card earns
    # a tap; cart_rate = bag adds / opens says whether the page earns the sale.
    # A product with a high ctr and low cart_rate has a photograph better than
    # its page; the reverse has a page better than its photograph. Both are
    # None rather than 0 when the denominator is 0, so a product with no
    # impressions is not reported as converting at 0%.
    def _count_of(event_type):
        return sa.func.count(
            sa.case((AnalyticsEvent.event_type == event_type, AnalyticsEvent.id))
        )

    errors: list[str] = []
    product_rows = []
    try:
        attention_sq = attention_score_subquery()
        product_rows = (
            await db.execute(
                select(
                    Product.id,
                    Product.name,
                    Product.shelf_rank,
                    _count_of("product_impression").label("impressions"),
                    _count_of("product_viewed").label("views"),
                    _count_of("add_to_cart").label("add_to_cart"),
                    _count_of("checkout_initiated").label("checkout"),
                    sa.func.coalesce(attention_sq.c.score, 0.0).label("attention"),
                )
                .select_from(Product)
                .outerjoin(
                    AnalyticsEvent,
                    sa.and_(
                        AnalyticsEvent.event_type.in_(
                            ["product_impression", "product_viewed", "add_to_cart", "checkout_initiated"]
                        ),
                        AnalyticsEvent.created_at >= since,
                        product_id_matches(Product.id),
                    ),
                )
                .outerjoin(attention_sq, attention_sq.c.product_id == sa.cast(Product.id, sa.Text))
                .where(Product.deleted_at.is_(None), Product.is_active.is_(True))
                .group_by(Product.id, Product.name, Product.shelf_rank, attention_sq.c.score)
                .order_by(sa.desc("attention"), sa.desc("views"))
            )
        ).all()
    except Exception as exc:  # noqa: BLE001 - the page must render without this panel
        logger.exception("dashboard: per-product funnel failed")
        errors.append(f"product funnel: {type(exc).__name__}")
        product_rows = []

    def _rate(num: int, den: int):
        return round(num / den, 4) if den else None

    products_attention = [
        {
            "id": str(r.id),
            "name": r.name,
            "shelf_rank": r.shelf_rank,
            "impressions": int(r.impressions or 0),
            "views": int(r.views or 0),
            "add_to_cart": int(r.add_to_cart or 0),
            "checkout": int(r.checkout or 0),
            "ctr": _rate(int(r.views or 0), int(r.impressions or 0)),
            "cart_rate": _rate(int(r.add_to_cart or 0), int(r.views or 0)),
            "attention": round(float(r.attention or 0.0), 2),
        }
        for r in product_rows
    ]
    # Kept for the existing panel; same data, narrower shape.
    products_by_views = sorted(
        ({"id": p["id"], "name": p["name"], "views": p["views"]} for p in products_attention),
        key=lambda p: -p["views"],
    )

    payload = {
        # What the board needs to explain itself. A panel that knows *why* it is
        # empty can say so, instead of showing a zero the reader has to
        # interpret.
        "meta": {
            "window_days": days,
            "generated_at": datetime.now(timezone.utc).isoformat(),
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
            # Stated rather than computed. The inputs -- cost per garment, real
            # shipping cost, gateway fee, RTO reserve -- have never existed in
            # this system, and a margin figure invented from the ones that do
            # would be worse than none.
            "contribution_margin": None,
            "contribution_margin_blocked_on": [
                "cost per garment",
                "shipping cost per parcel",
                "payment gateway fee",
                "RTO reserve",
            ],
        },
        "attention": {
            "sessions": sessions,
            "funnel": funnel,
            "products_by_views": products_by_views,
            "never_viewed": [p for p in products_by_views if p["views"] == 0],
            "products": products_attention,
            "ranking": {
                "window_days": WINDOW_DAYS,
                "half_life_days": round(half_life_days(), 1),
                "weights": EVENT_WEIGHTS,
            },
        },
        "inventory": {
            "units": sum(r["units"] for r in by_size),
            "variants": sum(r["variants"] for r in by_size),
            "by_size": by_size,
            "low_stock": low_stock,
            "low_stock_threshold": LOW_STOCK_THRESHOLD,
        },
    }

    _local_set(cache_key, payload)
    if redis is not None:
        try:
            await redis.set(cache_key, json.dumps(payload), ex=CACHE_SECONDS)
        except Exception:
            pass
    return payload


# ── The brief ──────────────────────────────────────────────────────────────
#
# "What is happening today, this week, and is anything critical" — the
# question the founder actually opens the console with. The numbers come
# from the queries below; the sentences come from Claude when a key is set
# and from plain rules when it is not, so the panel never depends on the
# model to exist.

BRIEF_TTL_SECONDS = 15 * 60
IST = timezone(timedelta(hours=5, minutes=30))


async def _brief_facts(db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    today_start = now.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    week_start = now - timedelta(days=7)
    prev_week_start = now - timedelta(days=14)

    async def orders_since(since):
        row = (await db.execute(
            select(sa.func.count(Order.id), sa.func.coalesce(sa.func.sum(Order.total_amount), 0))
            .where(Order.created_at >= since, Order.status != OrderStatus.CANCELLED)
        )).one()
        return int(row[0] or 0), int(row[1] or 0)

    today_orders, today_rev = await orders_since(today_start)
    week_orders, week_rev = await orders_since(week_start)

    # Orders that are paid or confirmed and have sat unshipped for two days.
    waiting = (await db.execute(
        select(sa.func.count(Order.id)).where(
            Order.status.in_([OrderStatus.PAID, OrderStatus.PACKED]),
            Order.created_at < now - timedelta(days=2),
        )
    )).scalar_one()
    cod_unconfirmed = (await db.execute(
        select(sa.func.count(Order.id)).where(
            Order.payment_method == PaymentMethod.COD,
            Order.cod_confirmed_at.is_(None),
            Order.status.in_([OrderStatus.CREATED, OrderStatus.PAID]),
        )
    )).scalar_one()

    async def sessions_between(a, b):
        return int((await db.execute(
            select(sa.func.count(sa.distinct(AnalyticsEvent.session_id))).where(
                AnalyticsEvent.session_id.isnot(None),
                AnalyticsEvent.created_at >= a, AnalyticsEvent.created_at < b,
            )
        )).scalar_one() or 0)

    sessions_week = await sessions_between(week_start, now)
    sessions_prev = await sessions_between(prev_week_start, week_start)

    top = (await db.execute(
        select(Product.name, sa.func.count(AnalyticsEvent.id).label("views"))
        .select_from(Product)
        .join(AnalyticsEvent, sa.and_(
            AnalyticsEvent.event_type == "product_viewed",
            AnalyticsEvent.created_at >= week_start,
            product_id_matches(Product.id),
        ))
        .where(Product.deleted_at.is_(None))
        .group_by(Product.name).order_by(sa.desc("views")).limit(3)
    )).all()

    live_products = (await db.execute(
        select(sa.func.count(Product.id)).where(Product.deleted_at.is_(None), Product.is_active.is_(True))
    )).scalar_one()
    sold_out_variants = (await db.execute(
        select(sa.func.count(ProductVariant.id)).join(Product, Product.id == ProductVariant.product_id)
        .where(Product.deleted_at.is_(None), ProductVariant.is_active.is_(True), ProductVariant.stock == 0)
    )).scalar_one()
    low = (await db.execute(
        select(Product.name, ProductVariant.size, ProductVariant.color, ProductVariant.stock)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(Product.deleted_at.is_(None), ProductVariant.is_active.is_(True),
               ProductVariant.stock > 0, ProductVariant.stock <= LOW_STOCK_THRESHOLD)
        .order_by(ProductVariant.stock.asc()).limit(8)
    )).all()
    no_photos = (await db.execute(
        select(Product.name).outerjoin(ProductMedia, ProductMedia.product_id == Product.id)
        .where(Product.deleted_at.is_(None), Product.is_active.is_(True))
        .group_by(Product.id, Product.name).having(sa.func.count(ProductMedia.id) == 0).limit(8)
    )).scalars().all()
    coupons_live = (await db.execute(
        select(sa.func.count(Coupon.id)).where(
            Coupon.is_active.is_(True), Coupon.is_referral.is_(False),
            sa.or_(Coupon.expires_at.is_(None), Coupon.expires_at > now),
        )
    )).scalar_one()

    return {
        "as_of": now.isoformat(),
        "today": {"orders": today_orders, "revenue_paise": today_rev},
        "week": {"orders": week_orders, "revenue_paise": week_rev,
                 "sessions": sessions_week, "sessions_previous_week": sessions_prev,
                 "top_products": [{"name": n, "views": int(v)} for n, v in top]},
        "orders": {"waiting_to_ship_over_2_days": int(waiting or 0),
                   "cod_unconfirmed": int(cod_unconfirmed or 0)},
        "catalogue": {"live_products": int(live_products or 0),
                      "sold_out_variants": int(sold_out_variants or 0),
                      "low_stock": [{"product": n, "size": s, "colour": c, "stock": int(st)} for n, s, c, st in low],
                      "without_photos": list(no_photos),
                      "coupons_live": int(coupons_live or 0)},
        "system": {"launch_mode": settings.LAUNCH_MODE or "live",
                   "checkout_enabled": settings.checkout_enabled,
                   "ai": settings.has_ai},
    }


def _rule_brief(f: dict) -> dict:
    """The brief without a model: the same shape, in plain sentences."""
    rs = lambda p: f"₹{p // 100:,}"
    bullets, critical = [], []
    browse = not f["system"]["checkout_enabled"]
    if browse:
        bullets.append("The shop is in browse mode: no order can be placed yet.")
    else:
        bullets.append(f"Today: {f['today']['orders']} orders, {rs(f['today']['revenue_paise'])}. This week: {f['week']['orders']} orders, {rs(f['week']['revenue_paise'])}.")
    sw, sp = f["week"]["sessions"], f["week"]["sessions_previous_week"]
    if sp:
        change = round((sw - sp) / sp * 100)
        bullets.append(f"{sw} visits this week, {'+' if change >= 0 else ''}{change}% on last week.")
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
    headline = "Quiet day in browse mode." if browse and not critical else (
        "Something needs you today." if critical else "All clear today.")
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


@router.get("/dashboard/brief", tags=["Admin — Dashboard"])
async def admin_dashboard_brief(
    refresh: bool = Query(False, description="Skip the cache and rebuild"),
    db: AsyncSession = Depends(get_async_db),
):
    if not refresh:
        cached = _local_get("brief", BRIEF_TTL_SECONDS)
        if cached is not None:
            return cached
    facts = await _brief_facts(db)
    brief = _rule_brief(facts)
    if settings.has_ai:
        try:
            written = await ai.extract(
                "You write a morning brief for the founder of ZISUN, a small handloom clothing label. "
                "Plain English, no hype, numbers exactly as given, rupees not paise (divide paise by 100). "
                "Say what needs doing today under `critical`, and only that. Never invent a fact.",
                json.dumps(facts, ensure_ascii=False),
                BRIEF_SCHEMA, name="brief", description="The founder's brief for today.", max_tokens=700,
            )
            brief = {**written, "source": settings.AI_MODEL}
        except ai.AIUnavailable as exc:
            brief["note"] = f"Written from rules; Claude unavailable ({exc})."
    payload = {"brief": brief, "facts": facts}
    _local_set("brief", payload)
    return payload
