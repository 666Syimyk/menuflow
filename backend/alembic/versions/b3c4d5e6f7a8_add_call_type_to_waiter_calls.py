"""add_call_type_to_waiter_calls

Revision ID: b3c4d5e6f7a8
Revises: 9ffb74dd10ec
Create Date: 2026-06-23 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = '9ffb74dd10ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    calltype = sa.Enum('waiter', 'admin', name='calltype')
    calltype.create(op.get_bind(), checkfirst=True)

    op.add_column('waiter_calls', sa.Column(
        'call_type',
        sa.Enum('waiter', 'admin', name='calltype'),
        nullable=False,
        server_default='waiter',
    ))
    op.alter_column('waiter_calls', 'table_id', nullable=True)


def downgrade() -> None:
    op.alter_column('waiter_calls', 'table_id', nullable=False)
    op.drop_column('waiter_calls', 'call_type')
    sa.Enum(name='calltype').drop(op.get_bind(), checkfirst=True)
