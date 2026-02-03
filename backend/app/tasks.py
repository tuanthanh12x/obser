"""
Celery tasks
"""
from app.celery import celery_app


@celery_app.task(name="app.tasks.example_task")
def example_task(message: str):
    """
    Example Celery task
    """
    print(f"Processing task: {message}")
    return f"Task completed: {message}"
