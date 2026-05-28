"""Phase 3 Commerce — UUID FK columns, razorpay_order_id, JSONB payload

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── orders: add razorpay_order_id ─────────────────────────────────────
    op.add_column(
        "orders",
        sa.Column("razorpay_order_id", sa.String(100), nullable=True),
    )
    op.create_index("ix_orders_razorpay_order_id", "orders", ["razorpay_order_id"], unique=True)

    # ── outbox_events: change payload from TEXT to JSONB ──────────────────
    # The column was created as JSONB in migration 0001 already, but the ORM
    # had it typed as String. If it is TEXT in an existing DB, convert it:
    op.execute(
        "ALTER TABLE outbox_events "
        "ALTER COLUMN payload TYPE JSONB USING payload::jsonb"
    )

    # ── Fix FK columns that may have been created as TEXT in some envs ────
    # carts.user_id
    op.execute(
        "ALTER TABLE carts "
        "ALTER COLUMN user_id TYPE UUID USING user_id::uuid"
    )

    # cart_items.cart_id, product_variant_id
    op.execute(
        "ALTER TABLE cart_items "
        "ALTER COLUMN cart_id TYPE UUID USING cart_id::uuid"
    )
    op.execute(
        "ALTER TABLE cart_items "
        "ALTER COLUMN product_variant_id TYPE UUID USING product_variant_id::uuid"
    )

    # orders.user_id, address_id
    op.execute(
        "ALTER TABLE orders "
        "ALTER COLUMN user_id TYPE UUID USING user_id::uuid"
    )
    op.execute(
        "ALTER TABLE orders "
        "ALTER COLUMN address_id TYPE UUID USING address_id::uuid"
    )

    # order_items.order_id, product_variant_id
    op.execute(
        "ALTER TABLE order_items "
        "ALTER COLUMN order_id TYPE UUID USING order_id::uuid"
    )
    op.execute(
        "ALTER TABLE order_items "
        "ALTER COLUMN product_variant_id TYPE UUID USING product_variant_id::uuid"
    )

    # payments.order_id
    op.execute(
        "ALTER TABLE payments "
        "ALTER COLUMN order_id TYPE UUID USING order_id::uuid"
    )

    # inventory_locks.product_variant_id, order_id
    op.execute(
        "ALTER TABLE inventory_locks "
        "ALTER COLUMN product_variant_id TYPE UUID USING product_variant_id::uuid"
    )
    op.execute(
        "ALTER TABLE inventory_locks "
        "ALTER COLUMN order_id TYPE UUID USING order_id::uuid"
    )

    # fulfillments.order_id
    op.execute(
        "ALTER TABLE fulfillments "
        "ALTER COLUMN order_id TYPE UUID USING order_id::uuid"
    )

    # addresses.user_id
    op.execute(
        "ALTER TABLE addresses "
        "ALTER COLUMN user_id TYPE UUID USING user_id::uuid"
    )


def downgrade() -> None:
    op.drop_index("ix_orders_razorpay_order_id", table_name="orders")
    op.drop_column("orders", "razorpay_order_id")

    # Revert JSONB → TEXT (lossy but acceptable for downgrade)
    op.execute(
        "ALTER TABLE outbox_events "
        "ALTER COLUMN payload TYPE TEXT USING payload::text"
    )
