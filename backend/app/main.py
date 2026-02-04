"""
FastAPI main application
"""
import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.db import get_db, Base, engine
from sqlalchemy import text

# Import routers
from app.api.v1.auth.router import router as auth_router
from app.api.v1.projects.router import router as projects_router

app = FastAPI(title="Backend API", version="1.0.0")

@app.on_event("startup")
async def startup():

    pass

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost,http://localhost:80,http://localhost:3000",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "Backend API is running"}


@app.get("/health")
async def health(db: Session = Depends(get_db)):

    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }
