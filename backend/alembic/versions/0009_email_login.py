"""Allow accounts identified by email as well as phone

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-03

Email/password sign-in creates accounts with no phone number, which the schema
forbade: users.phone was NOT NULL because every account until now arrived by
SMS. Making it nullable is what lets a staff account exist at all.

users.email gains a unique index at the same time. Without it the same address
could be attached to two rows, and the email lookup in
AuthService.login_with_verified_identity would raise on the second sign-in
rather than return a user. Postgres permits any number of NULLs under a unique
index, so phone-only customers are unaffected.
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "phone", existing_type=sa.String(length=15), nullable=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    # Rows with no phone cannot satisfy NOT NULL; they are email-only accounts
    # that only exist because of this migration, so removing them is the honest
    # reversal rather than inventing a placeholder number.
    op.execute("DELETE FROM users WHERE phone IS NULL")
    op.alter_column("users", "phone", existing_type=sa.String(length=15), nullable=False)
