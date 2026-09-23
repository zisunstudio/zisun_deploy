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
from app.models.enquiry import EnquiryStatus, WhatsAppEnquiry
from app.models.order import Order, OrderItem, OrderStatus, Payment, PaymentMethod, PaymentStatus
from app.models.user import User, UserRole
from app.services import ai, metrics
from app.services.shelf import (
    EVENT_WEIGHTS,
    WINDOW_DAYS,
    attention_score_subquery,
    half_life_days,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# ZISUN's funnel, not a generic shop's. While checkout is closed a sale is a
# WhatsApp enquiry that the founder marks as ordered; when checkout opens the
# orders table joins in. The size guide is a side signal, reported elsewhere.
FUNNEL_STEPS = [
    ("impressions", "product_impression", "Products shown"),
    ("views", "product_viewed", "Product opened"),
    ("add_to_cart", "add_to_cart", "Added to bag"),
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


def _worst_step(journey: list[dict]) -> dict | None:
    """Where this piece loses the most people.

    Only steps that had someone to lose are considered, and a step that
    nobody has reached yet is not a "100% drop" - it is no evidence. The
    result names the step and the two counts, so the console can say
    "12 opened it, 1 reached the bag" instead of printing a percentage.
    """
    worst = None
    worst_key = (-1, -1.0)
    for before, after in zip(journey, journey[1:]):
        if before["count"] <= 0:
            continue
        lost = before["count"] - after["count"]
        if lost <= 0:
            continue
        rate = lost / before["count"]
        # Ranked by people lost, then by rate. Ranking by rate alone made
        # "one shopper did not check out" (100%) outrank "twenty-eight saw it
        # and did not open it" (70%), which is the opposite of useful. Compare
        # the raw fraction, never the rounded percentage in the payload.
        if (lost, rate) > worst_key:
            worst_key = (lost, rate)
            worst = {
                "from": before["label"], "to": after["label"],
                "from_count": before["count"], "to_count": after["count"],
                "lost": lost, "rate": round(rate * 100), "step": after["key"],
            }
    return worst


def _count_via(via: str):
    """Count add_to_cart events whose properties say how they were made.

    Buy now has never been its own event type; ProductView sends
    `add_to_cart` with `via: "buy_now"`. A dashboard column that counted an
    event called "buy_now" was therefore always zero, and every buy-now
    shopper was silently filed as an ordinary bag add.
    """
    return sa.func.count(sa.case((sa.and_(
        AnalyticsEvent.event_type == "add_to_cart",
        AnalyticsEvent.properties.op("->>")("via") == via,
    ), AnalyticsEvent.id)))


def _count_of(event_type: str):
    return sa.func.count(sa.case((AnalyticsEvent.event_type == event_type, AnalyticsEvent.id)))


def _rate(num: int, den: int):
    return round(num / den, 4) if den else None


# ── The board ────────────────────────────────────────────────────────────────

def _views_from_cards():
    """Opens that came from tapping a card, as opposed to a link, a share, the
    hero or a search. Only these can be compared with impressions: an open
    from a shared link was never "shown" as a card, and counting it against
    impressions is how a product reports a 273% open rate."""
    return sa.func.count(sa.case((sa.and_(
        AnalyticsEvent.event_type == "product_viewed",
        AnalyticsEvent.properties.op("->>")("source") == "card",
    ), AnalyticsEvent.id)))


async def compute_dashboard(days: int = 30) -> dict:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    previous = since - timedelta(days=days)
    week = now - timedelta(days=7)
    prev_week = now - timedelta(days=14)
    attention_sq = attention_score_subquery()
    live_products = sa.and_(Product.deleted_at.is_(None), Product.is_active.is_(True))

    def sessions_between(a, b):
        return _scalar(select(sa.func.count(sa.distinct(AnalyticsEvent.session_id))).where(
            AnalyticsEvent.session_id.isnot(None), AnalyticsEvent.created_at >= a, AnalyticsEvent.created_at < b))

    def events_between(kind, a, b):
        return _scalar(select(sa.func.count(AnalyticsEvent.id)).where(
            AnalyticsEvent.event_type == kind, AnalyticsEvent.created_at >= a, AnalyticsEvent.created_at < b))

    def enquiries_between(a, b, status=None):
        stmt = select(sa.func.count(WhatsAppEnquiry.id)).where(WhatsAppEnquiry.created_at >= a, WhatsAppEnquiry.created_at < b)
        if status:
            stmt = stmt.where(WhatsAppEnquiry.status == status)
        return _scalar(stmt)

    def revenue_between(a, b):
        return _scalar(select(sa.func.coalesce(sa.func.sum(WhatsAppEnquiry.order_amount_paise), 0)).where(
            WhatsAppEnquiry.status == EnquiryStatus.ORDERED.value, WhatsAppEnquiry.updated_at >= a, WhatsAppEnquiry.updated_at < b))

    r, errors = await _panels(
        totals=_one(select(
            select(sa.func.count(Order.id)).scalar_subquery().label("orders_total"),
            select(sa.func.count(User.id)).where(User.role == UserRole.user).scalar_subquery().label("customers"),
            select(sa.func.count(AnalyticsEvent.id)).scalar_subquery().label("events_total"),
        )),
        sessions=sessions_between(since, now),
        sessions_previous=sessions_between(previous, since),
        # This week, and the week before it. The board leads with these: a
        # founder opening the console at 4am should read the week, not the
        # hour.
        sessions_week=sessions_between(week, now),
        sessions_prev_week=sessions_between(prev_week, week),
        opens_week=events_between("product_viewed", week, now),
        opens_prev_week=events_between("product_viewed", prev_week, week),
        bags_week=events_between("add_to_cart", week, now),
        bags_prev_week=events_between("add_to_cart", prev_week, week),
        enquiries_week=enquiries_between(week, now),
        enquiries_prev_week=enquiries_between(prev_week, week),
        ordered_week=enquiries_between(week, now, EnquiryStatus.ORDERED.value),
        revenue_week=revenue_between(week, now),
        # The window (30 days by default)
        enquiries_window=enquiries_between(since, now),
        ordered_window=enquiries_between(since, now, EnquiryStatus.ORDERED.value),
        revenue_window=revenue_between(since, now),
        unanswered=_scalar(select(sa.func.count(WhatsAppEnquiry.id)).where(
            WhatsAppEnquiry.status == EnquiryStatus.NEW.value, WhatsAppEnquiry.created_at < now - timedelta(hours=24))),
        enquiries_by_product=_all(
            select(WhatsAppEnquiry.product_id, sa.func.count(WhatsAppEnquiry.id),
                   sa.func.count(sa.case((WhatsAppEnquiry.status == EnquiryStatus.ORDERED.value, WhatsAppEnquiry.id))))
            .where(WhatsAppEnquiry.created_at >= since, WhatsAppEnquiry.product_id.isnot(None))
            .group_by(WhatsAppEnquiry.product_id)),
        # Raw rows, classified in services/metrics.py. The old query summed
        # every order in the window whatever its status, so an abandoned
        # prepaid attempt and a cancelled order both counted as revenue.
        order_rows=_all(select(Order.id, Order.status, Order.payment_method, Order.total_amount, Order.created_at)
                        .where(Order.created_at >= since)),
        captured=_all(select(Payment.order_id).where(Payment.status == PaymentStatus.CAPTURED)),
        # Orders by where they came from. Nothing recorded a source until
        # 0021, so older orders answer "not recorded" rather than "direct" -
        # calling an unknown source direct would quietly credit the channel
        # that needs no credit.
        orders_by_source=_all(
            select(Order.source, Order.status, Order.payment_method, Order.total_amount, Order.created_at)
            .where(Order.created_at >= since)),
        # Sessions and visitors per source, so a channel can be judged on
        # what it converts and not only on what it sends.
        sessions_by_source=_all(
            select(AnalyticsEvent.properties.op("->>")("source").label("src"),
                   sa.func.count(sa.distinct(AnalyticsEvent.session_id)),
                   sa.func.count(sa.distinct(AnalyticsEvent.properties.op("->>")("visitor"))))
            .where(AnalyticsEvent.created_at >= since, AnalyticsEvent.session_id.isnot(None))
            .group_by("src")),
        by_method=_all(select(Order.payment_method, sa.func.count(Order.id), sa.func.coalesce(sa.func.sum(Order.total_amount), 0))
                       .where(Order.created_at >= since).group_by(Order.payment_method)),
        by_status=_all(select(Order.status, sa.func.count(Order.id)).group_by(Order.status)),
        steps=_all(select(AnalyticsEvent.event_type, sa.func.count(AnalyticsEvent.id))
                   .where(AnalyticsEvent.event_type.in_([e for _, e, _ in FUNNEL_STEPS] + ["size_guide_opened"]), AnalyticsEvent.created_at >= since)
                   .group_by(AnalyticsEvent.event_type)),
        # Per-product funnel in ONE grouped query. A left join keeps products
        # nobody has opened - those rows are the point.
        products=_all(
            select(
                Product.id, Product.name, Product.shelf_rank,
                _count_of("product_impression").label("impressions"),
                _count_of("product_viewed").label("views"),
                _views_from_cards().label("views_from_cards"),
                _count_of("add_to_cart").label("add_to_cart"),
                # The rest of the journey. Without these the per-product view
                # stopped at the bag and could not say whether anyone went on
                # to check out - which is exactly where the money is lost.
                # Buy now is NOT its own event: the storefront sends
                # add_to_cart with properties.via = "buy_now". Counting an
                # event named buy_now returned zero for every piece.
                _count_via("buy_now").label("buy_now"),
                sa.func.coalesce(attention_sq.c.score, 0.0).label("attention"),
            )
            .select_from(Product)
            .outerjoin(AnalyticsEvent, sa.and_(
                AnalyticsEvent.event_type.in_(["product_impression", "product_viewed", "add_to_cart"]),
                AnalyticsEvent.created_at >= since, product_id_matches(Product.id)))
            .outerjoin(attention_sq, attention_sq.c.product_id == sa.cast(Product.id, sa.Text))
            .where(live_products)
            .group_by(Product.id, Product.name, Product.shelf_rank, attention_sq.c.score)
            .order_by(sa.desc("attention"), sa.desc("views"))),
        # Per-product orders, from the orders themselves. `checkout_initiated`
        # carries an order_id and no product_id, so the per-product count read
        # from events was always zero. order_items is authoritative anyway: it
        # survives an ad-blocker, and it knows the money.
        ordered_by_product=_all(
            select(
                ProductVariant.product_id,
                sa.func.count(sa.distinct(Order.id)).label("orders"),
                sa.func.coalesce(sa.func.sum(OrderItem.quantity), 0).label("units"),
                sa.func.coalesce(sa.func.sum(
                    sa.case((Order.status.in_([OrderStatus.PAID, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.DELIVERED]),
                             OrderItem.unit_price * OrderItem.quantity), else_=0)), 0).label("revenue"),
            )
            .select_from(OrderItem)
            .join(Order, Order.id == OrderItem.order_id)
            .join(ProductVariant, ProductVariant.id == OrderItem.product_variant_id)
            .where(Order.created_at >= since, Order.status.notin_([OrderStatus.CANCELLED, OrderStatus.FAILED_PAYMENT]))
            .group_by(ProductVariant.product_id)),
        # Stock per product: total left and the emptiest size/colour, so a
        # wanted piece that is about to run out can be named.
        stock=_all(
            select(ProductVariant.product_id, ProductVariant.size, ProductVariant.color, ProductVariant.stock)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(live_products, ProductVariant.is_active.is_(True))),
        by_size=_all(
            select(ProductVariant.size, sa.func.count(ProductVariant.id), sa.func.coalesce(sa.func.sum(ProductVariant.stock), 0))
            .join(Product, Product.id == ProductVariant.product_id)
            .where(live_products, ProductVariant.is_active.is_(True)).group_by(ProductVariant.size)),
        low_stock=_all(
            select(Product.name, ProductVariant.size, ProductVariant.color, ProductVariant.sku, ProductVariant.stock)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(live_products, ProductVariant.is_active.is_(True), ProductVariant.stock <= LOW_STOCK_THRESHOLD)
            .order_by(ProductVariant.stock.asc(), Product.name.asc()).limit(30)),
        no_photos=_all(
            select(Product.id, Product.name).outerjoin(ProductMedia, ProductMedia.product_id == Product.id)
            .where(live_products).group_by(Product.id, Product.name).having(sa.func.count(ProductMedia.id) == 0).limit(8)),
        coupons_live=_scalar(select(sa.func.count(Coupon.id)).where(
            Coupon.is_active.is_(True), Coupon.is_referral.is_(False), sa.or_(Coupon.expires_at.is_(None), Coupon.expires_at > now))),
    )

    n = lambda k: int(r[k] or 0)  # noqa: E731
    totals = r["totals"]
    orders_total = int(totals.orders_total or 0) if totals else 0
    customers = int(totals.customers or 0) if totals else 0
    events_total = int(totals.events_total or 0) if totals else 0
    # One definition of money, in two columns that are never added together:
    # collected (it is in) and committed (a real order still owes it).
    _rows = [
        {"id": oid, "status": st, "payment_method": pm, "total_amount": amt,
         "minutes_old": (now - created).total_seconds() / 60 if created else None}
        for oid, st, pm, amt, created in (r["order_rows"] or [])
    ]
    _captured = {row[0] for row in (r["captured"] or [])}
    _money = metrics.summarise(_rows)
    # The same definition, cut to this week, from the rows already fetched -
    # no extra query. The week panel's `revenue_paise` measures WhatsApp
    # enquiries the founder ticked by hand, which is a different thing from
    # money and must never sit under the same word.
    _week_cut = [x for x in _rows if (x["minutes_old"] or 0) <= 7 * 24 * 60]
    _week_money = metrics.summarise(_week_cut)
    _pay = metrics.payment_health(_rows, captured_order_ids=_captured)
    orders_window = _money.orders
    revenue_window_checkout = _money.collected_paise
    by_method = {str(getattr(m, "value", m)): {"orders": int(c or 0), "revenue": int(v or 0)} for m, c, v in (r["by_method"] or [])}
    by_status = {str(getattr(s_, "value", s_)): int(c or 0) for s_, c in (r["by_status"] or [])}
    step_counts = {et: int(c or 0) for et, c in (r["steps"] or [])}

    enquiries_window, ordered_window = n("enquiries_window"), n("ordered_window")
    revenue_whatsapp = n("revenue_window")
    funnel = [{"key": k, "event": ev, "label": l, "count": step_counts.get(ev, 0)} for k, ev, l in FUNNEL_STEPS]
    funnel.append({"key": "enquiry", "event": None, "label": "WhatsApp enquiry", "count": enquiries_window})
    # Ordered = WhatsApp orders the founder marked, plus checkout orders.
    funnel.append({"key": "orders", "event": None, "label": "Ordered", "count": ordered_window + orders_window})

    enq_by_product = {str(pid): (int(c or 0), int(o or 0)) for pid, c, o in (r["enquiries_by_product"] or [])}
    stock_by_product: dict[str, dict] = {}
    for pid, size, colour, st in (r["stock"] or []):
        d = stock_by_product.setdefault(str(pid), {"left": 0, "lowest": None})
        d["left"] += int(st or 0)
        if d["lowest"] is None or int(st or 0) < d["lowest"]["stock"]:
            d["lowest"] = {"size": size or "", "colour": colour or "", "stock": int(st or 0)}

    ordered_by_product = {
        str(pid): {"orders": int(o or 0), "units": int(u or 0), "revenue": int(rev or 0)}
        for pid, o, u, rev in (r["ordered_by_product"] or [])
    }
    products_attention = []
    for p in (r["products"] or []):
        pid = str(p.id)
        enq, enq_ordered = enq_by_product.get(pid, (0, 0))
        st = stock_by_product.get(pid, {"left": 0, "lowest": None})
        impressions, views, from_cards, bags = int(p.impressions or 0), int(p.views or 0), int(p.views_from_cards or 0), int(p.add_to_cart or 0)
        buy_now = int(p.buy_now or 0)
        ord_row = ordered_by_product.get(pid, {"orders": 0, "units": 0, "revenue": 0})
        # The whole journey for this piece, and the single place it leaks
        # most. "Shown 40, opened 12, bag 1" is the sentence she needs; a
        # column of numbers is not. Intent is bag OR buy now - buy now skips
        # the bag entirely, so counting only the bag lost those shoppers.
        # `bags` already includes buy-now presses (they are add_to_cart with
        # via=buy_now), so intent is bags, not bags + buy_now - adding them
        # double-counted every buy-now shopper.
        intent = bags
        journey = [
            {"key": "impressions", "label": "Shown", "count": impressions},
            {"key": "views", "label": "Opened", "count": views},
            {"key": "intent", "label": "Bag or buy now", "count": intent},
            {"key": "ordered", "label": "Ordered", "count": int(ord_row["orders"])},
        ]
        gap = _worst_step(journey)
        products_attention.append({
            "journey": journey, "gap": gap,
            "buy_now": buy_now, "intent": intent,
            "orders": int(ord_row["orders"]), "units_sold": int(ord_row["units"]),
            "revenue_paise": int(ord_row["revenue"]),
            # Of the people who opened it, how many bought. The one rate that
            # answers "is this piece actually selling", as opposed to being
            # looked at - `attention` measures interest and nothing else.
            "buy_rate": _rate(int(ord_row["orders"]), views),
            "id": pid, "name": p.name, "shelf_rank": p.shelf_rank,
            "impressions": impressions, "views": views, "views_from_cards": from_cards,
            # Named for what they are. `enquiries` were WhatsApp *button
            # clicks* - the site cannot know a message was ever sent - and
            # `ordered` was the founder ticking an enquiry by hand. Sitting
            # unlabelled beside real orders they read as verified sales.
            "add_to_cart": bags,
            "whatsapp_clicks": enq, "whatsapp_marked_ordered": enq_ordered,
            # ctr only from card-sourced opens; None when there is nothing to
            # compare (older events carry no source), never a number over 100%.
            "ctr": _rate(min(from_cards, impressions), impressions) if from_cards else None,
            "cart_rate": _rate(bags, views),
            "attention": round(float(p.attention or 0.0), 2),
            "stock_left": st["left"], "lowest_variant": st["lowest"],
        })
    # ── Acquisition: what each channel sends, and what it is worth ──────────
    by_source: dict[str, dict] = {}
    for src, st, pm, amt, created in (r["orders_by_source"] or []):
        key = (src or "not recorded").lower()
        row = by_source.setdefault(key, {"source": key, "orders": 0, "collected_paise": 0, "committed_paise": 0, "sessions": 0, "visitors": 0})
        kind = metrics.classify(st, pm, minutes_old=(now - created).total_seconds() / 60 if created else None)
        if kind in ("paid", "delivered"):
            row["orders"] += 1
            row["collected_paise"] += int(amt or 0)
        elif kind == "cod_placed":
            row["orders"] += 1
            row["committed_paise"] += int(amt or 0)
    for src, sessions, visitors in (r["sessions_by_source"] or []):
        key = (src or "not recorded").lower()
        row = by_source.setdefault(key, {"source": key, "orders": 0, "collected_paise": 0, "committed_paise": 0, "sessions": 0, "visitors": 0})
        row["sessions"], row["visitors"] = int(sessions or 0), int(visitors or 0)
    for row in by_source.values():
        # Orders per hundred sessions. None, not zero, when a channel has sent
        # no session yet - an unmeasured channel is not a bad one.
        row["conversion"] = _rate(row["orders"], row["sessions"]) if row["sessions"] else None
    acquisition = sorted(by_source.values(), key=lambda x: (-(x["collected_paise"] + x["committed_paise"]), -x["sessions"]))

    products_by_views = sorted(({"id": p["id"], "name": p["name"], "views": p["views"]} for p in products_attention), key=lambda p: -p["views"])
    by_size = sorted(({"size": s_ or "One size", "variants": int(v or 0), "units": int(u or 0)} for s_, v, u in (r["by_size"] or [])), key=lambda x: -x["units"])
    low_stock = [{"product": nm, "size": s_ or "", "colour": c or "", "sku": sku, "stock": int(st or 0)} for nm, s_, c, sku, st in (r["low_stock"] or [])]
    no_photos = [{"id": str(pid), "name": nm} for pid, nm in (r["no_photos"] or [])]

    # ── Needs attention: things she can act on, most urgent first ──
    items: list[dict] = []

    # Money first. A payment that failed at the gateway is the shop's problem
    # and is fixable; a customer who closed the sheet is not. Nothing here
    # fires on a single order - one decline is a bank, not a fault.
    if _pay.mismatched:
        items.append({
            "severity": "critical",
            "title": f"{_pay.mismatched} {'order has' if _pay.mismatched == 1 else 'orders have'} a captured payment but are not marked paid",
            "body": "The gateway took the money and the webhook never landed, so the order looks unpaid and will not be packed. Check the Razorpay dashboard against these orders.",
            "href": "/admin/reconciliation",
        })
    if _pay.failed >= 2 and (_pay.success_rate is not None and _pay.success_rate < 70):
        items.append({
            "severity": "critical",
            "title": f"{_pay.failed} prepaid payments failed at the gateway ({_pay.success_rate}% succeed)",
            "body": "A failure at the gateway is not a change of mind - these customers tried to pay and could not. Check the failure reasons before spending anything on traffic.",
            "href": "/admin/orders?status=FAILED_PAYMENT",
        })
    elif _pay.abandoned >= 3 and (_pay.abandon_rate or 0) >= 50:
        items.append({
            "severity": "warn",
            "title": f"{_pay.abandoned} shoppers opened the payment sheet and left",
            "body": "They reached the last step with the total in front of them. That is usually the total itself - shipping, the COD fee, or a delivery date that reads too far away.",
            "href": "/admin/orders",
        })

    if n("unanswered"):
        items.append({"severity": "critical", "title": f"{n('unanswered')} WhatsApp {'enquiry has' if n('unanswered') == 1 else 'enquiries have'} waited over a day for a reply", "body": "A reply within the hour is what turns an enquiry into an order.", "href": "/admin/enquiries"})
    wanted_and_low = [p for p in products_attention if p["views"] >= 10 and p["lowest_variant"] and p["lowest_variant"]["stock"] <= 2]
    for p in wanted_and_low[:3]:
        lv = p["lowest_variant"]; where = " / ".join(x for x in (lv["size"], lv["colour"]) if x) or "one size"
        left = "sold out" if lv["stock"] == 0 else f"only {lv['stock']} left"
        items.append({"severity": "critical" if lv["stock"] == 0 else "warn",
                      "title": f"{p['name']}: {left} in {where}",
                      "body": f"{p['views']} opens and {p['add_to_cart']} bag adds this month - restock before promoting it further.",
                      "href": "/admin/inventory?product=" + p["id"]})
    for p in no_photos[:3]:
        items.append({"severity": "warn", "title": f"{p['name']} is live without a photograph", "body": "A listing without a photograph does not get opened.", "href": f"/admin/products/{p['id']}/edit#photos"})
    opened_never_bagged = [p for p in products_attention if p["views"] >= 10 and p["add_to_cart"] == 0]
    for p in opened_never_bagged[:2]:
        items.append({"severity": "warn", "title": f"{p['name']}: opened {p['views']} times, never added to the bag", "body": "Check the price, the sizes on offer and the second photograph.", "href": f"/admin/products/{p['id']}/edit"})
    if n("bags_week") and not n("enquiries_week"):
        items.append({"severity": "info", "title": f"{n('bags_week')} added to the bag this week, no WhatsApp enquiry yet", "body": "The bag ends in a WhatsApp message. If that step is losing people, the message or the button may need a nudge.", "href": "/admin/enquiries"})
    if n("sessions_prev_week") >= 20 and n("sessions_week") >= n("sessions_prev_week") * 1.5:
        items.append({"severity": "info", "title": f"Traffic is growing: {n('sessions_week')} visits this week, {n('sessions_prev_week')} the week before", "body": "Worth knowing where they came from before spending on more.", "href": None})
    if not n("coupons_live"):
        items.append({"severity": "info", "title": "No coupon is live", "body": "The Deals band on the home page is empty; a first-order code is the cheapest nudge there is.", "href": "/admin/coupons"})

    # ── One sentence she can act on ──
    insight = None
    if products_attention:
        top = max(products_attention, key=lambda p: (p["views"], p["add_to_cart"]))
        if top["views"] >= 10:
            lv = top["lowest_variant"]
            tail = ""
            if lv and lv["stock"] <= 2:
                where = " / ".join(x for x in (lv["size"], lv["colour"]) if x) or "one size"
                tail = f" Only {lv['stock']} left in {where} - consider restocking before promoting it further."
            elif top["add_to_cart"] == 0:
                tail = " It is opened but not bagged - the page, price or sizes are where to look."
            insight = f"{top['name']} is getting the most attention: {top['views']} opens and {top['add_to_cart']} bag adds this month.{tail}"

    return {
        "meta": {"window_days": days, "generated_at": now.isoformat(), "checkout_enabled": settings.checkout_enabled,
                 "launch_mode": settings.LAUNCH_MODE or "live", "events_recorded": events_total, "errors": errors},
        "week": {
            "sessions": n("sessions_week"), "sessions_previous": n("sessions_prev_week"),
            "opens": n("opens_week"), "opens_previous": n("opens_prev_week"),
            "bag_adds": n("bags_week"), "bag_adds_previous": n("bags_prev_week"),
            "enquiries": n("enquiries_week"), "enquiries_previous": n("enquiries_prev_week"),
            # Real orders, this week, one definition (services/metrics.py).
            "orders": _week_money.orders,
            "revenue_paise": _week_money.collected_paise,
            "committed_paise": _week_money.committed_paise,
            # Self-reported: enquiries the founder ticked "ordered" by hand.
            # Kept, named for what it is, and never added to the above.
            "whatsapp_marked_ordered": n("ordered_week"),
            "whatsapp_marked_revenue_paise": n("revenue_week"),
        },
        "whatsapp": {
            "enquiries_window": enquiries_window, "ordered_window": ordered_window,
            "revenue_window_paise": revenue_whatsapp,
            "conversion": _rate(ordered_window, enquiries_window), "unanswered": n("unanswered"),
        },
        "attention_items": items,
        "insight": insight,
        "commerce": {
            "orders_all_time": orders_total, "orders_window": orders_window,
            # Kept as the collected figure so older readers of this key are
            # not silently handed a larger, unearned number.
            "revenue_window_paise": revenue_window_checkout,
            **metrics.as_dict(_money, _pay),
            "by_payment_method": by_method, "by_status": by_status, "customers": customers,
            "contribution_margin": None,
            "contribution_margin_blocked_on": ["cost per garment", "shipping cost per parcel", "payment gateway fee", "RTO reserve"],
        },
        "attention": {
            "sessions": n("sessions"), "sessions_previous": n("sessions_previous"), "funnel": funnel,
            "size_guide_opens": step_counts.get("size_guide_opened", 0),
            "products_by_views": products_by_views,
            "never_viewed": [p for p in products_by_views if p["views"] == 0],
            "products": products_attention,
            "ranking": {"window_days": WINDOW_DAYS, "half_life_days": round(half_life_days(), 1), "weights": EVENT_WEIGHTS},
        },
        "acquisition": {
            "by_source": acquisition,
            # True until the storefront carrying attribution has been live
            # long enough for the window to be all-attributed. Until then the
            # console says so rather than showing a misleading split.
            "partial": any(x["source"] == "not recorded" and x["orders"] > 0 for x in acquisition),
        },
        "inventory": {"units": sum(x["units"] for x in by_size), "variants": sum(x["variants"] for x in by_size),
                      "by_size": by_size, "low_stock": low_stock, "low_stock_threshold": LOW_STOCK_THRESHOLD},
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
        """Real orders and money actually collected.

        This counted everything but CANCELLED, so a prepaid order abandoned
        at the payment sheet was reported to the founder as a sale. The
        board and the brief now share one definition (services/metrics.py):
        a COD order resting in PAYMENT_PENDING is real, a prepaid one is not,
        and COD cash is collected only on delivery.
        """
        return _all(
            select(Order.id, Order.status, Order.payment_method, Order.total_amount, Order.created_at)
            .where(Order.created_at >= since)
        )

    def _rollup(rows) -> tuple[int, int]:
        summary = metrics.summarise([
            {"status": st, "payment_method": pm, "total_amount": amt,
             "minutes_old": (now - created).total_seconds() / 60 if created else None}
            for _, st, pm, amt, created in (rows or [])
        ])
        return summary.orders, summary.collected_paise

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
        enq_week=_scalar(select(sa.func.count(WhatsAppEnquiry.id)).where(WhatsAppEnquiry.created_at >= week_start)),
        enq_prev=_scalar(select(sa.func.count(WhatsAppEnquiry.id)).where(WhatsAppEnquiry.created_at >= prev_week_start, WhatsAppEnquiry.created_at < week_start)),
        enq_ordered=_scalar(select(sa.func.count(WhatsAppEnquiry.id)).where(WhatsAppEnquiry.created_at >= week_start, WhatsAppEnquiry.status == EnquiryStatus.ORDERED.value)),
        enq_unanswered=_scalar(select(sa.func.count(WhatsAppEnquiry.id)).where(WhatsAppEnquiry.status == EnquiryStatus.NEW.value, WhatsAppEnquiry.created_at < now - timedelta(hours=24))),
    )
    today = _rollup(r["today"])
    week = _rollup(r["week"])
    return {
        "as_of": now.isoformat(),
        "errors": errors,
        "today": {"orders": int(today[0] or 0), "revenue_paise": int(today[1] or 0)},
        "week": {"orders": int(week[0] or 0), "revenue_paise": int(week[1] or 0),
                 "sessions": int(r["sessions_week"] or 0), "sessions_previous_week": int(r["sessions_prev"] or 0),
                 "top_products": [{"name": n, "views": int(v)} for n, v in (r["top"] or [])]},
        "orders": {"waiting_to_ship_over_2_days": int(r["waiting"] or 0), "cod_unconfirmed": int(r["cod_unconfirmed"] or 0)},
        "whatsapp": {"enquiries_week": int(r["enq_week"] or 0), "enquiries_previous_week": int(r["enq_prev"] or 0),
                     "ordered_week": int(r["enq_ordered"] or 0), "unanswered": int(r["enq_unanswered"] or 0)},
        "catalogue": {"live_products": int(r["live_products"] or 0), "sold_out_variants": int(r["sold_out"] or 0),
                      "low_stock": [{"product": n, "size": s, "colour": c, "stock": int(st)} for n, s, c, st in (r["low"] or [])],
                      "without_photos": [row[0] for row in (r["no_photos"] or [])],
                      "coupons_live": int(r["coupons"] or 0)},
        "system": {"launch_mode": settings.LAUNCH_MODE or "live", "checkout_enabled": settings.checkout_enabled, "ai": settings.has_ai},
    }


def _rule_brief(f: dict) -> dict:
    """The brief without a model: the same shape, in plain sentences.

    Leads with the week. A founder who opens the console at four in the
    morning must not be told the day is quiet - the day has not started.
    """
    rs = lambda p: f"₹{p // 100:,}"  # noqa: E731
    bullets, critical = [], []
    browse = not f["system"]["checkout_enabled"]
    hour = datetime.now(IST).hour
    sw, sp = f["week"]["sessions"], f["week"]["sessions_previous_week"]
    enq, enq_prev = f["whatsapp"]["enquiries_week"], f["whatsapp"]["enquiries_previous_week"]
    # A percentage on a tiny base is noise: 2 visits to 141 is "+6950%".
    if sp >= 20:
        change = round((sw - sp) / sp * 100)
        bullets.append(f"{sw} visits this week, {'+' if change >= 0 else ''}{change}% on last week.")
    elif sp:
        bullets.append(f"{sw} visits this week, {sp} the week before.")
    else:
        bullets.append(f"{sw} visits this week.")
    if browse:
        if enq:
            bullets.append(f"{enq} WhatsApp {'enquiry' if enq == 1 else 'enquiries'} this week" + (f", {f['whatsapp']['ordered_week']} ordered." if f["whatsapp"]["ordered_week"] else ", none marked ordered yet."))
        else:
            bullets.append("No WhatsApp enquiries this week yet - the bag and every product page end in one.")
    else:
        bullets.append(f"This week: {f['week']['orders']} orders, {rs(f['week']['revenue_paise'])}." + (f" Today: {f['today']['orders']}, {rs(f['today']['revenue_paise'])}." if f["today"]["orders"] else ""))
    if f["week"]["top_products"]:
        bullets.append("Most opened: " + ", ".join(f"{p['name']} ({p['views']})" for p in f["week"]["top_products"]) + ".")
    if f["whatsapp"]["unanswered"]:
        critical.append(f"{f['whatsapp']['unanswered']} WhatsApp {'enquiry has' if f['whatsapp']['unanswered'] == 1 else 'enquiries have'} waited over a day for a reply.")
    if f["orders"]["waiting_to_ship_over_2_days"]:
        critical.append(f"{f['orders']['waiting_to_ship_over_2_days']} paid orders have waited over two days to ship.")
    if f["orders"]["cod_unconfirmed"]:
        critical.append(f"{f['orders']['cod_unconfirmed']} COD orders are still unconfirmed.")
    if f["catalogue"]["without_photos"]:
        critical.append("Live without photographs: " + ", ".join(f["catalogue"]["without_photos"][:4]) + ".")
    if f["catalogue"]["low_stock"]:
        bullets.append("Running low: " + ", ".join(f"{l['product']} {l['size'] or ''} {l['colour'] or ''}".strip() + f" ({l['stock']})" for l in f["catalogue"]["low_stock"][:4]) + ".")
    if not f["catalogue"]["coupons_live"]:
        bullets.append("No coupon is live - the Deals band on the home page is empty.")
    if critical:
        headline = "Something needs you today."
    elif sp >= 20 and sw >= sp * 1.5:
        headline = "Traffic is growing this week."
    elif enq and enq > enq_prev:
        headline = "More people are asking this week."
    elif hour < 9:
        headline = "Early morning - here is the week so far."
    else:
        headline = "A steady week so far."
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
    facts["system"]["ai_note"] = None
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
            facts["system"]["ai_note"] = f"Claude unavailable: {exc}."
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
