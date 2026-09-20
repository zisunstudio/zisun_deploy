"""Garment attributes on products

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-20

The seven questions the founder is answering by hand in the WhatsApp group
every day: colour, print, pattern, neck, sleeve type, whether the sleeve is
attached, and whether a dupatta is included. A customer asks these before
buying ethnic wear and the product page could not answer any of them.

`colour` sits alongside the variant's existing colour rather than replacing
it. The variant colour is the one being ordered; this is the garment's
described colour ("Indigo with off-white border"), which is what a listing
photograph needs explaining.

Nullable with no defaults, for the same reason as 0010: these are facts about
one garment, and a fallback would be a claim nobody checked printed on a live
page. The panel omits what nobody filled in.

`sleeve_attached` and `dupatta_included` are tri-state like `has_pockets` —
yes, no, and "not checked yet" are three different answers, and only the first
two should ever be shown.
"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

COLUMNS = (
    ("colour", sa.String(length=120)),
    ("print_type", sa.String(length=120)),
    ("pattern", sa.String(length=120)),
    ("neck_type", sa.String(length=120)),
    ("sleeve_type", sa.String(length=120)),
    ("sleeve_attached", sa.Boolean()),
    ("dupatta_included", sa.Boolean()),
)


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("products", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(COLUMNS):
        op.drop_column("products", name)
