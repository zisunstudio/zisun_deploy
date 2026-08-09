"""Phase 4 Content — content_cards, content_tags, content_products, analytics_events

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Enums ──────────────────────────────────────────────────────────────
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE contentstatus AS ENUM ('DRAFT', 'PUBLISHED');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE contenttype AS ENUM ('IMAGE', 'VIDEO');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE tagtype AS ENUM ('occasion', 'season', 'price_band', 'category');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    # ── content_cards ──────────────────────────────────────────────────────
    op.create_table(
        "content_cards",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "type",
            postgresql.ENUM("IMAGE", "VIDEO", name="contenttype", create_type=False),
            nullable=False,
            server_default="IMAGE",
        ),
        sa.Column("media_url", sa.String(512), nullable=False),
        sa.Column("thumbnail_url", sa.String(512), nullable=True),
        sa.Column("caption", sa.String(500), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM("DRAFT", "PUBLISHED", name="contentstatus", create_type=False),
            nullable=False,
            server_default="DRAFT",
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
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
    op.create_index("ix_content_cards_status", "content_cards", ["status"])

    # ── content_tags ───────────────────────────────────────────────────────
    op.create_table(
        "content_tags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "content_card_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("content_cards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tag_name", sa.String(100), nullable=False),
        sa.Column(
            "tag_type",
            postgresql.ENUM(
                "occasion", "season", "price_band", "category",
                name="tagtype",
                create_type=False,
            ),
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
    op.create_index("ix_content_tags_content_card_id", "content_tags", ["content_card_id"])

    # ── content_products ───────────────────────────────────────────────────
    op.create_table(
        "content_products",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "content_card_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("content_cards.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("position_x", sa.Float(), nullable=True),
        sa.Column("position_y", sa.Float(), nullable=True),
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
        "ix_content_products_content_card_id", "content_products", ["content_card_id"]
    )

    # ── analytics_events ───────────────────────────────────────────────────
    op.create_table(
        "analytics_events",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("session_id", sa.String(255), nullable=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "properties",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
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
    op.create_index("ix_analytics_events_event_type", "analytics_events", ["event_type"])
    op.create_index("ix_analytics_events_session_id", "analytics_events", ["session_id"])
    op.create_index("ix_analytics_events_user_id", "analytics_events", ["user_id"])

    # GIN index on analytics_events for fast JSONB property lookups
    op.execute(
        "CREATE INDEX ix_analytics_events_properties_gin "
        "ON analytics_events USING GIN (properties)"
    )

    # ── products: add deleted_at if it doesn't already exist ──────────────
    # (Column was added by the model already; guard with DO block in case
    # the column exists from a previous partial migration.)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'products' AND column_name = 'deleted_at'
            ) THEN
                ALTER TABLE products ADD COLUMN deleted_at TIMESTAMPTZ;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("analytics_events")
    op.drop_table("content_products")
    op.drop_table("content_tags")
    op.drop_table("content_cards")

    op.execute("DROP TYPE IF EXISTS contentstatus")
    op.execute("DROP TYPE IF EXISTS contenttype")
    op.execute("DROP TYPE IF EXISTS tagtype")
