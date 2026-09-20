"""Offers, shelf order, per-product size charts, per-variant photographs

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-20

Four things the founder asked for after using the console, all catalogue
columns, shipped as one migration so a deploy is either fully on v2 or fully
off it.

products.compare_at_price — the price a product is marked down FROM, paise.
    NULL = no offer. base_price stays the selling price throughout, so
    checkout, inventory locks and gateway amounts are untouched by offers.
products.offer_ends_at — when the offer stops. The storefront counts down to
    it and stops showing the markdown after it, so a forgotten timer cannot
    leave a stale "-30%" on a live page.
products.shelf_rank — manual pin for the founder's drag-to-arrange. NULL =
    "let attention decide"; unpinned products are ordered by an analytics
    score with time decay. Indexed because it is the default sort key.
products.size_chart — JSONB, per-product measurements overriding the
    category chart. Stored in the unit she typed (cm or in); the storefront
    converts so the customer can toggle.
product_media.variant_id — which colour a photograph shows. NULL = general.
    ON DELETE SET NULL, never CASCADE: photographs are the most expensive
    asset in the business and deleting a variant must not take them with it.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("compare_at_price", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("offer_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("products", sa.Column("shelf_rank", sa.Integer(), nullable=True))
    op.create_index("ix_products_shelf_rank", "products", ["shelf_rank"])
    op.add_column("products", sa.Column("size_chart", postgresql.JSONB(), nullable=True))

    # UUID, matching BaseModel.id — a varchar column cannot carry an FK to a uuid PK.
    op.add_column("product_media", sa.Column("variant_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_product_media_variant_id",
        "product_media", "product_variants",
        ["variant_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_product_media_variant_id", "product_media", ["variant_id"])


def downgrade() -> None:
    op.drop_index("ix_product_media_variant_id", table_name="product_media")
    op.drop_constraint("fk_product_media_variant_id", "product_media", type_="foreignkey")
    op.drop_column("product_media", "variant_id")

    op.drop_column("products", "size_chart")
    op.drop_index("ix_products_shelf_rank", table_name="products")
    op.drop_column("products", "shelf_rank")
    op.drop_column("products", "offer_ends_at")
    op.drop_column("products", "compare_at_price")
