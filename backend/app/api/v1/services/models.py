from __future__ import annotations

from enum import Enum
from typing import Optional

from sqlalchemy import Enum as SAEnum, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class ServiceCredentialUsage(str, Enum):
    default = "default"
    read = "read"
    write = "write"
    admin = "admin"


class ServiceType(BaseModel):


    __tablename__ = "service_types"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    group: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    default_checks: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    service_instances: Mapped[list["ServiceInstance"]] = relationship(
        back_populates="service_type"
    )

    def __repr__(self) -> str:
        return f"<ServiceType id={self.id} code={self.code!r}>"


class ServiceInstance(BaseModel):

    __tablename__ = "service_instances"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_service_instance_project_name"),
    )

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_type_id: Mapped[int] = mapped_column(
        ForeignKey("service_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    environment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("environments.id", ondelete="SET NULL"), nullable=True, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'unknown'"), index=True
    )
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="service_instances")
    service_type: Mapped["ServiceType"] = relationship(back_populates="service_instances")
    environment: Mapped[Optional["Environment"]] = relationship(
        back_populates="service_instances"
    )

    credential_links: Mapped[list["ServiceInstanceCredential"]] = relationship(
        back_populates="service_instance", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ServiceInstance id={self.id} project_id={self.project_id} name={self.name!r}>"


class ServiceInstanceCredential(BaseModel):


    __tablename__ = "service_instance_credentials"
    __table_args__ = (
        UniqueConstraint(
            "service_instance_id",
            "credential_id",
            name="uq_service_instance_credential_pair",
        ),
    )

    service_instance_id: Mapped[int] = mapped_column(
        ForeignKey("service_instances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    credential_id: Mapped[int] = mapped_column(
        ForeignKey("credentials.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    usage: Mapped[ServiceCredentialUsage] = mapped_column(
        SAEnum(ServiceCredentialUsage, name="service_credential_usage"),
        nullable=False,
        server_default=text("'default'"),
        index=True,
    )

    service_instance: Mapped["ServiceInstance"] = relationship(back_populates="credential_links")
    credential: Mapped["Credential"] = relationship(back_populates="service_links")

    def __repr__(self) -> str:
        return (
            "<ServiceInstanceCredential "
            f"id={self.id} service_instance_id={self.service_instance_id} "
            f"credential_id={self.credential_id} usage={self.usage!r}>"
        )

