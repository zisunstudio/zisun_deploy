"""where the subject is in each photograph

`Photo` crops every picture to a fixed ratio and reads the upper third,
which is right for a full-length fashion photograph and wrong for the
occasional one - a flat-lay, a close-up of a sleeve, a shot where she stands
to one side. A centre crop took heads off; a fixed upper-third crop will
still take the wrong part of an unusual picture.

One column, a percentage pair like "50 28", so the founder can tap the
subject once and never think about it again. NULL means the default.

Revision ID: 0022
Revises: 0021
"""
import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("product_media", sa.Column("focus", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("product_media", "focus")
