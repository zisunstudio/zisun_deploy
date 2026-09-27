"""Bring a marketplace's orders and payouts into the one set of books.

Everything a marketplace sells is written as an ordinary `Order`, with the
same items, the same tax snapshot and the same stock decrement a website
sale gets - so every list, count and money figure in the console already
knows about it. Three things differ, and each is deliberate:

* **The customer is the channel.** A marketplace does not give the seller
  the buyer's phone (Amazon masks it; Myntra and Meesho give none), and an
  order must belong to a user. Each channel owns one account - "Amazon
  customer" - and every order from it hangs there. The shipping address,
  where the file carries one, is kept on the order for GST's place of
  supply and for the console.

* **The money is not ours until the marketplace pays.** The customer paid
  Amazon, not Razorpay and not the courier, and Amazon pays ZISUN a week
  or two after delivery, less its fees. So `payment_method` is MARKETPLACE,
  and `services/metrics.py` counts the order as *committed* until a
  settlement file sets `settled_at` - after which what was actually paid,
  `settlement_amount`, is what counts as collected. Never the list price.

* **The marketplace ships it.** Myntra, AJIO and Meesho always book the
  courier themselves, and Amazon nearly always does. A channel order is
  never sent to Shiprocket, and the console does not say "no courier
  booked" about it.

Stock is the one count. A marketplace sale takes from
`product_variants.stock` under the same row lock checkout uses. It cannot
be *refused* for want of stock - the sale already happened - so a count
that would go negative is set to zero and the shortfall is reported in the
founder's own words: check the shelf.

Importing the same file twice changes nothing: an order is found by
(channel, external id), and only a status that moves *forward* is applied.
"""
from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import ProductVariant
from app.models.channel import ChannelImport, ChannelListing, SalesChannel
from app.models.order import Address, Order, OrderItem, OrderStatus, PaymentMethod
from app.models.user import User, UserRole
from app.services.channel_files import ExternalOrder, Parsed, Settlement
from app.services.invoicing import snapshot_tax

logger = logging.getLogger(__name__)

#: How far along an order is. An import may only move it to a higher rank
#: or to a terminal state; a stale file never drags a delivered order back.
_RANK = {
    OrderStatus.CREATED: 0, OrderStatus.PAYMENT_PENDING: 0, OrderStatus.PAID: 1,
    OrderStatus.PACKED: 2, OrderStatus.SHIPPED: 3, OrderStatus.DELIVERED: 4,
}
_TERMINAL = {OrderStatus.CANCELLED, OrderStatus.RETURNED, OrderStatus.FAILED_PAYMENT}
#: Statuses in which the pieces are, or are about to be, out of the building.
_HOLDS_STOCK = {OrderStatus.PAID, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.DELIVERED}


def _norm(sku: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (sku or "").lower())


@dataclass
class ImportResult:
    rows_total: int = 0
    orders_created: int = 0
    orders_updated: int = 0
    orders_unchanged: int = 0
    rows_skipped: int = 0
    stock_adjusted: int = 0            # units taken from stock
    problems: list[str] = field(default_factory=list)


# ── Channels and their customer ─────────────────────────────────────────────

async def get_channel(db: AsyncSession, code: str) -> Optional[SalesChannel]:
    return (await db.execute(select(SalesChannel).where(SalesChannel.code == code.lower()))).scalar_one_or_none()


def _channel_email(channel: SalesChannel) -> str:
    return f"{channel.code}@channels.zisun.internal"


async def channel_user(db: AsyncSession, channel: SalesChannel) -> User:
    """The one account every order from this channel belongs to."""
    email = _channel_email(channel)
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(email=email, name=f"{channel.name} customer", role=UserRole.user)
        db.add(user)
        await db.flush()
    return user


# ── SKU resolution ───────────────────────────────────────────────────────────

async def sku_lookup(db: AsyncSession, channel: SalesChannel) -> dict[str, uuid.UUID]:
    """Marketplace SKU -> ZISUN variant id.

    Mapped listings first. Then ZISUN's own SKUs, because the simplest way to
    run five channels is to list everywhere under the same SKU, and that
    should just work without her mapping each one by hand.
    """
    out: dict[str, uuid.UUID] = {}
    variants = (await db.execute(select(ProductVariant.sku, ProductVariant.id))).all()
    for sku, vid in variants:
        if sku:
            out[_norm(sku)] = vid
    listings = (await db.execute(
        select(ChannelListing.external_sku, ChannelListing.product_variant_id)
        .where(ChannelListing.channel_id == channel.id, ChannelListing.is_active.is_(True))
    )).all()
    for sku, vid in listings:
        out[_norm(sku)] = vid                          # a mapping wins over a coincidence
    return out


