"""the ZISUN Journal

Articles a stranger can find on Google, Bing, Pinterest or an AI answer
engine without knowing ZISUN exists: fabric education, fit guides, occasion
guides, care, the founder's stories. Each links the pieces it earns the
right to recommend, and its facts about those pieces come from the pieces
themselves at render time - never from the article's text.

Nothing publishes without a human: status runs draft -> approved -> published,
and only "published" is served.

Revision ID: 0020
Revises: 0019
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "journal_articles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(120), nullable=False, unique=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("dek", sa.String(300), nullable=True),          # one-line standfirst
        sa.Column("kind", sa.String(40), nullable=False),          # style | fabric | occasion | fit | care | founder | collection | explainer
        sa.Column("body_md", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("product_ids", postgresql.JSONB(), nullable=True),   # the pieces it may recommend, in order
        sa.Column("cover_url", sa.String(1000), nullable=True),
        sa.Column("meta_title", sa.String(160), nullable=True),
        sa.Column("meta_description", sa.String(320), nullable=True),
        sa.Column("brief", sa.Text(), nullable=True),               # the editorial brief it was written from
        sa.Column("search_intent", sa.String(200), nullable=True),  # the question it answers
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_journal_status_published", "journal_articles", ["status", "published_at"])


def downgrade() -> None:
    op.drop_index("ix_journal_status_published", table_name="journal_articles")
    op.drop_table("journal_articles")
