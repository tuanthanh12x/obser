from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    display_name: str = Field(min_length=1, max_length=255)
    kind: Optional[str] = Field(default=None, max_length=32)


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=64)
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    kind: Optional[str] = Field(default=None, max_length=32)


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    display_name: str
    kind: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

