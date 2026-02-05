from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.projects.models import Credential, Project
from app.api.v1.projects.credential_schemas import CredentialCreate, CredentialUpdate
from app.api.v1.projects.service import ProjectService
from app.api.v1.users.models import User


class CredentialService:
    @staticmethod
    def list(db: Session, *, project_id: int, user: User | None = None) -> list[Credential]:
        # Check if user has access to this project
        project = ProjectService.get(db, project_id=project_id, user=user)
        if not project:
            return []
        
        stmt = select(Credential).where(Credential.project_id == project_id).order_by(Credential.id)
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def get(db: Session, *, project_id: int, credential_id: int, user: User | None = None) -> Credential | None:
        # Check if user has access to this project
        project = ProjectService.get(db, project_id=project_id, user=user)
        if not project:
            return None
        
        stmt = select(Credential).where(
            Credential.id == credential_id,
            Credential.project_id == project_id
        )
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def create(db: Session, *, project_id: int, data: CredentialCreate, user: User | None = None) -> Credential:
        # Check if user has access to this project
        project = ProjectService.get(db, project_id=project_id, user=user)
        if not project:
            raise ValueError("Project not found or access denied")
        
        credential = Credential(
            project_id=project_id,
            kind=data.kind,
            secret_ref=data.secret_ref,
            expires_at=data.expires_at,
            metadata_=data.metadata
        )
        db.add(credential)
        db.commit()
        db.refresh(credential)
        return credential

    @staticmethod
    def update(db: Session, *, project_id: int, credential_id: int, data: CredentialUpdate, user: User | None = None) -> Credential:
        # Check if user has access to this project
        credential = CredentialService.get(db, project_id=project_id, credential_id=credential_id, user=user)
        if not credential:
            raise ValueError("Credential not found or access denied")
        
        if data.kind is not None:
            credential.kind = data.kind
        if data.secret_ref is not None:
            credential.secret_ref = data.secret_ref
        if data.expires_at is not None:
            credential.expires_at = data.expires_at
        if data.metadata is not None:
            credential.metadata_ = data.metadata
        
        db.add(credential)
        db.commit()
        db.refresh(credential)
        return credential

    @staticmethod
    def delete(db: Session, *, project_id: int, credential_id: int, user: User | None = None) -> None:
        credential = CredentialService.get(db, project_id=project_id, credential_id=credential_id, user=user)
        if not credential:
            raise ValueError("Credential not found or access denied")
        
        db.delete(credential)
        db.commit()
