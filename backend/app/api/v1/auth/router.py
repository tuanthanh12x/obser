"""
Authentication router
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.v1.auth.service import AuthService
from app.api.v1.auth.schemas import (
    Token, 
    UserLogin, 
    UserRegister, 
    TokenRefresh, 
    TokenRefreshResponse
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    TokenError
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):

    user = AuthService.authenticate_user(
        db, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Create both access and refresh tokens
    access_token = create_access_token(user)
    refresh_token = create_refresh_token(user)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/register", response_model=Token)
async def register(
    user_data: UserRegister,
    db: Session = Depends(get_db)
):
    """
    Create new user account
    """
    # Check if user already exists
    existing_user = AuthService.get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    user = AuthService.create_user(db, user_data)
    
    # Create both access and refresh tokens
    access_token = create_access_token(user)
    refresh_token = create_refresh_token(user)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/token/refresh", response_model=TokenRefreshResponse)
async def refresh_token(
    token_data: TokenRefresh,
    db: Session = Depends(get_db)
):
    """
    Refresh access token using refresh token
    """
    try:
        # Decode and validate refresh token
        payload = decode_refresh_token(token_data.refresh_token)
        
        # Check token type
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        # Get user ID from token
        user_id = int(payload.get("sub"))
        
        # Get user from database
        user = AuthService.get_user_by_id(db, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User is inactive"
            )
        
        # Create new access token
        access_token = create_access_token(user)
        
        return {
            "access_token": access_token,
            "token_type": "bearer"
        }
        
    except TokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired refresh token: {str(e)}"
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
