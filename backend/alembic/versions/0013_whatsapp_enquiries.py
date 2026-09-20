"""WhatsApp enquiries - the sales channel, recorded

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-20

While checkout is closed, every sale starts with a tap on "Order on
WhatsApp". Until now that tap was invisible: the console showed Orders = 0
and the founder could reasonably read it as "nothing is selling". This
table is the ledger of those taps, and the founder's record of what became
of each one.

whatsapp_enquiries
    source          where the tap happened: bag, product, fab, footer,
                    community, sheet
    product_id      SET NULL on delete - the enquiry outlives the listing
    variant_id      SET NULL on delete, same reason
    product_name    a copy, so the row still reads after the product is gone
    size / colour / quantity / total_paise
                    what the customer had in front of them
    items           the whole bag as JSON when the tap came from the bag
    status          new -> replied -> ordered | lost; the founder sets it
    order_amount_paise
                    what was actually paid, entered when marked ordered
    note            hers
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_enquiries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("session_id", sa.String(255), nullable=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_name", sa.String(255), nullable=True),
        sa.Column("size", sa.String(50), nullable=True),
        sa.Column("colour", sa.String(120), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("total_paise", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("order_amount_paise", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
    )
    op.create_index("ix_whatsapp_enquiries_created_at", "whatsapp_enquiries", ["created_at"])
    op.create_index("ix_whatsapp_enquiries_status", "whatsapp_enquiries", ["status"])
    op.create_index("ix_whatsapp_enquiries_product_id", "whatsapp_enquiries", ["product_id"])
    op.create_index("ix_whatsapp_enquiries_session_id", "whatsapp_enquiries", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_enquiries_session_id", table_name="whatsapp_enquiries")
    op.drop_index("ix_whatsapp_enquiries_product_id", table_name="whatsapp_enquiries")
    op.drop_index("ix_whatsapp_enquiries_status", table_name="whatsapp_enquiries")
    op.drop_index("ix_whatsapp_enquiries_created_at", table_name="whatsapp_enquiries")
    op.drop_table("whatsapp_enquiries")
