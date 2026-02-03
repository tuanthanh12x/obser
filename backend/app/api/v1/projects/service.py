from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.projects.models import Project
from app.api.v1.projects.schemas import ProjectCreate, ProjectUpdate


class ProjectService:
    @staticmethod
    def list(db: Session, *, skip: int = 0, limit: int = 100) -> list[Project]:
        stmt = select(Project).order_by(Project.id).offset(skip).limit(limit)
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def get(db: Session, *, project_id: int) -> Project | None:
        stmt = select(Project).where(Project.id == project_id)
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def get_by_code(db: Session, *, code: str) -> Project | None:
        stmt = select(Project).where(Project.code == code)
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def create(db: Session, *, data: ProjectCreate) -> Project:
        project = Project(code=data.code, display_name=data.display_name, kind=data.kind)
        db.add(project)
        db.commit()
        db.refresh(project)
        return project

    @staticmethod
    def update(db: Session, *, project: Project, data: ProjectUpdate) -> Project:
        if data.code is not None:
            project.code = data.code
        if data.display_name is not None:
            project.display_name = data.display_name
        if data.kind is not None:
            project.kind = data.kind

        db.add(project)
        db.commit()
        db.refresh(project)
        return project

    @staticmethod
    def delete(db: Session, *, project: Project) -> None:
        db.delete(project)
        db.commit()

