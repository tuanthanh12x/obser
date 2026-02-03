from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from jose import JWTError
from app.core.security import decode_access_token
from crud.user import crud_user
from db.session import SessionLocal
from logger import logger
from services.token_blacklist import is_blacklisted
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from starlette.responses import Response



class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        request.state.user = None

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return await call_next(request)

        token = auth_header.split(" ", 1)[1]

        if await is_blacklisted(token):
            logger.warning("[AUTH] Blacklisted token used")
            return await call_next(request)

        try:
            payload = decode_access_token(token)
            user_id: int | None = payload.get("sub")
            if not user_id:
                return await call_next(request)

            db = SessionLocal()
            try:
                user = crud_user.get(db, id=user_id)
                # Only set user if exists and is active
                if user and getattr(user, "is_active", True):
                    request.state.user = user
                else:
                    request.state.user = None
            finally:
                db.close()

        except JWTError as e:
            logger.warning(f"[AUTH] Invalid token: {e}")
        except Exception as e:
            logger.error(f"[AUTH] Unexpected error: {e}")

        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        csp_policy = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' https:; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )

        response.headers["Content-Security-Policy"] = csp_policy
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response
