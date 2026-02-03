"""
Authentication service
"""
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.api.v1.users.models import User
from app.api.v1.auth.schemas import UserRegister
from app.core.security import verify_password, get_password_hash


class AuthService:
    @staticmethod
    def authenticate_user(db: Session, email: str, password: str) -> User | None:
        """
        Authenticate user by email and password
        """
        user = AuthService.get_user_by_email(db, email)
        if not user:
            return None
        
        if not verify_password(password, user.hashed_password):
            return None
        
        if not user.is_active:
            return None
        
        return user
    
    @staticmethod
    def get_user_by_email(db: Session, email: str) -> User | None:
        """
        Get user by email
        """
        stmt = select(User).where(User.email == email)
        result = db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    def get_user_by_id(db: Session, user_id: int) -> User | None:
        """
        Get user by ID
        """
        stmt = select(User).where(User.id == user_id)
        result = db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    def create_user(db: Session, user_data: UserRegister) -> User:
        """
        Create new user
        """
        hashed_password = get_password_hash(user_data.password)
        user = User(
            email=user_data.email,
            hashed_password=hashed_password,
            is_active=True,
            is_superuser=False,
            date_joined=datetime.utcnow()
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
