"""an influencer's link can land on a piece, a category or the home page

`influencers.landing` is a site path (`/product/<id>`, `/category/<slug>`,
`/collections/<slug>`, `/`). When it is empty the link lands on her
collection, as before.

Revision ID: 0032
Revises: 0031
"""
import sqlalchemy as sa
from alembic import op

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("influencers", sa.Column("landing", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("influencers", "landing")
