"""add restaurant settings fields

Revision ID: a6b7c8d9e0f1
Revises: f4a5b6c7d8e9
Create Date: 2026-06-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a6b7c8d9e0f1'
down_revision = 'f4a5b6c7d8e9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('restaurants', sa.Column('city', sa.String(100), nullable=True))
    op.add_column('restaurants', sa.Column('admin_limit', sa.Integer(), server_default='5', nullable=False))
    op.add_column('restaurants', sa.Column('admin_session_policy', sa.String(50), server_default='kick_previous_session', nullable=False))
    op.add_column('restaurants', sa.Column('allow_orders', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('restaurants', sa.Column('allow_waiter_calls', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('restaurants', sa.Column('allow_bill_requests', sa.Boolean(), server_default='true', nullable=False))


def downgrade() -> None:
    op.drop_column('restaurants', 'city')
    op.drop_column('restaurants', 'admin_limit')
    op.drop_column('restaurants', 'admin_session_policy')
    op.drop_column('restaurants', 'allow_orders')
    op.drop_column('restaurants', 'allow_waiter_calls')
    op.drop_column('restaurants', 'allow_bill_requests')
