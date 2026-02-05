from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ServiceInstanceBase(BaseModel):
    service_type_id: int = Field(gt=0)
    environment_id: Optional[int] = Field(default=None, gt=0)
    name: str = Field(min_length=1, max_length=255)
    endpoint: str = Field(min_length=1)
    port: Optional[int] = Field(default=None, gt=0, le=65535)
    status: str = Field(default="unknown", max_length=32)
    metadata: Optional[dict] = None


class ServiceInstanceCreate(ServiceInstanceBase):
    pass


class ServiceInstanceUpdate(BaseModel):
    service_type_id: Optional[int] = Field(default=None, gt=0)
    environment_id: Optional[int] = Field(default=None, gt=0)
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    endpoint: Optional[str] = Field(default=None, min_length=1)
    port: Optional[int] = Field(default=None, gt=0, le=65535)
    status: Optional[str] = Field(default=None, max_length=32)
    metadata: Optional[dict] = None


class ServiceInstanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    project_id: int
    service_type_id: int
    environment_id: Optional[int] = None
    name: str
    endpoint: str
    port: Optional[int] = None
    status: str
    metadata: Optional[dict] = Field(default=None, alias="metadata_")
    created_at: datetime
    updated_at: Optional[datetime] = None
