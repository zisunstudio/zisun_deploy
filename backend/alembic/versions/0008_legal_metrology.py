"""Legal Metrology declarations on products

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-22

The Legal Metrology (Packaged Commodities) Rules require an e-commerce listing
to show the packer's name and address, country of origin, generic commodity
name, net quantity, MRP inclusive of taxes and — for apparel specifically —
dimensions, all before the buyer pays.

Every column here is nullable, and deliberately so: the brand-level default in
settings covers all of them except dimensions, so an existing row needs no
backfill to render a complete declaration. A value here overrides the default
for one product, which is what we would need the day we stock something we did
not pack ourselves.
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

COLUMNS = (
    ("commodity_name", sa.String(length=255)),
    ("net_quantity", sa.String(length=120)),
    ("dimensions", sa.String(length=255)),
    ("country_of_origin", sa.String(length=120)),
    ("manufacturer_name", sa.String(length=255)),
    ("manufacturer_address", sa.Text()),
)


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("products", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(COLUMNS):
        op.drop_column("products", name)
