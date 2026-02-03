from redis import asyncio as aioredis
import redis as redis_sync
from app.core.config import settings

redis_client = aioredis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True,
)

# Sync Redis client for Celery workers
redis_sync_client = redis_sync.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True,
)
