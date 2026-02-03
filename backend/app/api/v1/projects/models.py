from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.associationproxy import association_proxy

from app.models.base import BaseModel



class ProjectMember(BaseModel):


    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member_project_user"),
    )

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # recommended values: owner|admin|member|viewer
    role: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'member'"), index=True
    )

    project: Mapped["Project"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="project_memberships")

    def __repr__(self) -> str:
        return (
            f"<ProjectMember id={self.id} project_id={self.project_id} "
            f"user_id={self.user_id} role={self.role!r}>"
        )


class Project(BaseModel):

    __tablename__ = "projects"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    kind: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)

    environments: Mapped[list["Environment"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    memberships: Mapped[list["ProjectMember"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    users = association_proxy("memberships", "user")
    service_instances: Mapped[list["ServiceInstance"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    credentials: Mapped[list["Credential"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Project id={self.id} code={self.code!r}>"


class Environment(BaseModel):


    __tablename__ = "environments"
    __table_args__ = (UniqueConstraint("project_id", "code", name="uq_environment_project_code"),)

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="environments")
    service_instances: Mapped[list["ServiceInstance"]] = relationship(
        back_populates="environment"
    )

    def __repr__(self) -> str:
        return f"<Environment id={self.id} project_id={self.project_id} code={self.code!r}>"


class CredentialKind(str, Enum):
    userpass = "userpass"
    api_key = "api_key"
    token = "token"
    oauth2 = "oauth2"
    tls_cert = "tls_cert"


class Credential(BaseModel):

    __tablename__ = "credentials"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[CredentialKind] = mapped_column(
        String(32), nullable=False, index=True
    )
    secret_ref: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSONB, nullable=True
    )

    project: Mapped["Project"] = relationship(back_populates="credentials")
    service_links: Mapped[list["ServiceInstanceCredential"]] = relationship(
        back_populates="credential", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Credential id={self.id} project_id={self.project_id} kind={self.kind!r}>"

