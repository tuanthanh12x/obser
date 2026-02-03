from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Union
from uuid import uuid4

from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError, JWTClaimsError
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


class TokenError(Exception):
    pass


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _create_token(
    *,
    subject: Union[str, int],
    expires_delta: int,  # minutes
    token_type: str,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    now = _now_utc()
    exp_time = now + timedelta(minutes=expires_delta)
    claims: Dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(exp_time.timestamp()),
    }

    iss = getattr(settings, "JWT_ISSUER", None)
    aud = getattr(settings, "JWT_AUD", None)
    if iss:
        claims["iss"] = iss
    if aud:
        claims["aud"] = aud
    if extra:
        claims.update(extra)

    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM_HMAC)


def create_access_token(user) -> str:
    return _create_token(
        subject=user.id,
        expires_delta=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        token_type="access",
        extra={"is_superuser": bool(getattr(user, "is_superuser", False))},
    )


def create_refresh_token(user) -> str:
    # convert days → minutes
    return _create_token(
        subject=user.id,
        expires_delta=1440,
        token_type="refresh",
    )


def create_impersonation_access_token(
    *, target_user, admin_user_id: int, minutes: int = 60, imp_sid: str | None = None
) -> tuple[str, str]:
    """
    Create impersonation access token.

    Returns:
        Tuple of (token, imp_sid)
    """
    if imp_sid is None:
        imp_sid = uuid4().hex
    token = _create_token(
        subject=target_user.id,
        expires_delta=minutes,
        token_type="access",
        extra={
            "imp": True,
            "imp_by": int(admin_user_id),
            "is_superuser": bool(getattr(target_user, "is_superuser", False)),
            "imp_sid": imp_sid,
        },
    )
    return token, imp_sid


def create_impersonation_refresh_token(
    *, target_user, admin_user_id: int, minutes: int = 60, imp_sid: str | None = None
) -> tuple[str, str]:
    """
    Create impersonation refresh token.

    Returns:
        Tuple of (token, imp_sid)
    """
    if imp_sid is None:
        imp_sid = uuid4().hex
    token = _create_token(
        subject=target_user.id,
        expires_delta=minutes,
        token_type="refresh",
        extra={
            "imp": True,
            "imp_by": int(admin_user_id),
            "imp_sid": imp_sid,
        },
    )
    return token, imp_sid


def _decode_token(token: str, *, expect_type: Optional[str] = None) -> Dict[str, Any]:
    try:
        verify_aud = bool(getattr(settings, "JWT_AUD", None))
        options = {"verify_aud": verify_aud}
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM_HMAC],
            options=options,
            issuer=getattr(settings, "JWT_ISSUER", None) or None,
            audience=getattr(settings, "JWT_AUD", None) or None,
        )
        if expect_type and payload.get("type") != expect_type:
            raise TokenError("Invalid token type")
        return payload
    except ExpiredSignatureError:
        raise TokenError("Token expired")
    except JWTClaimsError as e:
        raise TokenError(f"Invalid claims: {e}")
    except JWTError:
        raise TokenError("Signature verification failed")


def decode_access_token(token: str) -> Dict[str, Any]:
    return _decode_token(token, expect_type="access")


def decode_refresh_token(token: str) -> Dict[str, Any]:
    return _decode_token(token, expect_type="refresh")
