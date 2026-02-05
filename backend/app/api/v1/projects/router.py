from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select

from app.api.deps import get_db, get_current_active_user, require_superuser
from app.api.v1.users.models import User
from app.api.v1.projects.schemas import (
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
    ProjectMemberCreate,
    ProjectMemberRead,
)
from app.api.v1.projects.credential_schemas import (
    CredentialCreate,
    CredentialRead,
    CredentialUpdate,
)
from app.api.v1.projects.service_schemas import (
    ServiceInstanceCreate,
    ServiceInstanceRead,
    ServiceInstanceUpdate,
)
from app.api.v1.projects.service import ProjectService
from app.api.v1.projects.credential_service import CredentialService
from app.api.v1.projects.service_instance_service import ServiceInstanceService
from app.api.v1.projects.models import ProjectMember

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectRead])
def list_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return ProjectService.list(db, skip=skip, limit=limit, user=current_user)


@router.get("/users", response_model=list[dict])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    """List all users for selecting members"""
    stmt = select(User).where(User.is_active == True).order_by(User.email)
    users = list(db.execute(stmt).scalars().all())
    return [{"id": user.id, "email": user.email} for user in users]


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    project = ProjectService.get(db, project_id=project_id, user=current_user)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),  # only admin can add
):
    existing = ProjectService.get_by_code(db, code=data.code)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project code already exists",
        )
    return ProjectService.create(db, data=data)


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    project = ProjectService.get(db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if data.code is not None:
        existing = ProjectService.get_by_code(db, code=data.code)
        if existing and existing.id != project_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Project code already exists",
            )

    return ProjectService.update(db, project=project, data=data)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    project = ProjectService.get(db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    ProjectService.delete(db, project=project)
    return None


@router.get("/{project_id}/members", response_model=list[ProjectMemberRead])
def list_project_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Check if user has access to this project
    project = ProjectService.get(db, project_id=project_id, user=current_user)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    members = ProjectService.list_members(db, project_id=project_id)
    # Convert to dict with user email
    result = []
    for member in members:
        member_dict = {
            "id": member.id,
            "project_id": member.project_id,
            "user_id": member.user_id,
            "role": member.role,
            "created_at": member.created_at,
            "updated_at": member.updated_at,
            "user_email": member.user.email if member.user else None,
        }
        result.append(member_dict)
    return result


@router.post("/{project_id}/members", response_model=ProjectMemberRead, status_code=status.HTTP_201_CREATED)
def add_project_member(
    project_id: int,
    data: ProjectMemberCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    project = ProjectService.get(db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    
    try:
        member = ProjectService.add_member(db, project_id=project_id, data=data)
        # Reload with user relationship
        stmt = (
            select(ProjectMember)
            .where(ProjectMember.id == member.id)
            .options(joinedload(ProjectMember.user))
        )
        member_with_user = db.execute(stmt).unique().scalar_one()
        return {
            "id": member_with_user.id,
            "project_id": member_with_user.project_id,
            "user_id": member_with_user.user_id,
            "role": member_with_user.role,
            "created_at": member_with_user.created_at,
            "updated_at": member_with_user.updated_at,
            "user_email": member_with_user.user.email if member_with_user.user else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_member(
    project_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    project = ProjectService.get(db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    
    try:
        ProjectService.remove_member(db, project_id=project_id, user_id=user_id)
        return None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# Credential endpoints
@router.get("/{project_id}/credentials", response_model=list[CredentialRead])
def list_project_credentials(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    credentials = CredentialService.list(db, project_id=project_id, user=current_user)
    # Convert to dict format for proper serialization
    result = []
    for cred in credentials:
        result.append({
            "id": cred.id,
            "project_id": cred.project_id,
            "kind": cred.kind.value if hasattr(cred.kind, 'value') else str(cred.kind),
            "secret_ref": cred.secret_ref,
            "expires_at": cred.expires_at,
            "metadata": cred.metadata_,
            "created_at": cred.created_at,
            "updated_at": cred.updated_at,
        })
    return result


@router.post("/{project_id}/credentials", response_model=CredentialRead, status_code=status.HTTP_201_CREATED)
def create_project_credential(
    project_id: int,
    data: CredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        credential = CredentialService.create(db, project_id=project_id, data=data, user=current_user)
        return {
            "id": credential.id,
            "project_id": credential.project_id,
            "kind": credential.kind.value if hasattr(credential.kind, 'value') else str(credential.kind),
            "secret_ref": credential.secret_ref,
            "expires_at": credential.expires_at,
            "metadata": credential.metadata_,
            "created_at": credential.created_at,
            "updated_at": credential.updated_at,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{project_id}/credentials/{credential_id}", response_model=CredentialRead)
def get_project_credential(
    project_id: int,
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    credential = CredentialService.get(db, project_id=project_id, credential_id=credential_id, user=current_user)
    if not credential:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")
    return {
        "id": credential.id,
        "project_id": credential.project_id,
        "kind": credential.kind.value if hasattr(credential.kind, 'value') else str(credential.kind),
        "secret_ref": credential.secret_ref,
        "expires_at": credential.expires_at,
        "metadata": credential.metadata_,
        "created_at": credential.created_at,
        "updated_at": credential.updated_at,
    }


@router.patch("/{project_id}/credentials/{credential_id}", response_model=CredentialRead)
def update_project_credential(
    project_id: int,
    credential_id: int,
    data: CredentialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        credential = CredentialService.update(db, project_id=project_id, credential_id=credential_id, data=data, user=current_user)
        return {
            "id": credential.id,
            "project_id": credential.project_id,
            "kind": credential.kind.value if hasattr(credential.kind, 'value') else str(credential.kind),
            "secret_ref": credential.secret_ref,
            "expires_at": credential.expires_at,
            "metadata": credential.metadata_,
            "created_at": credential.created_at,
            "updated_at": credential.updated_at,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{project_id}/credentials/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_credential(
    project_id: int,
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        CredentialService.delete(db, project_id=project_id, credential_id=credential_id, user=current_user)
        return None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# Service Instance endpoints
@router.get("/{project_id}/services", response_model=list[ServiceInstanceRead])
def list_project_services(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    services = ServiceInstanceService.list(db, project_id=project_id, user=current_user)
    return services


@router.post("/{project_id}/services", response_model=ServiceInstanceRead, status_code=status.HTTP_201_CREATED)
def create_project_service(
    project_id: int,
    data: ServiceInstanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        service = ServiceInstanceService.create(db, project_id=project_id, data=data, user=current_user)
        return service
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{project_id}/services/{service_id}", response_model=ServiceInstanceRead)
def get_project_service(
    project_id: int,
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = ServiceInstanceService.get(db, project_id=project_id, service_id=service_id, user=current_user)
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service instance not found")
    return service


@router.patch("/{project_id}/services/{service_id}", response_model=ServiceInstanceRead)
def update_project_service(
    project_id: int,
    service_id: int,
    data: ServiceInstanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        service = ServiceInstanceService.update(db, project_id=project_id, service_id=service_id, data=data, user=current_user)
        return service
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{project_id}/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_service(
    project_id: int,
    service_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    try:
        ServiceInstanceService.delete(db, project_id=project_id, service_id=service_id, user=current_user)
        return None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

