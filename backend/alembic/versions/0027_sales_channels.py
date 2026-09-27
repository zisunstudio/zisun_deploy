"""one business across the website and the marketplaces

ZISUN will sell on Amazon, Myntra, Meesho and AJIO as well as zisun.in. Each
of those is a seller portal with its own order list, its own names for the
same kurta, and its own payout cycle. Without this, "how many did we sell
this week" is four logins and a spreadsheet, and the stock count on the
website knows nothing about a piece Amazon sold an hour ago.

Three tables and five columns make it one business:

  sales_channels     the channels, the website included
  channel_listings   a marketplace SKU -> the ZISUN variant it is, so an
                     order from anywhere lands on the one stock count
  channel_imports    every file she brought in and what it did
  orders.channel_id, external_order_id     where an order was sold and
                     the marketplace's own id for it - unique together, so
                     importing the same file twice changes nothing
  orders.settled_at, settlement_amount     when the marketplace actually
                     paid, and how much after commission; a marketplace
                     order is not money until this is set
  orders.external_invoice_number           the marketplace's invoice
                     number when it issued the invoice, so ZISUN's own
                     consecutive series is not burnt on it

Existing orders are untouched: a NULL channel is the website.

`paymentmethod` gains MARKETPLACE. The customer paid the marketplace, not
Razorpay and not the courier, and recording it as either would be the kind
of small lie the money definitions in services/metrics.py exist to catch.

Revision ID: 0027
Revises: 0026
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


CHANNELS = [
    # code, name, is_marketplace, settlement_days
    ("web", "zisun.in", False, None),
    ("amazon", "Amazon", True, 7),
    ("myntra", "Myntra", True, 15),
    ("meesho", "Meesho", True, 7),
    ("ajio", "AJIO", True, 15),
]


def upgrade() -> None:
    # Postgres 12+ allows this inside a transaction as long as the new value
    # is not *used* in the same transaction; nothing below uses it.
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'MARKETPLACE'")

    op.create_table(
        "sales_channels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(30), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_marketplace", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("settlement_days", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "channel_listings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("channel_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("sales_channels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_variant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_sku", sa.String(120), nullable=False),
        sa.Column("external_listing_id", sa.String(120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("channel_id", "external_sku", name="uq_channel_listing_sku"),
    )
    op.create_index("ix_channel_listings_channel_id", "channel_listings", ["channel_id"])
    op.create_index("ix_channel_listings_product_variant_id", "channel_listings", ["product_variant_id"])

    op.create_table(
        "channel_imports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("channel_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("sales_channels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("rows_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("orders_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("orders_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows_skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("problems", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_channel_imports_channel_id", "channel_imports", ["channel_id"])

    op.add_column("orders", sa.Column("channel_id", postgresql.UUID(as_uuid=True),
                                      sa.ForeignKey("sales_channels.id"), nullable=True))
    op.add_column("orders", sa.Column("external_order_id", sa.String(100), nullable=True))
    op.add_column("orders", sa.Column("external_invoice_number", sa.String(60), nullable=True))
    op.add_column("orders", sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("settlement_amount", sa.Integer(), nullable=True))
    op.create_index("ix_orders_channel_id", "orders", ["channel_id"])
    op.create_unique_constraint("uq_orders_channel_external", "orders", ["channel_id", "external_order_id"])

    channels = sa.table(
        "sales_channels",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("is_marketplace", sa.Boolean),
        sa.column("settlement_days", sa.Integer),
    )
    op.bulk_insert(channels, [
        {"id": uuid.uuid4(), "code": code, "name": name, "is_marketplace": mp, "settlement_days": days}
        for code, name, mp, days in CHANNELS
    ])


def downgrade() -> None:
    op.drop_constraint("uq_orders_channel_external", "orders", type_="unique")
    op.drop_index("ix_orders_channel_id", table_name="orders")
    for col in ("settlement_amount", "settled_at", "external_invoice_number", "external_order_id", "channel_id"):
        op.drop_column("orders", col)
    op.drop_index("ix_channel_imports_channel_id", table_name="channel_imports")
    op.drop_table("channel_imports")
    op.drop_index("ix_channel_listings_product_variant_id", table_name="channel_listings")
    op.drop_index("ix_channel_listings_channel_id", table_name="channel_listings")
    op.drop_table("channel_listings")
    op.drop_table("sales_channels")
    # An enum value cannot be removed; MARKETPLACE stays, unused.
