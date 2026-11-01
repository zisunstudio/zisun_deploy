"""Collections, influencers, and what an influencer is owed.

A *collection* is a hand-picked, ordered set of pieces with its own page
(`/collections/<slug>`), reusable for any campaign. An *influencer* has one
code (`riya`), one short link (`zisun.in/r/riya`) that lands on her
collection, an optional discount code of her own, and a commission rule.

An order belongs to at most one influencer (`orders.influencer_id`), and an
`influencer_commissions` row is unique per order - so an order can never be
credited twice, to two people or to the same one. The rules that decide who
gets it, and when it becomes payable, are in `services/influencer.py`.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, BaseModel


class Collection(BaseModel):
    __tablename__ = "collections"

    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    # A draft is invisible to the public; the console previews it.
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    items: Mapped[List["CollectionProduct"]] = relationship(
        "CollectionProduct", order_by="CollectionProduct.position",
        cascade="all, delete-orphan", lazy="selectin",
    )


class CollectionProduct(Base):
    __tablename__ = "collection_products"

    collection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Influencer(BaseModel):
    __tablename__ = "influencers"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # The ref in her link: lowercase letters, digits and dashes.
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    instagram: Mapped[Optional[str]] = mapped_column(String(300))
    # Only to recognise her own purchases, which earn nothing. Never shown
    # anywhere but the console, never sent to anyone.
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    collection_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("collections.id", ondelete="SET NULL"))
    # Where `zisun.in/r/<code>` lands when it is not her collection: a piece
    # (`/product/<id>`), a category (`/category/<slug>`) or `/`. Checked by
    # `services.influencer.safe_landing`; empty means her collection.
    landing: Mapped[Optional[str]] = mapped_column(String(300))
    # "percent" (value = whole percent) or "fixed" (value = paise per order).
    commission_type: Mapped[str] = mapped_column(String(10), nullable=False, default="percent")
    commission_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class InfluencerCommission(BaseModel):
    """What one influencer is owed for one order.

    Written when the order is placed, settled when someone reads:
    pending -> earned (delivered, and the 14-day exchange window has passed)
    -> paid (the founder marks the transfer, with its reference). Void if the
    order is cancelled, fails at payment, comes back, or is her own. If an
    earned or paid order comes back later, `reversed`: paid money is shown as
    owed back.
    """
    __tablename__ = "influencer_commissions"

    influencer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("influencers.id"), nullable=False, index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), nullable=False, unique=True)
    # What the commission was worked out on: the goods she paid for, after
    # any discount and store credit, without the delivery charge.
    base_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    # The rule as it stood when the order was placed, so changing her rate
    # later never rewrites what an old order earned.
    rule: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    delivered_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    earned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    payout_ref: Mapped[Optional[str]] = mapped_column(String(80))
    reason: Mapped[Optional[str]] = mapped_column(String(120))
    reversed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
