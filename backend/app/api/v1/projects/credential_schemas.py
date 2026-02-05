from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.api.v1.projects.models import CredentialKind


class CredentialBase(BaseModel):
    kind: CredentialKind
    secret_ref: str = Field(min_length=1)
    expires_at: Optional[datetime] = None
    metadata: Optional[dict] = None


class CredentialCreate(CredentialBase):
    pass


class CredentialUpdate(BaseModel):
    kind: Optional[CredentialKind] = None
    secret_ref: Optional[str] = Field(default=None, min_length=1)
    expires_at: Optional[datetime] = None
    metadata: Optional[dict] = None


class CredentialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    project_id: int
    kind: str
    secret_ref: str
    expires_at: Optional[datetime] = None
    metadata: Optional[dict] = Field(default=None, alias="metadata_")
    created_at: datetime
    updated_at: Optional[datetime] = None
