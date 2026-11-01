"""collections, influencers, and their commissions

A collection is a hand-picked set of pieces with its own page. An influencer
has a code, a link that lands on her collection, an optional discount code,
and a commission rule. `orders.influencer_id` credits an order to at most one
influencer; `influencer_commissions` is unique per order.

Revision ID: 0031
Revises: 0030
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_collections_slug", "collections", ["slug"])
    op.create_table(
        "collection_products",
        sa.Column("collection_id", UUID, sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "influencers",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("code", sa.String(30), nullable=False, unique=True),
        sa.Column("instagram", sa.String(300), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("collection_id", UUID, sa.ForeignKey("collections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("commission_type", sa.String(10), nullable=False, server_default="percent"),
        sa.Column("commission_value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_influencers_code", "influencers", ["code"])

    op.add_column("coupons", sa.Column("influencer_id", UUID, sa.ForeignKey("influencers.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_coupons_influencer_id", "coupons", ["influencer_id"])
    op.add_column("orders", sa.Column("influencer_id", UUID, sa.ForeignKey("influencers.id", ondelete="SET NULL"), nullable=True))
    op.add_column("orders", sa.Column("influencer_via", sa.String(10), nullable=True))
    op.create_index("ix_orders_influencer_id", "orders", ["influencer_id"])

    op.create_table(
        "influencer_commissions",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("influencer_id", UUID, sa.ForeignKey("influencers.id"), nullable=False),
        sa.Column("order_id", UUID, sa.ForeignKey("orders.id"), nullable=False, unique=True),
        sa.Column("base_paise", sa.Integer(), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("rule", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("delivered_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("earned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payout_ref", sa.String(80), nullable=True),
        sa.Column("reason", sa.String(120), nullable=True),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_influencer_commissions_influencer_id", "influencer_commissions", ["influencer_id"])
    op.create_index("ix_influencer_commissions_status", "influencer_commissions", ["status"])


def downgrade() -> None:
    op.drop_table("influencer_commissions")
    op.drop_index("ix_orders_influencer_id", table_name="orders")
    op.drop_column("orders", "influencer_via")
    op.drop_column("orders", "influencer_id")
    op.drop_index("ix_coupons_influencer_id", table_name="coupons")
    op.drop_column("coupons", "influencer_id")
    op.drop_table("influencers")
    op.drop_table("collection_products")
    op.drop_table("collections")
