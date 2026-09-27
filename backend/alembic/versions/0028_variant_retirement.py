"""a deleted variant stays deleted

The console's Delete button only set `is_active = False`. The row, and its
stock, stayed; the inventory page lists inactive variants (that is how "off
sale" is shown), so a "deleted" medium came back on the next load, faded,
still counting 1. The founder saw the delete work, refreshed, and saw it
undone - and "off sale" and "deleted" were indistinguishable.

A variant that has ever been ordered cannot be erased: order lines and
stock locks point at it and an order is a record of what was sold. So a
delete now does one of two honest things (admin endpoint), and this column
is the second: `deleted_at` marks a retired variant, kept only for history,
with its stock set to 0 and hidden from every list, the storefront, every
count and every stock-restoring job.

Revision ID: 0028
Revises: 0027
"""
import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("product_variants", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    # SKU unique among live variants only: a retired row keeps its SKU for its
    # order history, and she can list the same SKU again.
    # 0001 named it uq_product_variants_sku, but an ORM `unique=True` would
    # have made a constraint or ix_ index instead; the production schema is
    # not readable from here, so drop every form it could have taken.
    op.execute("DROP INDEX IF EXISTS uq_product_variants_sku")
    op.execute("DROP INDEX IF EXISTS ix_product_variants_sku")
    op.execute("ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_sku_key")
    op.create_index("uq_product_variants_sku", "product_variants", ["sku"], unique=True,
                    postgresql_where=sa.text("deleted_at IS NULL"))


def downgrade() -> None:
    op.drop_index("uq_product_variants_sku", table_name="product_variants")
    op.create_index("uq_product_variants_sku", "product_variants", ["sku"], unique=True)
    op.drop_column("product_variants", "deleted_at")
