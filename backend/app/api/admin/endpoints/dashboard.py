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

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.core.database import get_async_db
from app.models.analytics import AnalyticsEvent
from app.models.catalog import Product, ProductVariant
from app.models.order import Order, OrderStatus, PaymentMethod
from app.models.user import User, UserRole

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
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # ── Commerce ─────────────────────────────────────────────────────────────
    orders_total = (await db.execute(select(sa.func.count(Order.id)))).scalar() or 0

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

    customers = (
        await db.execute(select(sa.func.count(User.id)).where(User.role == UserRole.user))
    ).scalar() or 0

    # ── Attention ────────────────────────────────────────────────────────────
    funnel = []
    for key, event_type, label in FUNNEL_STEPS:
        count = (
            await db.execute(
                select(sa.func.count(AnalyticsEvent.id)).where(
                    AnalyticsEvent.event_type == event_type,
                    AnalyticsEvent.created_at >= since,
                )
            )
        ).scalar() or 0
        funnel.append({"key": key, "event": event_type, "label": label, "count": int(count)})
    # Orders are the last step, and they come from the orders table rather than
    # an event: a purchase that only exists as an analytics event is a purchase
    # we cannot ship.
    funnel.append(
        {"key": "orders", "event": None, "label": "Ordered", "count": orders_window}
    )

    sessions = (
        await db.execute(
            select(sa.func.count(sa.distinct(AnalyticsEvent.session_id))).where(
                AnalyticsEvent.session_id.isnot(None),
                AnalyticsEvent.created_at >= since,
            )
        )
    ).scalar() or 0

    events_total = (
        await db.execute(select(sa.func.count(AnalyticsEvent.id)))
    ).scalar() or 0

    # Views per product, including the ones nobody has opened — those are the
    # point. A left join keeps a product with zero views in the result, where an
    # inner join would silently drop exactly the rows worth seeing.
    view_rows = (
        await db.execute(
            select(
                Product.id,
                Product.name,
                sa.func.count(AnalyticsEvent.id).label("views"),
            )
            .select_from(Product)
            .outerjoin(
                AnalyticsEvent,
                sa.and_(
                    AnalyticsEvent.event_type == "product_viewed",
                    product_id_matches(Product.id),
                ),
            )
            .where(Product.deleted_at.is_(None), Product.is_active.is_(True))
            .group_by(Product.id, Product.name)
            .order_by(sa.desc("views"))
        )
    ).all()
    products_by_views = [
        {"id": str(pid), "name": name, "views": int(v or 0)} for pid, name, v in view_rows
    ]

    # ── Inventory ────────────────────────────────────────────────────────────
    size_rows = (
        await db.execute(
            select(
                ProductVariant.size,
                sa.func.count(ProductVariant.id),
                sa.func.coalesce(sa.func.sum(ProductVariant.stock), 0),
            )
            .join(Product, Product.id == ProductVariant.product_id)
            .where(Product.deleted_at.is_(None), Product.is_active.is_(True))
            .group_by(ProductVariant.size)
            .order_by(sa.desc(sa.func.sum(ProductVariant.stock)))
        )
    ).all()
    by_size = [
        {"size": s or "—", "variants": int(c or 0), "units": int(u or 0)}
        for s, c, u in size_rows
    ]

    low_rows = (
        await db.execute(
            select(Product.name, ProductVariant.size, ProductVariant.sku, ProductVariant.stock)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                Product.deleted_at.is_(None),
                Product.is_active.is_(True),
                ProductVariant.stock <= LOW_STOCK_THRESHOLD,
            )
            .order_by(ProductVariant.stock)
            .limit(12)
        )
    ).all()
    low_stock = [
        {"product": n, "size": s or "—", "sku": sku, "stock": int(st or 0)}
        for n, s, sku, st in low_rows
    ]

    return {
        # What the board needs to explain itself. A panel that knows *why* it is
        # empty can say so, instead of showing a zero the reader has to
        # interpret.
        "meta": {
            "window_days": days,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "checkout_enabled": settings.checkout_enabled,
            "launch_mode": settings.LAUNCH_MODE or "live",
            "events_recorded": int(events_total),
        },
        "commerce": {
            "orders_all_time": int(orders_total),
            "orders_window": orders_window,
            "revenue_window_paise": revenue_window,
            "by_payment_method": by_method,
            "by_status": by_status,
            "customers": int(customers),
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
            "sessions": int(sessions),
            "funnel": funnel,
            "products_by_views": products_by_views,
            "never_viewed": [p for p in products_by_views if p["views"] == 0],
        },
        "inventory": {
            "units": sum(r["units"] for r in by_size),
            "variants": sum(r["variants"] for r in by_size),
            "by_size": by_size,
            "low_stock": low_stock,
            "low_stock_threshold": LOW_STOCK_THRESHOLD,
        },
    }
