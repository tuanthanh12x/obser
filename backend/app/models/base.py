"""
Base model with common fields for all database models
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, Integer, func, text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class BaseModel(Base):
    """
    Base model with id, created_at, and updated_at fields
    All models should inherit from this class
    """
    __abstract__ = True

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        onupdate=func.now()
    )
