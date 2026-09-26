"""what the courier said: shipment, AWB, pickup date, label, and why not

Marking an order PACKED created an order in Shiprocket and stopped there. It
never assigned a courier, never asked for a pickup, and wrote nothing back
unless an AWB happened to come with the first reply - which it does not. So
an order could be packed and sit on the table with nobody coming for it, and
the console could not say when anyone would, or that no one had been asked.

These columns keep each step's answer, so the console can say "picked up by
Delhivery on Tue 29 Sep, label here" - or exactly which step failed and why.

Revision ID: 0026
Revises: 0025
"""
import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Shiprocket's own shipment id. Every later call (AWB, pickup, label)
    # takes it, so without it a failed step could only be retried by creating
    # a second order in Shiprocket.
    op.add_column("fulfillments", sa.Column("shipment_id", sa.String(50), nullable=True))
    # The courier Shiprocket assigned (Delhivery, Xpressbees...), as opposed
    # to `carrier`, which is the aggregator we booked through.
    op.add_column("fulfillments", sa.Column("courier_name", sa.String(100), nullable=True))
    op.add_column("fulfillments", sa.Column("pickup_scheduled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("fulfillments", sa.Column("pickup_token", sa.String(100), nullable=True))
    op.add_column("fulfillments", sa.Column("label_url", sa.String(500), nullable=True))
    # What went wrong on the last attempt, in the courier's words. Cleared
    # when a booking completes. Before this, every failure was `except: pass`.
    op.add_column("fulfillments", sa.Column("last_error", sa.String(500), nullable=True))


def downgrade() -> None:
    for c in ("last_error", "label_url", "pickup_token", "pickup_scheduled_at", "courier_name", "shipment_id"):
        op.drop_column("fulfillments", c)
