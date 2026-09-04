"""Fabric and care specifications on products

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-04

Twenty-six survey responses put "doubt about quality" first among the reasons
people will not buy from a small brand (12 of 26), and named what they actually
distrust: colour bleeding (9), missing pockets (7), creasing and heat (5 each).
The product page had nothing to answer any of that with.

Every column is nullable and none has a brand-level default, deliberately.
These are measured facts about one garment — a fallback would be a claim nobody
checked, printed on a live product page as though it had been.
"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

COLUMNS = (
    ("fabric_composition", sa.String(length=255)),
    ("fabric_gsm", sa.Integer()),
    ("weave", sa.String(length=120)),
    ("has_pockets", sa.Boolean()),
    ("colourfastness", sa.String(length=255)),
    ("wash_care", sa.String(length=255)),
)


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("products", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(COLUMNS):
        op.drop_column("products", name)
