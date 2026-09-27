"""Where an order was sold: the website, or a marketplace.

ZISUN sells on its own site today and will list on Amazon, Myntra, Meesho and
AJIO. Each marketplace is its own seller portal with its own order list,
its own SKU names and its own payout cycle - which is four places to look
for one business. These tables make it one place:

* `sales_channels` - the channels themselves. The website is a channel
  too, so "orders by channel" is one query with no special case.
* `channel_listings` - which ZISUN variant a marketplace's SKU (an ASIN, a
  Myntra style id, a Meesho SKU) actually is. This is what lets an order
  from any channel land on the *same* stock count. There is one count
  (`product_variants.stock`); a marketplace never gets its own.
* `channel_imports` - every file she brought in, with what it did. An
  import that silently skipped half its rows is worse than no import.

Orders themselves carry `channel_id` and `external_order_id` (migration
0027); an order with no channel is a website order, so nothing that already
existed had to change.

None of the marketplaces named above offers a seller API to a brand of this
size - they export orders and settlements as CSV or Excel from the portal.
So the connector is a file, read by `services/channel_files.py`, and the
day an API exists (Amazon SP-API needs a registered app and an approved
seller account) it feeds the same `services/channels.ingest_orders`.
"""
import uuid
from typing import List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class SalesChannel(BaseModel):
    __tablename__ = "sales_channels"

    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    #: False only for the website. A marketplace collects the customer's
    #: money itself and pays ZISUN later, less its commission, which is why
    #: its orders are never "collected" until a settlement says so.
    is_marketplace: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    #: Days after delivery the marketplace usually pays. Informational, for
    #: the console's "expected by" column; the truth is the settlement file.
    settlement_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    listings: Mapped[List["ChannelListing"]] = relationship("ChannelListing", back_populates="channel")


class ChannelListing(BaseModel):
    __tablename__ = "channel_listings"
    __table_args__ = (UniqueConstraint("channel_id", "external_sku", name="uq_channel_listing_sku"),)

    channel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sales_channels.id", ondelete="CASCADE"), nullable=False, index=True)
    product_variant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False, index=True)
    #: The SKU as the marketplace's file spells it. Matched case-insensitively.
    external_sku: Mapped[str] = mapped_column(String(120), nullable=False)
    #: The listing's own id there (an ASIN, a style id), when known.
    external_listing_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    channel: Mapped["SalesChannel"] = relationship("SalesChannel", back_populates="listings")
    variant: Mapped["ProductVariant"] = relationship("ProductVariant")  # noqa: F821


class ChannelImport(BaseModel):
    __tablename__ = "channel_imports"

    channel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sales_channels.id", ondelete="CASCADE"), nullable=False, index=True)
    #: "orders" or "settlements".
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    rows_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    orders_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    orders_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    #: One line per skipped row or unmatched column, in plain words.
    problems: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    channel: Mapped["SalesChannel"] = relationship("SalesChannel")
