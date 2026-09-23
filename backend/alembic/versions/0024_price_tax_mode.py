"""whether the founder's price already contains GST

She may think in either. A wholesaler quotes ex-tax; a retail price in India
is always inclusive - Legal Metrology requires the MRP to be inclusive of all
taxes, and the declaration on every product page says so. So an exclusive
price is not a thing to display, it is a thing to convert.

`base_price` keeps its meaning exactly: what the customer is charged, always
tax-inclusive. Checkout, inventory locks and the gateway all read it and none
of them change. What is new is a record of how she typed it, so the console
can show her back what she entered rather than a converted number she never
wrote.

Revision ID: 0024
Revises: 0023
"""
import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Default true: every existing price was entered as inclusive, which is
    # what the site has always said it was. Nothing is re-interpreted.
    op.add_column(
        "products",
        sa.Column("price_includes_tax", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    # What she actually typed, for the form to show back. NULL = same as
    # base_price, which is true for everything entered before this existed.
    op.add_column("products", sa.Column("price_entered", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "price_entered")
    op.drop_column("products", "price_includes_tax")
