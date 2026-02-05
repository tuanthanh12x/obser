from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.services.models import ServiceInstance, ServiceType
from app.api.v1.projects.service_schemas import ServiceInstanceCreate, ServiceInstanceUpdate
from app.api.v1.projects.service import ProjectService
from app.api.v1.users.models import User


class ServiceInstanceService:
    @staticmethod
    def list(db: Session, *, project_id: int, user: User | None = None) -> list[ServiceInstance]:
        # Check if user has access to this project
        project = ProjectService.get(db, project_id=project_id, user=user)
        if not project:
            return []
        
        stmt = (
            select(ServiceInstance)
            .where(ServiceInstance.project_id == project_id)
            .order_by(ServiceInstance.id)
        )
        return list(db.execute(stmt).scalars().all())

    @staticmethod
    def get(db: Session, *, project_id: int, service_id: int, user: User | None = None) -> ServiceInstance | None:
        # Check if user has access to this project
        project = ProjectService.get(db, project_id=project_id, user=user)
        if not project:
            return None
        
        stmt = select(ServiceInstance).where(
            ServiceInstance.id == service_id,
            ServiceInstance.project_id == project_id
        )
        return db.execute(stmt).scalar_one_or_none()

    @staticmethod
    def create(db: Session, *, project_id: int, data: ServiceInstanceCreate, user: User | None = None) -> ServiceInstance:
        # Check if user has access to this project
        project = ProjectService.get(db, project_id=project_id, user=user)
        if not project:
            raise ValueError("Project not found or access denied")
        
        # Check if service type exists
        stmt = select(ServiceType).where(ServiceType.id == data.service_type_id)
        service_type = db.execute(stmt).scalar_one_or_none()
        if not service_type:
            raise ValueError("Service type not found")
        
        # Check if name is unique within project
        existing = db.execute(
            select(ServiceInstance).where(
                ServiceInstance.project_id == project_id,
                ServiceInstance.name == data.name
            )
        ).scalar_one_or_none()
        if existing:
            raise ValueError("Service instance with this name already exists in the project")
        
        service_instance = ServiceInstance(
            project_id=project_id,
            service_type_id=data.service_type_id,
            environment_id=data.environment_id,
            name=data.name,
            endpoint=data.endpoint,
            port=data.port,
            status=data.status,
            metadata_=data.metadata
        )
        db.add(service_instance)
        db.commit()
        db.refresh(service_instance)
        return service_instance

    @staticmethod
    def update(db: Session, *, project_id: int, service_id: int, data: ServiceInstanceUpdate, user: User | None = None) -> ServiceInstance:
        # Check if user has access to this project
        service_instance = ServiceInstanceService.get(db, project_id=project_id, service_id=service_id, user=user)
        if not service_instance:
            raise ValueError("Service instance not found or access denied")
        
        if data.service_type_id is not None:
            # Check if service type exists
            stmt = select(ServiceType).where(ServiceType.id == data.service_type_id)
            service_type = db.execute(stmt).scalar_one_or_none()
            if not service_type:
                raise ValueError("Service type not found")
            service_instance.service_type_id = data.service_type_id
        
        if data.environment_id is not None:
            service_instance.environment_id = data.environment_id
        if data.name is not None:
            # Check if name is unique within project
            existing = db.execute(
                select(ServiceInstance).where(
                    ServiceInstance.project_id == project_id,
                    ServiceInstance.name == data.name,
                    ServiceInstance.id != service_id
                )
            ).scalar_one_or_none()
            if existing:
                raise ValueError("Service instance with this name already exists in the project")
            service_instance.name = data.name
        if data.endpoint is not None:
            service_instance.endpoint = data.endpoint
        if data.port is not None:
            service_instance.port = data.port
        if data.status is not None:
            service_instance.status = data.status
        if data.metadata is not None:
            service_instance.metadata_ = data.metadata
        
        db.add(service_instance)
        db.commit()
        db.refresh(service_instance)
        return service_instance

    @staticmethod
    def delete(db: Session, *, project_id: int, service_id: int, user: User | None = None) -> None:
        service_instance = ServiceInstanceService.get(db, project_id=project_id, service_id=service_id, user=user)
        if not service_instance:
            raise ValueError("Service instance not found or access denied")
        
        db.delete(service_instance)
        db.commit()
