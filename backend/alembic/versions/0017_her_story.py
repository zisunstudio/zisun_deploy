"""worn by the founder, and who a piece is named for

worn_by_founder: Sushmita photographs every piece on herself. She is
153 cm - about the height of the average Indian woman (NFHS-5 puts it at
151-153 cm) - so a piece shown on her is a far better fit guide for this
customer than any agency model, and the page should say so plainly.

named_for: each piece carries a woman's name and one line about who she
was. The label's line is "Tales, Antiqued."; this is where the tale goes.

Revision ID: 0017
Revises: 0016
"""
import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("worn_by_founder", sa.Boolean(), nullable=True))
    op.add_column("products", sa.Column("named_for", sa.String(160), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "named_for")
    op.drop_column("products", "worn_by_founder")
