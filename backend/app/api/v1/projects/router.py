from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user, require_superuser
from app.api.v1.users.models import User
from app.api.v1.projects.schemas import ProjectCreate, ProjectRead, ProjectUpdate
from app.api.v1.projects.service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/", response_model=list[ProjectRead])
def list_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    return ProjectService.list(db, skip=skip, limit=limit)


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    project = ProjectService.get(db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@router.post("/", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
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

