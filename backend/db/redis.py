from __future__ import annotations

import json
from typing import Any

from redis.asyncio import Redis
from redis.asyncio import from_url

from backend.core.config import settings


_redis: Redis | None = None


async def get_redis() -> Redis:
    global _redis

    if _redis is None:
        _redis = from_url(settings.redis_url, decode_responses=True)
    return _redis


async def close_redis() -> None:
    global _redis

    if _redis is not None:
        await _redis.aclose()
        _redis = None


async def get_json(key: str) -> Any:
    client = await get_redis()
    value = await client.get(key)

    if value is None:
        return None
    return json.loads(value)


async def set_json(key: str, value: Any, ttl: int | None = None) -> None:
    client = await get_redis()
    payload = json.dumps(value)

    if ttl is None:
        await client.set(key, payload)
        return

    await client.set(key, payload, ex=ttl)
