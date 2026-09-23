"""a pinned location and an email, so a parcel can be found

Customers type addresses badly and a courier returns the parcel. Two things
help and neither is a form field they have to fill better:

* **Where they actually are.** One tap shares coordinates from the phone.
  It does not replace the written address - a courier drives to the address
  and rings the bell - but when the bell is unanswered a map pin is the
  difference between a delivery and an RTO.
* **An email.** Nothing collected one, so the only way to reach a customer
  was the phone number, and the only proof of an order was a page she had to
  keep open.

Both optional. Neither may ever block a sale.

Revision ID: 0025
Revises: 0024
"""
import sqlalchemy as sa
from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Six decimal places is roughly 10cm, far finer than any phone GPS; the
    # numeric type keeps it exact rather than trusting a float.
    op.add_column("addresses", sa.Column("latitude", sa.Numeric(9, 6), nullable=True))
    op.add_column("addresses", sa.Column("longitude", sa.Numeric(9, 6), nullable=True))
    # Metres of GPS uncertainty the browser reported. A 2km accuracy is a
    # cell-tower fix and worth nothing to a delivery person, so the console
    # can say how much to trust the pin instead of showing it as a fact.
    op.add_column("addresses", sa.Column("location_accuracy_m", sa.Integer(), nullable=True))


def downgrade() -> None:
    for c in ("location_accuracy_m", "longitude", "latitude"):
        op.drop_column("addresses", c)
