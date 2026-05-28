"""Phase 2 Catalog & Discovery — media, wishlist, search vector, is_active flags

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── addresses: line2 ──────────────────────────────────────────────────
    op.add_column("addresses", sa.Column("line2", sa.String(255), nullable=True))

    # ── categories: new columns ────────────────────────────────────────────
    op.add_column("categories", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "categories",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    # ── products: is_active + search_vector ───────────────────────────────
    op.add_column(
        "products",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "products",
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=True),
    )
    op.create_index(
        "ix_products_search_vector",
        "products",
        ["search_vector"],
        postgresql_using="gin",
    )
    op.create_index("ix_products_is_active", "products", ["is_active"])

    # ── product_variants: is_active ───────────────────────────────────────
    op.add_column(
        "product_variants",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    # ── product_media ─────────────────────────────────────────────────────
    op.create_table(
        "product_media",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("url", sa.String(1024), nullable=False),
        sa.Column("cdn_url", sa.String(1024), nullable=True),
        sa.Column(
            "type",
            sa.Enum("IMAGE", "VIDEO", name="mediatype"),
            nullable=False,
            server_default="IMAGE",
        ),
        sa.Column(
            "display_order", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_product_media_product_id", "product_media", ["product_id"]
    )

    # ── wishlists ──────────────────────────────────────────────────────────
    op.create_table(
        "wishlists",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("uq_wishlists_user_id", "wishlists", ["user_id"], unique=True)

    # ── wishlist_items ─────────────────────────────────────────────────────
    op.create_table(
        "wishlist_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "wishlist_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("wishlists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("product_variants.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "uq_wishlist_items",
        "wishlist_items",
        ["wishlist_id", "product_variant_id"],
        unique=True,
    )
    op.create_index(
        "ix_wishlist_items_wishlist_id", "wishlist_items", ["wishlist_id"]
    )


def downgrade() -> None:
    # Reverse order
    op.drop_index("ix_wishlist_items_wishlist_id", table_name="wishlist_items")
    op.drop_index("uq_wishlist_items", table_name="wishlist_items")
    op.drop_table("wishlist_items")

    op.drop_index("uq_wishlists_user_id", table_name="wishlists")
    op.drop_table("wishlists")

    op.drop_index("ix_product_media_product_id", table_name="product_media")
    op.drop_table("product_media")

    op.drop_column("product_variants", "is_active")

    op.drop_index("ix_products_is_active", table_name="products")
    op.drop_index("ix_products_search_vector", table_name="products")
    op.drop_column("products", "search_vector")
    op.drop_column("products", "is_active")

    op.drop_column("categories", "is_active")
    op.drop_column("categories", "description")

    op.drop_column("addresses", "line2")

    op.execute("DROP TYPE IF EXISTS mediatype")
