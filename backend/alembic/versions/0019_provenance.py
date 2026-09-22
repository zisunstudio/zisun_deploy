"""where a piece comes from, and how it was made

The home page claimed handloom cotton from Mangalgiri, Ilkal and Kasavu,
woven by hand and never re-run - over a catalogue of one silk piece and
one dabu-print cotton from Rajasthan, neither of which recorded any of it.
From now on the site's brand claims are computed from these columns: it
says "handloom" only when pieces are recorded as handloom, names a region
only when pieces come from it, and says nothing otherwise. Every column is
nullable, and null means "not stated", which produces no claim.

Revision ID: 0019
Revises: 0018
"""
import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("craft", sa.String(120), nullable=True))          # "Handloom", "Powerloom", "Hand block print (dabu)"
    op.add_column("products", sa.Column("origin", sa.String(120), nullable=True))         # "Mangalgiri, Andhra Pradesh"
    op.add_column("products", sa.Column("lining", sa.String(60), nullable=True))          # "Lined", "Unlined", "Lined bodice"
    op.add_column("products", sa.Column("transparency", sa.String(40), nullable=True))    # "Opaque", "Slightly sheer", "Sheer"
    op.add_column("products", sa.Column("batch_size", sa.Integer(), nullable=True))       # pieces made in this run
    op.add_column("products", sa.Column("will_rerun", sa.Boolean(), nullable=True))       # null = not decided


def downgrade() -> None:
    for c in ("will_rerun", "batch_size", "transparency", "lining", "origin", "craft"):
        op.drop_column("products", c)
