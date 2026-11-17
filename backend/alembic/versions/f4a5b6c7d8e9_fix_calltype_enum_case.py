"""fix_calltype_enum_case

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-06-24 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL can't rename enum values — must recreate the type.
    # Convert column to text first, then drop+recreate enum with uppercase values.
    op.execute("ALTER TABLE waiter_calls ALTER COLUMN call_type TYPE TEXT USING call_type::TEXT")
    op.execute("DROP TYPE calltype CASCADE")
    op.execute("CREATE TYPE calltype AS ENUM ('WAITER', 'ADMIN')")
    op.execute("UPDATE waiter_calls SET call_type = UPPER(call_type)")
    op.execute("ALTER TABLE waiter_calls ALTER COLUMN call_type TYPE calltype USING call_type::calltype")


def downgrade() -> None:
    op.execute("ALTER TABLE waiter_calls ALTER COLUMN call_type TYPE TEXT USING call_type::TEXT")
    op.execute("DROP TYPE calltype CASCADE")
    op.execute("CREATE TYPE calltype AS ENUM ('waiter', 'admin')")
    op.execute("UPDATE waiter_calls SET call_type = LOWER(call_type)")
    op.execute("ALTER TABLE waiter_calls ALTER COLUMN call_type TYPE calltype USING call_type::calltype")