def unmapped_skus(parsed: Parsed, lookup: dict[str, uuid.UUID]) -> list[str]:
    seen: dict[str, str] = {}
    for o in parsed.orders:
        for line in o.lines:
            if _norm(line.sku) not in lookup:
                seen.setdefault(_norm(line.sku), line.sku)
    return sorted(seen.values())


# ── Orders ───────────────────────────────────────────────────────────────────

async def _existing(db: AsyncSession, channel: SalesChannel, external_id: str) -> Optional[Order]:
    return (await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.channel_id == channel.id, Order.external_order_id == external_id)
        .with_for_update()
    )).scalar_one_or_none()


async def _take_stock(db: AsyncSession, variant_id: uuid.UUID, qty: int, result: ImportResult, label: str) -> None:
    v = (await db.execute(
        select(ProductVariant).where(ProductVariant.id == variant_id).with_for_update()
    )).scalar_one()
    if v.stock >= qty:
        v.stock -= qty
    else:
        # The marketplace already sold it; refusing the import would not put
        # the piece back on the shelf. Record the disagreement instead.
        result.problems.append(
            f"{label}: {v.sku} had {v.stock} in stock, order needed {qty} - stock set to 0, check the shelf")
        v.stock = 0
    result.stock_adjusted += qty


async def _return_stock(db: AsyncSession, order: Order) -> None:
    for item in order.items:
        v = (await db.execute(
            select(ProductVariant).where(ProductVariant.id == item.product_variant_id).with_for_update()
        )).scalar_one_or_none()
        if v is not None:
            v.stock += item.quantity


async def _create(db: AsyncSession, channel: SalesChannel, user: User, o: ExternalOrder,
                  lookup: dict[str, uuid.UUID], adjust_stock: bool, result: ImportResult) -> None:
    status = OrderStatus(o.status)
    address = Address(
        user_id=user.id,
        line1=o.line1 or f"Fulfilled by {channel.name}",
        line2=o.line2,
        city=o.city or (o.state or channel.name),
        state=o.state or "",
        pincode=o.pincode or "",
        is_default=False,
    )
    db.add(address)
    await db.flush()

    order = Order(
        user_id=user.id,
        status=status,
        total_amount=o.total_paise,
        address_id=address.id,
        payment_method=PaymentMethod.MARKETPLACE,
        channel_id=channel.id,
        external_order_id=o.external_id,
        external_invoice_number=o.invoice,
        region=o.state,
        # Attribution: the marketplace *is* where this customer came from.
        source=channel.code,
        medium="marketplace",
        shipping_amount=0,
        discount_amount=0,
    )
    if o.ordered_at is not None:
        order.created_at = o.ordered_at
    db.add(order)
    await db.flush()

    tax_items = []
    for line in o.lines:
        vid = lookup[_norm(line.sku)]
        v = (await db.execute(
            select(ProductVariant).options(selectinload(ProductVariant.product)).where(ProductVariant.id == vid)
        )).scalar_one()
        db.add(OrderItem(order_id=order.id, product_variant_id=vid, quantity=line.quantity,
                         unit_price=line.unit_price_paise))
        tax_items.append({
            "description": v.product.name if v.product else "Garment",
            "quantity": line.quantity,
            "unit_price_paise": line.unit_price_paise,
            "hsn": getattr(v.product, "hsn_code", None),
        })
        if adjust_stock and status in _HOLDS_STOCK:
            await _take_stock(db, vid, line.quantity, result, f"{channel.name} {o.external_id}")

    # The same tax arithmetic as a website sale, so the GST report is one
    # report. No ZISUN invoice number: the marketplace issued that invoice
    # under its own series, and ours must stay consecutive.
    snapshot_tax(order, tax_items, o.state)
    result.orders_created += 1


