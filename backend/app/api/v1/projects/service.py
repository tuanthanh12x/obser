from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.v1.projects.models import Project, ProjectMember
from app.api.v1.projects.schemas import ProjectCreate, ProjectUpdate, ProjectMemberCreate
from app.api.v1.users.models import User


class ProjectService:
    @staticmethod
    def list(db: Session, *, skip: int = 0, limit: int = 100, user: User | None = None) -> list[Project]:
        if user and user.is_superuser:
            # Admin can see all projects
            stmt = select(Project).order_by(Project.id).offset(skip).limit(limit)
        elif user:
            # Regular users can only see projects they are members of
            stmt = (
                select(Project)
                .join(ProjectMember, Project.id == ProjectMember.project_id)
                .where(ProjectMember.user_id == user.id)
                .order_by(Project.id)
                .offset(skip)
                .limit(limit)
            )
        else:
            # No user, return empty
            return []
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def get(db: Session, *, project_id: int, user: User | None = None) -> Project | None:
        stmt = select(Project).where(Project.id == project_id)
        project = db.execute(stmt).scalar_one_or_none()
        
        if not project:
            return None
        
        # If user is admin, allow access
        if user and user.is_superuser:
            return project
        
        # If user is provided, check if they are a member
        if user:
            member = ProjectService.get_member(db, project_id=project_id, user_id=user.id)
            if member:
                return project
            return None
        
        # No user provided, deny access
        return None

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

    @staticmethod
    def list_members(db: Session, *, project_id: int) -> list[ProjectMember]:
        stmt = (
            select(ProjectMember)
            .where(ProjectMember.project_id == project_id)
            .options(joinedload(ProjectMember.user))
            .order_by(ProjectMember.id)
        )
        return list(db.execute(stmt).unique().scalars().all())

    @staticmethod
    def get_member(db: Session, *, project_id: int, user_id: int) -> ProjectMember | None:
        stmt = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        )
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def add_member(db: Session, *, project_id: int, data: ProjectMemberCreate) -> ProjectMember:
        # Check if project exists
        project = ProjectService.get(db, project_id=project_id)
        if not project:
            raise ValueError("Project not found")

        # Check if user exists
        stmt = select(User).where(User.id == data.user_id)
        user = db.execute(stmt).scalar_one_or_none()
        if not user:
            raise ValueError("User not found")

        # Check if member already exists
        existing = ProjectService.get_member(db, project_id=project_id, user_id=data.user_id)
        if existing:
            raise ValueError("User is already a member of this project")

        # Create new member
        member = ProjectMember(
            project_id=project_id,
            user_id=data.user_id,
            role=data.role
        )
        db.add(member)
        db.commit()
        db.refresh(member)
        return member

    @staticmethod
    def remove_member(db: Session, *, project_id: int, user_id: int) -> None:
        member = ProjectService.get_member(db, project_id=project_id, user_id=user_id)
        if not member:
            raise ValueError("Member not found")
        db.delete(member)
        db.commit()

    @staticmethod
    def update_member_role(db: Session, *, project_id: int, user_id: int, role: str) -> ProjectMember:
        member = ProjectService.get_member(db, project_id=project_id, user_id=user_id)
        if not member:
            raise ValueError("Member not found")
        member.role = role
        db.add(member)
        db.commit()
        db.refresh(member)
        return member

