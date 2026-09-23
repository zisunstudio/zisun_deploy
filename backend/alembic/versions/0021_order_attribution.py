"""where the order came from

Nothing recorded a traffic source, so "Instagram is our channel" was a belief
the site could not check and no rupee could be traced to anything. The
storefront now captures a first touch (lib/attribution.ts) and sends it with
the order; these columns keep it beside the money for good, because analytics
events expire from usefulness while an order is permanent.

First touch, not last: the post that introduced ZISUN gets the credit, not the
direct visit a week later. All nullable - an order placed by someone who
blocks analytics still saves.

Revision ID: 0021
Revises: 0020
"""
import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("source", sa.String(60), nullable=True))
    op.add_column("orders", sa.Column("medium", sa.String(60), nullable=True))
    op.add_column("orders", sa.Column("campaign", sa.String(120), nullable=True))
    op.add_column("orders", sa.Column("content", sa.String(120), nullable=True))
    op.add_column("orders", sa.Column("referrer_domain", sa.String(200), nullable=True))
    op.create_index("ix_orders_source", "orders", ["source"])


def downgrade() -> None:
    op.drop_index("ix_orders_source", table_name="orders")
    for c in ("referrer_domain", "content", "campaign", "medium", "source"):
        op.drop_column("orders", c)
