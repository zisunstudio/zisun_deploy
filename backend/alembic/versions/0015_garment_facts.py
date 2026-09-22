"""the rest of the garment's facts

The founder enters a piece's characteristics when she lists it, but half the
ones she names had nowhere to go: fit, length, embroidery, what the bottom
is, what the set contains, what it is for. Those went in the description if
they went anywhere, which is why the product page could not answer them and
she was answering them by hand on WhatsApp instead.

set_pieces is the one that matters commercially: a co-ord set is two
garments and the page could not say so. It also feeds the Legal Metrology
net quantity, so "1 set (2 pieces)" is derived rather than typed - the field
where a founder once typed "5" and a customer read it as five kurtas.

Revision ID: 0015
Revises: 0014
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

COLUMNS = ("fit", "garment_length", "embroidery", "bottom_type", "occasion")


def upgrade() -> None:
    for name in COLUMNS:
        op.add_column("products", sa.Column(name, sa.String(120), nullable=True))
    # ["Kurta", "Palazzo"] - ordered, because that is the order she would say
    # them in and the order the page prints them.
    op.add_column("products", sa.Column("set_pieces", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "set_pieces")
    for name in reversed(COLUMNS):
        op.drop_column("products", name)
