"""
Application configuration settings
"""
import os
from typing import Optional


class Settings:
    """Application settings loaded from environment variables"""
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM_HMAC: str = os.getenv("ALGORITHM_HMAC", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    
    # JWT
    JWT_ISSUER: Optional[str] = os.getenv("JWT_ISSUER")
    JWT_AUD: Optional[str] = os.getenv("JWT_AUD")
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/obser_db")
    
    # Project
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Obser API")
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")


# Create settings instance
settings = Settings()
