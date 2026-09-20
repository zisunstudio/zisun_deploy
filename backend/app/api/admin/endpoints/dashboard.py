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

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.core.database import get_async_db
from app.core.redis import get_redis
from app.models.analytics import AnalyticsEvent
from app.models.catalog import Product, ProductVariant
from app.models.order import Order, OrderStatus, PaymentMethod
from app.models.user import User, UserRole
from app.services.shelf import (
    EVENT_WEIGHTS,
    WINDOW_DAYS,
    attention_score_subquery,
    half_life_days,
)

router = APIRouter()

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

    if redis is not None:
        try:
            await redis.set(cache_key, json.dumps(payload), ex=CACHE_SECONDS)
        except Exception:
            pass
    return payload
