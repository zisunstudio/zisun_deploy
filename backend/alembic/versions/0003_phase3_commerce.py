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


def _alter_if_not_uuid(table: str, column: str) -> None:
    """Run ALTER COLUMN ... TYPE UUID only when the column isn't already UUID."""
    op.execute(
        f"""
        DO $$ BEGIN
          IF (
            SELECT data_type
            FROM information_schema.columns
            WHERE table_name = '{table}' AND column_name = '{column}'
          ) != 'uuid' THEN
            ALTER TABLE {table}
              ALTER COLUMN {column} TYPE UUID USING {column}::uuid;
          END IF;
        END $$;
        """
    )


def upgrade() -> None:
    # ── orders: add razorpay_order_id ─────────────────────────────────────
    op.add_column(
        "orders",
        sa.Column("razorpay_order_id", sa.String(100), nullable=True),
    )
    op.create_index("ix_orders_razorpay_order_id", "orders", ["razorpay_order_id"], unique=True)

    # ── outbox_events: ensure payload is JSONB (already JSONB in fresh DBs) ─
    op.execute(
        """
        DO $$ BEGIN
          IF (
            SELECT data_type
            FROM information_schema.columns
            WHERE table_name = 'outbox_events' AND column_name = 'payload'
          ) = 'text' THEN
            ALTER TABLE outbox_events
              ALTER COLUMN payload TYPE JSONB USING payload::jsonb;
          END IF;
        END $$;
        """
    )

    # ── Fix FK columns that may have been TEXT in some envs ───────────────
    # Each call is a no-op when the column is already UUID (fresh DB).
    _alter_if_not_uuid("carts", "user_id")
    _alter_if_not_uuid("cart_items", "cart_id")
    _alter_if_not_uuid("cart_items", "product_variant_id")
    _alter_if_not_uuid("orders", "user_id")
    _alter_if_not_uuid("orders", "address_id")
    _alter_if_not_uuid("order_items", "order_id")
    _alter_if_not_uuid("order_items", "product_variant_id")
    _alter_if_not_uuid("payments", "order_id")
    _alter_if_not_uuid("inventory_locks", "product_variant_id")
    _alter_if_not_uuid("inventory_locks", "order_id")
    _alter_if_not_uuid("fulfillments", "order_id")
    _alter_if_not_uuid("addresses", "user_id")


def downgrade() -> None:
    op.drop_index("ix_orders_razorpay_order_id", table_name="orders")
    op.drop_column("orders", "razorpay_order_id")

    # Revert JSONB → TEXT (lossy but acceptable for downgrade)
    op.execute(
        "ALTER TABLE outbox_events "
        "ALTER COLUMN payload TYPE TEXT USING payload::text"
    )
