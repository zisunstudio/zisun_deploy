"""COD pre-dispatch confirmation state

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-22

COD orders return at roughly 26% against under 2% for prepaid. Confirming with
the customer before anything ships is the cheapest control available, and it
needs somewhere to record the answer.
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

COD_CONFIRMATION = sa.Enum(
    "PENDING", "CONFIRMED", "DECLINED", "UNREACHABLE", name="codconfirmation"
)


def upgrade() -> None:
    COD_CONFIRMATION.create(op.get_bind(), checkfirst=True)
    op.add_column("orders", sa.Column("cod_confirmation", COD_CONFIRMATION, nullable=True))
    op.add_column(
        "orders", sa.Column("cod_confirmation_sent_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "orders", sa.Column("cod_confirmed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "orders",
        sa.Column("cod_confirmation_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    # The sweep task queries "COD orders still waiting" every few minutes, and
    # that is the only access pattern this column has.
    op.create_index("ix_orders_cod_confirmation", "orders", ["cod_confirmation"])


def downgrade() -> None:
    op.drop_index("ix_orders_cod_confirmation", table_name="orders")
    op.drop_column("orders", "cod_confirmation_attempts")
    op.drop_column("orders", "cod_confirmed_at")
    op.drop_column("orders", "cod_confirmation_sent_at")
    op.drop_column("orders", "cod_confirmation")
    COD_CONFIRMATION.drop(op.get_bind(), checkfirst=True)
