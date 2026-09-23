"""the tax invoice

ZISUN is GST-registered (29BAYPT2026A1ZH, Karnataka), so every sale needs a
tax invoice showing the taxable value, the split and the place of supply.
Nothing computed any of it: an order stored one total and the site said
"inclusive of all taxes" without ever working out what was inside.

The breakdown is SNAPSHOTTED onto the order rather than recomputed on
demand. Rates and thresholds change by notification, and an invoice issued
last year must still print last year's numbers - recomputing would quietly
rewrite history the first time a slab moved.

The invoice NUMBER is assigned when the order becomes real (prepaid paid, or
COD confirmed), not when the row is created: an abandoned checkout must not
burn a serial number, because the series is meant to be consecutive.

Revision ID: 0023
Revises: 0022
"""
import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Per-order snapshot. Nullable: orders placed before this existed have no
    # breakdown and must read as "not recorded" rather than as zero tax.
    op.add_column("orders", sa.Column("invoice_number", sa.String(32), nullable=True, unique=True))
    op.add_column("orders", sa.Column("invoiced_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("place_of_supply", sa.String(2), nullable=True))
    op.add_column("orders", sa.Column("taxable_amount", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("cgst_amount", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("sgst_amount", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("igst_amount", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("tax_breakdown", sa.JSON(), nullable=True))

    # HSN per piece. Nullable = fall back to the apparel default in gst.py.
    op.add_column("products", sa.Column("hsn_code", sa.String(12), nullable=True))

    # One row per financial year, locked while a number is taken.
    op.create_table(
        "invoice_counters",
        sa.Column("financial_year", sa.String(8), primary_key=True),   # "25-26"
        sa.Column("last_number", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("invoice_counters")
    op.drop_column("products", "hsn_code")
    for c in ("tax_breakdown", "igst_amount", "sgst_amount", "cgst_amount",
              "taxable_amount", "place_of_supply", "invoiced_at", "invoice_number"):
        op.drop_column("orders", c)
