from upstash_redis import Redis
from app.lib.settings import settings

def get_redis() -> Redis:
    return Redis(url=settings.upstash_redis_url, token=settings.upstash_redis_token)
