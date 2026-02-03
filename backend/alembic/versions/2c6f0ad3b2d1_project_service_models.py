"""project + services models

Revision ID: 2c6f0ad3b2d1
Revises: 790f93dce920
Create Date: 2026-02-03

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "2c6f0ad3b2d1"
down_revision = "790f93dce920"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IMPORTANT:
    # Postgres ENUM types are "named types". When used in a table definition,
    # SQLAlchemy will attempt to CREATE TYPE during CREATE TABLE with checkfirst=False,
    # which is not idempotent and can fail if the type already exists (e.g. reruns,
    # partial upgrades, or other tables sharing the same enum).
    #
    # To make this migration robust, we create the types explicitly with checkfirst=True
    # and then use create_type=False on the column types to prevent implicit creation.
    credential_kind_ddl = postgresql.ENUM(
        "userpass",
        "api_key",
        "token",
        "oauth2",
        "tls_cert",
        name="credential_kind",
    )
    credential_kind = postgresql.ENUM(
        "userpass",
        "api_key",
        "token",
        "oauth2",
        "tls_cert",
        name="credential_kind",
        create_type=False,
    )

    service_credential_usage_ddl = postgresql.ENUM(
        "default",
        "read",
        "write",
        "admin",
        name="service_credential_usage",
    )
    service_credential_usage = postgresql.ENUM(
        "default",
        "read",
        "write",
        "admin",
        name="service_credential_usage",
        create_type=False,
    )

    bind = op.get_bind()
    credential_kind_ddl.create(bind, checkfirst=True)
    service_credential_usage_ddl.create(bind, checkfirst=True)

    op.create_table(
        "projects",
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_projects_code"), "projects", ["code"], unique=False)
    op.create_index(op.f("ix_projects_id"), "projects", ["id"], unique=False)
    op.create_index(op.f("ix_projects_kind"), "projects", ["kind"], unique=False)

    op.create_table(
        "environments",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "code", name="uq_environment_project_code"),
    )
    op.create_index(
        op.f("ix_environments_code"), "environments", ["code"], unique=False
    )
    op.create_index(op.f("ix_environments_id"), "environments", ["id"], unique=False)
    op.create_index(
        op.f("ix_environments_project_id"),
        "environments",
        ["project_id"],
        unique=False,
    )

    op.create_table(
        "service_types",
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("group", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("default_port", sa.Integer(), nullable=True),
        sa.Column("default_checks", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(
        op.f("ix_service_types_code"), "service_types", ["code"], unique=False
    )
    op.create_index(op.f("ix_service_types_group"), "service_types", ["group"], unique=False)
    op.create_index(op.f("ix_service_types_id"), "service_types", ["id"], unique=False)

    op.create_table(
        "service_instances",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("service_type_id", sa.Integer(), nullable=False),
        sa.Column("environment_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            server_default=sa.text("'unknown'"),
            nullable=False,
        ),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["environment_id"], ["environments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_type_id"], ["service_types.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "name", name="uq_service_instance_project_name"),
    )
    op.create_index(op.f("ix_service_instances_environment_id"), "service_instances", ["environment_id"], unique=False)
    op.create_index(op.f("ix_service_instances_id"), "service_instances", ["id"], unique=False)
    op.create_index(op.f("ix_service_instances_project_id"), "service_instances", ["project_id"], unique=False)
    op.create_index(op.f("ix_service_instances_service_type_id"), "service_instances", ["service_type_id"], unique=False)
    op.create_index(op.f("ix_service_instances_status"), "service_instances", ["status"], unique=False)

    op.create_table(
        "credentials",
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("kind", credential_kind, nullable=False),
        sa.Column("secret_ref", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_credentials_id"), "credentials", ["id"], unique=False)
    op.create_index(op.f("ix_credentials_kind"), "credentials", ["kind"], unique=False)
    op.create_index(op.f("ix_credentials_project_id"), "credentials", ["project_id"], unique=False)

    op.create_table(
        "service_instance_credentials",
        sa.Column("service_instance_id", sa.Integer(), nullable=False),
        sa.Column("credential_id", sa.Integer(), nullable=False),
        sa.Column(
            "usage",
            service_credential_usage,
            server_default=sa.text("'default'"),
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
        sa.ForeignKeyConstraint(["credential_id"], ["credentials.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["service_instance_id"], ["service_instances.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "service_instance_id",
            "credential_id",
            name="uq_service_instance_credential_pair",
        ),
    )
    op.create_index(
        op.f("ix_service_instance_credentials_credential_id"),
        "service_instance_credentials",
        ["credential_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_service_instance_credentials_id"),
        "service_instance_credentials",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_service_instance_credentials_service_instance_id"),
        "service_instance_credentials",
        ["service_instance_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_service_instance_credentials_usage"),
        "service_instance_credentials",
        ["usage"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_service_instance_credentials_usage"), table_name="service_instance_credentials")
    op.drop_index(op.f("ix_service_instance_credentials_service_instance_id"), table_name="service_instance_credentials")
    op.drop_index(op.f("ix_service_instance_credentials_id"), table_name="service_instance_credentials")
    op.drop_index(op.f("ix_service_instance_credentials_credential_id"), table_name="service_instance_credentials")
    op.drop_table("service_instance_credentials")

    op.drop_index(op.f("ix_credentials_project_id"), table_name="credentials")
    op.drop_index(op.f("ix_credentials_kind"), table_name="credentials")
    op.drop_index(op.f("ix_credentials_id"), table_name="credentials")
    op.drop_table("credentials")

    op.drop_index(op.f("ix_service_instances_status"), table_name="service_instances")
    op.drop_index(op.f("ix_service_instances_service_type_id"), table_name="service_instances")
    op.drop_index(op.f("ix_service_instances_project_id"), table_name="service_instances")
    op.drop_index(op.f("ix_service_instances_id"), table_name="service_instances")
    op.drop_index(op.f("ix_service_instances_environment_id"), table_name="service_instances")
    op.drop_table("service_instances")

    op.drop_index(op.f("ix_service_types_id"), table_name="service_types")
    op.drop_index(op.f("ix_service_types_group"), table_name="service_types")
    op.drop_index(op.f("ix_service_types_code"), table_name="service_types")
    op.drop_table("service_types")

    op.drop_index(op.f("ix_environments_project_id"), table_name="environments")
    op.drop_index(op.f("ix_environments_id"), table_name="environments")
    op.drop_index(op.f("ix_environments_code"), table_name="environments")
    op.drop_table("environments")

    op.drop_index(op.f("ix_projects_kind"), table_name="projects")
    op.drop_index(op.f("ix_projects_id"), table_name="projects")
    op.drop_index(op.f("ix_projects_code"), table_name="projects")
    op.drop_table("projects")

    bind = op.get_bind()
    service_credential_usage = postgresql.ENUM(
        "default",
        "read",
        "write",
        "admin",
        name="service_credential_usage",
    )
    credential_kind = postgresql.ENUM(
        "userpass",
        "api_key",
        "token",
        "oauth2",
        "tls_cert",
        name="credential_kind",
    )
    service_credential_usage.drop(bind, checkfirst=True)
    credential_kind.drop(bind, checkfirst=True)

