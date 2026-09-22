"""shipping on the order

Free shipping is for prepaid orders only; Cash on Delivery carries a
shipping charge (COD_SHIPPING_FEE_PAISE, Rs 99). It is money, so it is a
column on the order and part of total_amount - not a label on a page - and
the courier is told to collect it.

Revision ID: 0018
Revises: 0017
"""
import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("shipping_amount", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("orders", "shipping_amount")
