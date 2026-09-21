"""styling notes

products.styling_notes — JSONB, a short list of {"occasion", "note"}: how the
founder would wear this piece to the office, to lunch, to a function. Drafted
by Claude in the console from the facts already on the form, edited by her,
and served to the storefront as plain stored text.

Stored, not generated on read, on purpose: Claude runs only behind the admin
role, so the Anthropic bill stays bounded by the founder's own use and a
product page never waits on, or fails with, a model call.

Revision ID: 0014
Revises: 0013
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("styling_notes", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "styling_notes")
