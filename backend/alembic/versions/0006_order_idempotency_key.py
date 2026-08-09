"""Add orders.idempotency_key for checkout idempotency

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-09

The checkout idempotency guard previously matched on razorpay_order_id, which
is never set to the client's key — so duplicate checkout submissions created
duplicate orders and double-decremented stock. This adds a dedicated,
uniquely-indexed idempotency_key column.
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(100);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_idempotency_key "
        "ON orders (idempotency_key)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_orders_idempotency_key")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS idempotency_key")
