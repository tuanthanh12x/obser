"""
FastAPI main application
"""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.database import get_db, Base, engine
import os

app = FastAPI(title="Backend API", version="1.0.0")

# Create database tables
@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)

# CORS configuration - Allow frontend on port 80
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost,http://localhost:80,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Backend API is running"}


@app.get("/health")
async def health(db: Session = Depends(get_db)):
    """
    Health check endpoint with database connection test
    """
    try:
        # Test database connection
        from sqlalchemy import text
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
