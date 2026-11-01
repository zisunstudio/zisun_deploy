"""Who an order belongs to, what she earns for it, and how she is doing.

The rules, in one place:

* **One influencer per order.** `orders.influencer_id` is one column and
  `influencer_commissions.order_id` is unique, so an order cannot be
  credited twice - not to two people, not to the same person on a retry.
* **Her code beats any link.** A customer who types an influencer's code
  has said whose recommendation she is acting on; the code also carried
  that influencer's discount. Otherwise the **last link** she tapped wins,
  if it was tapped within `INFLUENCER_WINDOW_DAYS` (30) - the person whose
  post she acted on most recently is the one who sold it. (Channel
  analytics stay first-touch; this is about who is paid, not where ZISUN
  was discovered.)
* **Repeat orders count** while the window is open; after it closes a
  new tap or her code is needed.
* **An inactive influencer gets nothing new.** Old orders keep their rows.
* **Her own order earns nothing.** Recognised by her phone number.
* **Commission** is worked out on what was paid for the goods - after any
  discount and store credit, without the delivery charge - by the rule in
  force when the order was placed (copied onto the row).
* **When it is payable** follows the referral rule exactly
  (`referral.settle_decision`): delivered, then the 14-day exchange window.
  Cancelled, failed or returned: void. A COD order not delivered stays
  pending; one that comes back (RTO) is void. Returned after it was earned
  or paid: reversed, and paid money is shown as owed back.
* **Money is honest.** Sales are reported the console's way
  (`metrics.classify`): collected, owed (COD placed, not delivered), never
  added together.

Settlement happens when someone reads (the console), never on a schedule -
the same reason as referrals: the metered Redis budget.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.models.analytics import AnalyticsEvent
from app.models.coupon import Coupon
from app.models.influencer import Influencer, InfluencerCommission
from app.models.order import Order, OrderItem, OrderStatus, PaymentMethod
from app.models.catalog import Product, ProductVariant
from app.models.user import User
from app.services import metrics
from app.services.referral import settle_decision

logger = logging.getLogger(__name__)

CODE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,29}$")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,79}$")

_VOID_REASON = {
    OrderStatus.CANCELLED: "The order was cancelled",
    OrderStatus.FAILED_PAYMENT: "The payment did not go through",
    OrderStatus.RETURNED: "The order came back",
}


# ── Pure rules (tested without a database) ──────────────────────────────────

def normalise_code(raw: Optional[str]) -> Optional[str]:
    code = re.sub(r"[^a-z0-9-]+", "-", (raw or "").strip().lower()).strip("-")
    return code if CODE_RE.match(code) else None


_LANDING_RE = re.compile(r"^/(?:$|shop$|product/[0-9a-f-]{36}$|category/[a-z0-9-]{1,80}$|collections/[a-z0-9-]{1,80}$)")


def safe_landing(path: Optional[str]) -> Optional[str]:
    """A page on this site, and only the kinds an influencer link may open.

    Anything else - another domain, a console page, a query string - is
    refused, so a link can never be turned into a redirect to somewhere else.
    """
    p = (path or "").strip()
    return p if _LANDING_RE.match(p) else None


def decide(code_influencer: Optional[uuid.UUID], link_influencer: Optional[uuid.UUID],
           clicked_at: Optional[datetime], now: datetime, window_days: int) -> Optional[tuple[uuid.UUID, str]]:
    """(influencer, "code" | "link"), or None. Her code first; else a link inside the window."""
    if code_influencer:
        return code_influencer, "code"
    if link_influencer and clicked_at and timedelta(0) <= now - clicked_at <= timedelta(days=window_days):
        return link_influencer, "link"
    # A click time in the future is a clock or a forgery; either way, not proof.
    return None


def commission_for(kind: str, value: int, base_paise: int) -> int:
    if base_paise <= 0 or value <= 0:
        return 0
    if kind == "fixed":
        return min(value, base_paise)
    return base_paise * min(value, 100) // 100


def rule_text(kind: str, value: int) -> str:
    return f"₹{value // 100} per order" if kind == "fixed" else f"{value}% of the goods"


def same_phone(a: Optional[str], b: Optional[str]) -> bool:
    da, db_ = re.sub(r"\D", "", a or "")[-10:], re.sub(r"\D", "", b or "")[-10:]
    return len(da) == 10 and da == db_


def order_base(order: Order) -> int:
    return max(0, int(order.total_amount or 0) - int(getattr(order, "shipping_amount", 0) or 0))


def bucket(status, method) -> str:
    """The order-status column the dashboard shows."""
    s = getattr(status, "value", status)
    m = getattr(method, "value", method)
    if s == "DELIVERED":
        return "delivered"
    if s == "RETURNED":
        return "returned"
    if s in ("CANCELLED", "FAILED_PAYMENT"):
        return "cancelled"
    if m == "COD":
        return "cod_pending"          # placed, cash not yet collected
    if s in ("PAID", "PACKED", "SHIPPED"):
        return "confirmed"            # prepaid, money in hand, on its way
    return "unpaid"                    # prepaid, never paid


# ── Attribution at checkout ─────────────────────────────────────────────────

async def attribute(db: AsyncSession, order: Order, *, link_code: Optional[str],
                    clicked_at: Optional[datetime], buyer_phone: Optional[str],
                    now: Optional[datetime] = None) -> Optional[Influencer]:
    """Credit `order` to an influencer, if one earned it, and open her commission row.

    Idempotent: an order already credited is left exactly as it is.
    """
    now = now or datetime.now(timezone.utc)
    if order.influencer_id is not None:
        return None
    code_inf = None
    if order.coupon_id:
        code_inf = (await db.execute(
            select(Influencer).join(Coupon, Coupon.influencer_id == Influencer.id)
            .where(Coupon.id == order.coupon_id, Influencer.is_active.is_(True))
        )).scalar_one_or_none()
    link_inf = None
    code = normalise_code(link_code)
    if code and not code_inf:
        link_inf = (await db.execute(
            select(Influencer).where(Influencer.code == code, Influencer.is_active.is_(True))
        )).scalar_one_or_none()
    if clicked_at is not None and clicked_at.tzinfo is None:
        clicked_at = clicked_at.replace(tzinfo=timezone.utc)
    chosen = decide(code_inf.id if code_inf else None, link_inf.id if link_inf else None,
                    clicked_at, now, settings.INFLUENCER_WINDOW_DAYS)
    if not chosen:
        return None
    inf = code_inf or link_inf
    order.influencer_id, order.influencer_via = chosen
    base = order_base(order)
    own = same_phone(inf.phone, buyer_phone)
    row = InfluencerCommission(
        influencer_id=inf.id, order_id=order.id, base_paise=base,
        amount_paise=0 if own else commission_for(inf.commission_type, inf.commission_value, base),
        rule=rule_text(inf.commission_type, inf.commission_value),
        status="void" if own else "pending",
        reason="Her own order" if own else None,
    )
    # The unique order_id is the last guard: a second attempt for the same
    # order changes nothing rather than paying twice.
    stmt = pg_insert(InfluencerCommission).values(
        id=uuid.uuid4(), created_at=now, updated_at=now,
        **{c: getattr(row, c) for c in ("influencer_id", "order_id", "base_paise", "amount_paise", "rule", "status", "reason")},
    ).on_conflict_do_nothing(index_elements=["order_id"])
    await db.execute(stmt)
    return inf


# ── Settlement ──────────────────────────────────────────────────────────────

async def settle(db: AsyncSession, now: Optional[datetime] = None) -> int:
    """Move every open commission to where its order says it should be."""
    now = now or datetime.now(timezone.utc)
    rows = (await db.execute(
        select(InfluencerCommission, Order.status)
        .join(Order, Order.id == InfluencerCommission.order_id)
        .where(InfluencerCommission.status.in_(("pending", "earned", "paid")))
    )).all()
    changed = 0
    for c, status in rows:
        new, seen = settle_decision(status, c.delivered_seen_at, now, c.status)
        if (new, seen) == (c.status, c.delivered_seen_at):
            continue
        if new == "earned" and c.status == "pending":
            c.earned_at = now
        if new in ("void", "reversed"):
            c.reason = _VOID_REASON.get(status, "The order did not complete")
            if new == "reversed":
                c.reversed_at = now
        c.status, c.delivered_seen_at = new, seen
        changed += 1
    if changed:
        await db.flush()
    return changed


async def mark_paid(db: AsyncSession, ids: list[uuid.UUID], payout_ref: str,
                    now: Optional[datetime] = None) -> int:
    """Only earned commissions can be paid; anything else is left alone."""
    now = now or datetime.now(timezone.utc)
    rows = (await db.execute(
        select(InfluencerCommission).where(InfluencerCommission.id.in_(ids), InfluencerCommission.status == "earned")
        .with_for_update()
    )).scalars().all()
    for c in rows:
        c.status, c.paid_at, c.payout_ref = "paid", now, payout_ref.strip()[:80] or None
    await db.flush()
    return len(rows)


# ── Performance ─────────────────────────────────────────────────────────────

def _inf_prop():
    return AnalyticsEvent.properties.op("->>")("influencer")


def _count(kind: str):
    return sa.func.count(sa.case((AnalyticsEvent.event_type == kind, AnalyticsEvent.id)))


async def performance(db: AsyncSession, start: datetime, end: datetime, now: Optional[datetime] = None) -> dict:
    """Every influencer's numbers between `start` and `end`, plus totals.

    Traffic and actions come from the events the storefront already sends -
    each carries the influencer whose link the visitor last tapped - so
    nothing is tracked twice. Orders come from the orders themselves.
    Commission totals are all-time: what she is owed does not depend on the
    date filter.
    """
    now = now or datetime.now(timezone.utc)
    await settle(db, now)
    infs = (await db.execute(select(Influencer).order_by(Influencer.created_at))).scalars().all()

    ev = {r.inf: r for r in (await db.execute(
        select(_inf_prop().label("inf"),
               _count("influencer_click").label("clicks"),
               sa.func.count(sa.distinct(AnalyticsEvent.session_id)).label("sessions"),
               sa.func.count(sa.distinct(AnalyticsEvent.properties.op("->>")("visitor"))).label("visitors"),
               sa.func.count(sa.distinct(sa.case(
                   (AnalyticsEvent.properties.op("->>")("returning") == "true", AnalyticsEvent.properties.op("->>")("visitor"))))).label("returning"),
               _count("product_viewed").label("views"),
               _count("add_to_cart").label("bag"),
               _count("checkout_initiated").label("checkouts"))
        .where(AnalyticsEvent.created_at >= start, AnalyticsEvent.created_at < end, _inf_prop().isnot(None))
        # By position: the key is a bind parameter, so Postgres cannot tell
        # that a repeated `properties ->> $n` is the selected expression.
        .group_by(sa.text("1"))
    )).all()}

    viewed: dict[str, list] = {}
    for inf, pid, name, n in (await db.execute(
        select(_inf_prop(), Product.id, Product.name, sa.func.count(AnalyticsEvent.id))
        .join(Product, AnalyticsEvent.properties.op("->>")("product_id") == sa.cast(Product.id, sa.Text))
        .where(AnalyticsEvent.created_at >= start, AnalyticsEvent.created_at < end,
               AnalyticsEvent.event_type == "product_viewed", _inf_prop().isnot(None))
        .group_by(sa.text("1"), Product.id, Product.name)
    )).all():
        viewed.setdefault(inf, []).append({"id": str(pid), "name": name, "views": int(n)})

    orders = (await db.execute(
        select(Order.id, Order.influencer_id, Order.influencer_via, Order.status, Order.payment_method,
               Order.total_amount, Order.created_at, Order.settled_at, Order.user_id)
        .where(Order.influencer_id.isnot(None), Order.created_at >= start, Order.created_at < end)
    )).all()
    bought: dict[uuid.UUID, dict[str, dict]] = {}
    if orders:
        for inf_id, pid, name, units in (await db.execute(
            select(Order.influencer_id, Product.id, Product.name, sa.func.sum(OrderItem.quantity))
            .select_from(OrderItem)
            .join(Order, Order.id == OrderItem.order_id)
            .join(ProductVariant, ProductVariant.id == OrderItem.product_variant_id)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(Order.id.in_([o.id for o in orders]),
                   Order.status.notin_((OrderStatus.CANCELLED, OrderStatus.FAILED_PAYMENT)))
            .group_by(Order.influencer_id, Product.id, Product.name)
        )).all():
            bought.setdefault(inf_id, {})[str(pid)] = {"id": str(pid), "name": name, "units": int(units or 0)}

    comm = (await db.execute(
        select(InfluencerCommission.influencer_id, InfluencerCommission.status,
               sa.func.count(InfluencerCommission.id), sa.func.coalesce(sa.func.sum(InfluencerCommission.amount_paise), 0))
        .group_by(InfluencerCommission.influencer_id, InfluencerCommission.status)
    )).all()
    owed: dict[uuid.UUID, dict[str, int]] = {}
    for inf_id, st, _n, amt in comm:
        owed.setdefault(inf_id, {})[st] = int(amt)

    def money_row():
        return {"orders": 0, "collected_paise": 0, "committed_paise": 0, "by_code": 0, "by_link": 0,
                "statuses": {k: 0 for k in ("confirmed", "delivered", "cod_pending", "cancelled", "returned", "unpaid")},
                "customers": set(), "link_customers": set()}

    per: dict[uuid.UUID, dict] = {}
    for o in orders:
        row = per.setdefault(o.influencer_id, money_row())
        row["statuses"][bucket(o.status, o.payment_method)] += 1
        kind = metrics.classify(o.status, o.payment_method,
                                minutes_old=(now - o.created_at).total_seconds() / 60 if o.created_at else None,
                                settled=o.settled_at is not None)
        if kind in metrics.REAL:
            row["orders"] += 1
            row["customers"].add(o.user_id)
            if o.influencer_via == "link":
                row["link_customers"].add(o.user_id)
            row["by_code" if o.influencer_via == "code" else "by_link"] += 1
            if kind in ("paid", "delivered", "marketplace_settled"):
                row["collected_paise"] += int(o.total_amount or 0)
            else:
                row["committed_paise"] += int(o.total_amount or 0)

    codes = {c.influencer_id: c.code for c in (await db.execute(
        select(Coupon.influencer_id, Coupon.code).where(Coupon.influencer_id.isnot(None), Coupon.is_active.is_(True))
    )).all()}

    out, totals = [], {"influencers_active": 0, "clicks": 0, "visitors": 0, "sessions": 0, "orders": 0,
                       "collected_paise": 0, "committed_paise": 0, "commission_pending_paise": 0,
                       "commission_payable_paise": 0, "commission_paid_paise": 0}
    for inf in infs:
        e = ev.get(inf.code)
        m = per.get(inf.id, money_row())
        o_ = owed.get(inf.id, {})
        visitors = int(e.visitors) if e else 0
        sales = m["collected_paise"] + m["committed_paise"]
        row = {
            "id": str(inf.id), "name": inf.name, "code": inf.code, "instagram": inf.instagram,
            "is_active": inf.is_active, "discount_code": codes.get(inf.id),
            "commission_rule": rule_text(inf.commission_type, inf.commission_value),
            "clicks": int(e.clicks) if e else 0, "visitors": visitors,
            "returning_visitors": int(e.returning) if e else 0,
            "sessions": int(e.sessions) if e else 0, "product_views": int(e.views) if e else 0,
            "add_to_cart": int(e.bag) if e else 0, "checkouts": int(e.checkouts) if e else 0,
            "orders": m["orders"], "customers": len(m["customers"]),
            "orders_by_code": m["by_code"], "orders_by_link": m["by_link"],
            "statuses": m["statuses"],
            "collected_paise": m["collected_paise"], "committed_paise": m["committed_paise"],
            # Of the visitors her link brought, the share who ordered through
            # it. Code orders are left out: a code can be typed by someone
            # the site never saw arrive, which once put this above 100%.
            # A customer with two orders is one converted visitor.
            "conversion": min(1.0, len(m["link_customers"]) / visitors) if visitors else None,
            "aov_paise": (sales // m["orders"]) if m["orders"] else None,
            "commission": {"pending_paise": o_.get("pending", 0), "payable_paise": o_.get("earned", 0),
                           "paid_paise": o_.get("paid", 0), "reversed_paise": o_.get("reversed", 0)},
            "top_viewed": sorted(viewed.get(inf.code, []), key=lambda x: -x["views"])[:5],
            "top_bought": sorted(bought.get(inf.id, {}).values(), key=lambda x: -x["units"])[:5],
        }
        out.append(row)
        if inf.is_active:
            totals["influencers_active"] += 1
        for k in ("clicks", "visitors", "sessions", "orders", "collected_paise", "committed_paise"):
            totals[k] += row[k]
        totals["commission_pending_paise"] += row["commission"]["pending_paise"]
        totals["commission_payable_paise"] += row["commission"]["payable_paise"]
        totals["commission_paid_paise"] += row["commission"]["paid_paise"]
    out.sort(key=lambda r: (-(r["collected_paise"] + r["committed_paise"]), -r["visitors"]))
    linked = sum(len(per.get(uuid.UUID(r["id"]), money_row())["link_customers"]) for r in out)
    totals["conversion"] = min(1.0, linked / totals["visitors"]) if totals["visitors"] else None
    return {"start": start.isoformat(), "end": end.isoformat(), "totals": totals, "influencers": out,
            "window_days": settings.INFLUENCER_WINDOW_DAYS}
