"""Sprint 1 — COD, coupons, reviews, ML infrastructure

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New ENUM types ─────────────────────────────────────────────────────
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE paymentmethod AS ENUM ('RAZORPAY', 'COD');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE coupontype AS ENUM ('FLAT', 'PERCENT');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE reviewstatus AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # ── coupons ────────────────────────────────────────────────────────────
    op.create_table(
        "coupons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("type", postgresql.ENUM("FLAT", "PERCENT", name="coupontype", create_type=False),
                  nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("min_order_value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_discount", sa.Integer(), nullable=True),
        sa.Column("usage_limit", sa.Integer(), nullable=True),
        sa.Column("per_user_limit", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_referral", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_coupons_code", "coupons", ["code"])
    op.create_index("ix_coupons_is_active", "coupons", ["is_active"])

    # ── orders: add payment_method + COD + coupon columns ─────────────────
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'payment_method'
            ) THEN
                ALTER TABLE orders
                    ADD COLUMN payment_method paymentmethod NOT NULL DEFAULT 'RAZORPAY',
                    ADD COLUMN cod_amount_due INTEGER,
                    ADD COLUMN coupon_id UUID REFERENCES coupons(id),
                    ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;
            END IF;
        END
        $$;
        """
    )

    # ── coupon_usages ──────────────────────────────────────────────────────
    op.create_table(
        "coupon_usages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("coupon_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("coupons.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_coupon_usages_coupon_id", "coupon_usages", ["coupon_id"])
    op.create_index("ix_coupon_usages_user_id", "coupon_usages", ["user_id"])
    op.create_index("ix_coupon_usages_order_id", "coupon_usages", ["order_id"])

    # ── reviews ────────────────────────────────────────────────────────────
    op.create_table(
        "reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("products.id"), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("is_verified_purchase", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("media_urls", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status",
                  postgresql.ENUM("PENDING", "APPROVED", "REJECTED", name="reviewstatus", create_type=False),
                  nullable=False, server_default="PENDING"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating"),
    )
    op.create_index("ix_reviews_product_id", "reviews", ["product_id"])
    op.create_index("ix_reviews_user_id", "reviews", ["user_id"])
    op.create_index("ix_reviews_order_id", "reviews", ["order_id"])
    op.create_index("ix_reviews_status", "reviews", ["status"])
    # Unique: one review per user per product per order
    op.create_index(
        "uq_reviews_user_product_order",
        "reviews",
        ["user_id", "product_id", "order_id"],
        unique=True,
    )

    # ── products: add rating columns ───────────────────────────────────────
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'products' AND column_name = 'avg_rating'
            ) THEN
                ALTER TABLE products
                    ADD COLUMN avg_rating FLOAT NOT NULL DEFAULT 0.0,
                    ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;
            END IF;
        END
        $$;
        """
    )

    # ── product_embeddings (JSONB; upgraded to vector in Sprint 2) ─────────
    op.create_table(
        "product_embeddings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("product_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("products.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        sa.Column("text_embedding", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("image_embedding", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("model_version", sa.String(100), nullable=False, server_default="v1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_product_embeddings_product_id", "product_embeddings", ["product_id"])

    # ── search_queries ─────────────────────────────────────────────────────
    op.create_table(
        "search_queries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("query_text", sa.String(500), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("clicked_product_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("session_id", sa.String(255), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
    )
    op.create_index("ix_search_queries_query_text", "search_queries", ["query_text"])
    op.create_index("ix_search_queries_session_id", "search_queries", ["session_id"])


def downgrade() -> None:
    op.drop_table("search_queries")
    op.drop_table("product_embeddings")
    op.drop_table("reviews")
    op.drop_table("coupon_usages")

    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS discount_amount")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS coupon_id")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS cod_amount_due")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS payment_method")

    op.drop_table("coupons")

    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS review_count")
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS avg_rating")

    op.execute("DROP TYPE IF EXISTS reviewstatus")
    op.execute("DROP TYPE IF EXISTS coupontype")
    op.execute("DROP TYPE IF EXISTS paymentmethod")
