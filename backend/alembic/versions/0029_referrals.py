"""referral codes that belong to someone, their rewards, and store credit

A referral code earns for its owner when it sells: a creator is paid cash
by hand, a customer earns store credit. `coupons` learns who owns a code;
`referral_rewards` holds one row per referred order, settled once the
parcel is delivered and the hold has passed; `orders.credit_applied`
records store credit spent, so the balance is derived rather than stored.

Revision ID: 0029
Revises: 0028
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("coupons", sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("coupons", sa.Column("referral_kind", sa.String(20), nullable=True))
    op.add_column("coupons", sa.Column("owner_label", sa.String(80), nullable=True))
    op.create_index("ix_coupons_owner_user_id", "coupons", ["owner_user_id"])

    op.add_column("orders", sa.Column("credit_applied", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "referral_rewards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("coupon_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("coupons.id"), nullable=False),
        sa.Column("referrer_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), nullable=False, unique=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("delivered_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("earned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_referral_rewards_coupon_id", "referral_rewards", ["coupon_id"])
    op.create_index("ix_referral_rewards_referrer_user_id", "referral_rewards", ["referrer_user_id"])
    op.create_index("ix_referral_rewards_status", "referral_rewards", ["status"])


def downgrade() -> None:
    op.drop_table("referral_rewards")
    op.drop_column("orders", "credit_applied")
    op.drop_index("ix_coupons_owner_user_id", table_name="coupons")
    op.drop_column("coupons", "owner_label")
    op.drop_column("coupons", "referral_kind")
    op.drop_column("coupons", "owner_user_id")
