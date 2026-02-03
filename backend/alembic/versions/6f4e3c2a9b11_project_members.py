"""project members mapping

Revision ID: 6f4e3c2a9b11
Revises: 2c6f0ad3b2d1
Create Date: 2026-02-03

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6f4e3c2a9b11"
down_revision = "2c6f0ad3b2d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_members",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.String(length=32),
            server_default=sa.text("'member'"),
            nullable=False,
        ),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id", "user_id", name="uq_project_member_project_user"
        ),
    )
    op.create_index(
        op.f("ix_project_members_id"), "project_members", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_project_members_project_id"),
        "project_members",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_project_members_role"),
        "project_members",
        ["role"],
        unique=False,
    )
    op.create_index(
        op.f("ix_project_members_user_id"),
        "project_members",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_project_members_user_id"), table_name="project_members")
    op.drop_index(op.f("ix_project_members_role"), table_name="project_members")
    op.drop_index(op.f("ix_project_members_project_id"), table_name="project_members")
    op.drop_index(op.f("ix_project_members_id"), table_name="project_members")
    op.drop_table("project_members")

