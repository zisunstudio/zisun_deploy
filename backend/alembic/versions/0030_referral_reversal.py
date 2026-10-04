"""a referral reward can be reversed, and says why

An order that comes back after its reward was earned must take the reward
with it. `reason` records why a reward is void or reversed; `reversed_at`
when. No data changes: existing rows keep their status.

Revision ID: 0030
Revises: 0029
"""
import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("referral_rewards", sa.Column("reason", sa.String(120), nullable=True))
    op.add_column("referral_rewards", sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("referral_rewards", "reversed_at")
    op.drop_column("referral_rewards", "reason")
