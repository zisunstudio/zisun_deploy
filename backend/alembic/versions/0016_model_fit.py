"""the model's size and height

"Model is wearing size M" is the single most useful sizing line a fashion
product page carries: a customer compares her own height and usual size to
a real person in the photograph, which a measurement chart alone cannot
give her. Two short, optional columns; the page prints the line only when
the size is filled in.

Revision ID: 0016
Revises: 0015
"""
import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("model_size", sa.String(12), nullable=True))
    op.add_column("products", sa.Column("model_height", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "model_height")
    op.drop_column("products", "model_size")