async def ingest_orders(db: AsyncSession, channel: SalesChannel, parsed: Parsed, *,
                        adjust_stock: bool = True) -> ImportResult:
    """Write a parsed orders file. The caller commits."""
    result = ImportResult(rows_total=parsed.rows_total, problems=list(parsed.problems))
    result.rows_skipped = len(parsed.problems)
    user = await channel_user(db, channel)
    lookup = await sku_lookup(db, channel)

    for o in parsed.orders:
        label = f"{channel.name} order {o.external_id}"
        missing = [l.sku for l in o.lines if _norm(l.sku) not in lookup]
        if missing:
            result.problems.append(f"{label}: SKU {', '.join(sorted(set(missing)))} is not a ZISUN piece - order skipped. Map it under Listings.")
            result.rows_skipped += len(o.lines)
            continue

        existing = await _existing(db, channel, o.external_id)
        new_status = OrderStatus(o.status)
        if existing is None:
            await _create(db, channel, user, o, lookup, adjust_stock, result)
            continue

        old = existing.status
        if new_status == old:
            result.orders_unchanged += 1
        elif old in _TERMINAL:
            result.orders_unchanged += 1           # nothing moves a cancelled order
        elif new_status in _TERMINAL:
            if adjust_stock and old in _HOLDS_STOCK:
                await _return_stock(db, existing)
            existing.status = new_status
            result.orders_updated += 1
        elif _RANK.get(new_status, 0) > _RANK.get(old, 0):
            existing.status = new_status
            result.orders_updated += 1
        else:
            result.orders_unchanged += 1           # the file is older than what we know
        if o.invoice and not existing.external_invoice_number:
            existing.external_invoice_number = o.invoice
    return result


# ── Settlements ──────────────────────────────────────────────────────────────

async def ingest_settlements(db: AsyncSession, channel: SalesChannel, rows: list[Settlement],
                             rows_total: int, problems: list[str]) -> ImportResult:
    """Mark what the marketplace has actually paid, order by order."""
    result = ImportResult(rows_total=rows_total, problems=list(problems), rows_skipped=len(problems))
    for s in rows:
        order = (await db.execute(
            select(Order).where(Order.channel_id == channel.id, Order.external_order_id == s.external_id)
        )).scalar_one_or_none()
        if order is None:
            result.problems.append(f"{channel.name} order {s.external_id}: not in ZISUN yet - import its orders file first")
            result.rows_skipped += 1
            continue
        changed = order.settlement_amount != s.amount_paise or order.settled_at is None
        order.settlement_amount = s.amount_paise
        order.settled_at = order.settled_at or s.settled_on or datetime.now(timezone.utc)
        if changed:
            result.orders_updated += 1
        else:
            result.orders_unchanged += 1
    return result


# ── The console's view ───────────────────────────────────────────────────────

async def summary(db: AsyncSession) -> list[dict]:
    """Per channel: orders, what is owed by it, what it has paid, listings, last import."""
    channels = (await db.execute(select(SalesChannel).order_by(SalesChannel.is_marketplace, SalesChannel.name))).scalars().all()
    live = ~Order.status.in_([OrderStatus.CANCELLED, OrderStatus.RETURNED, OrderStatus.FAILED_PAYMENT])
    counts = {row[0]: row for row in (await db.execute(
        select(Order.channel_id, func.count(Order.id),
               func.coalesce(func.sum(Order.total_amount), 0),
               func.coalesce(func.sum(Order.settlement_amount), 0),
               func.count(Order.settled_at))
        .where(live).group_by(Order.channel_id)
    )).all()}
    listings = dict((await db.execute(
        select(ChannelListing.channel_id, func.count(ChannelListing.id))
        .where(ChannelListing.is_active.is_(True)).group_by(ChannelListing.channel_id)
    )).all())
    last_import = dict((await db.execute(
        select(ChannelImport.channel_id, func.max(ChannelImport.created_at)).group_by(ChannelImport.channel_id)
    )).all())
    out = []
    for c in channels:
        key = c.id if c.is_marketplace else None      # website orders carry no channel_id
        _, n, gross, settled, n_settled = counts.get(key, (key, 0, 0, 0, 0))
        out.append({
            "id": str(c.id), "code": c.code, "name": c.name, "is_marketplace": c.is_marketplace,
            "is_active": c.is_active, "settlement_days": c.settlement_days,
            "orders": int(n or 0),
            "gross_paise": int(gross or 0),
            "settled_paise": int(settled or 0),
            "orders_settled": int(n_settled or 0),
            "listings": int(listings.get(c.id, 0)),
            "last_import_at": last_import.get(c.id),
        })
    return out
