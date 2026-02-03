from __future__ import annotations
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, text, func, Text, ForeignKey
from sqlalchemy.ext.associationproxy import association_proxy
from app.models.base import BaseModel
import datetime
from typing import Optional



class User(BaseModel):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    date_joined: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=(func.now())
    )
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    profile: Mapped[Optional["Profile"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    project_memberships: Mapped[list["ProjectMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    projects = association_proxy("project_memberships", "project")
    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"




class Profile(BaseModel):
    __tablename__ = "profiles"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    two_factor_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    totp_secret: Mapped[Optional[str]] = mapped_column(String(32))
    user: Mapped["User"] = relationship(back_populates="profile")

    def __repr__(self) -> str:
        return f"<Profile user_id={self.user_id} phone={self.phone_number!r}>"