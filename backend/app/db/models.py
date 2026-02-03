"""
Central import module to ensure all SQLAlchemy models are registered.

Import this module once at app startup (or via app.db) so relationship() string
targets can be resolved reliably.
"""

# Users
from app.api.v1.users.models import User, Profile  # noqa: F401

# Projects / credentials
from app.api.v1.projects.models import Project, Environment, Credential, ProjectMember  # noqa: F401

# Services
from app.api.v1.services.models import (  # noqa: F401
    ServiceType,
    ServiceInstance,
    ServiceInstanceCredential,
)

