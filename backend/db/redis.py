"""Redis cache layer for Populace.

Key scheme:
  populace:positions          hash   — {agent_id: "[x, y]"}
  populace:ticks              channel — pub/sub of TickState JSON
  populace:memory:{agent_id} list   — recent memories (capped to SHORT_TERM_SIZE)

All public functions are async and silently skip when Redis is unavailable.
"""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

from redis.asyncio import Redis
from redis.asyncio import from_url

from backend.core.config import settings

logger = logging.getLogger(__name__)

_redis: Redis | None = None

_POSITIONS_KEY = "populace:positions"
_TICKS_CHANNEL = "populace:ticks"
_MEMORY_KEY_PREFIX = "populace:memory:"
_SHORT_TERM_SIZE = 20   # must match WorldConfig.short_term_memory_size


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Agent positions  (populace:positions hash)
# ---------------------------------------------------------------------------

async def save_agent_positions(world: Any) -> None:
    """Write every on-map agent position to ``populace:positions`` Redis hash.

    Agents inside buildings are stored with their last known tile coordinates.

    Args:
        world: A :class:`engine.world.World` instance.
    """
    try:
        client = await get_redis()
        mapping: dict[str, str] = {}
        for agent in world.agents:
            mapping[agent.resident.id] = json.dumps([agent.resident.x, agent.resident.y])
        if mapping:
            await client.hset(_POSITIONS_KEY, mapping=mapping)
    except Exception as exc:
        logger.debug("Redis save_agent_positions skipped: %s", exc)


async def load_agent_positions() -> dict[str, tuple[int, int]]:
    """Return a dict of ``{agent_id: (x, y)}`` from Redis.

    Returns an empty dict when Redis is unavailable.
    """
    try:
        client = await get_redis()
        raw: dict[str, str] = await client.hgetall(_POSITIONS_KEY)
        return {k: tuple(json.loads(v)) for k, v in raw.items()}  # type: ignore[misc]
    except Exception as exc:
        logger.debug("Redis load_agent_positions skipped: %s", exc)
        return {}


# ---------------------------------------------------------------------------
# Tick pub/sub  (populace:ticks channel)
# ---------------------------------------------------------------------------

async def publish_tick_event(tick_state: Any) -> None:
    """Publish a serialised TickState to the ``populace:ticks`` pub/sub channel.

    Enables future multi-instance fan-out without changing the simulation loop.

    Args:
        tick_state: A :class:`engine.types.TickState` dataclass instance.
    """
    try:
        from dataclasses import asdict, is_dataclass
        client = await get_redis()
        payload = json.dumps(asdict(tick_state) if is_dataclass(tick_state) else tick_state)
        await client.publish(_TICKS_CHANNEL, payload)
    except Exception as exc:
        logger.debug("Redis publish_tick_event skipped: %s", exc)


async def subscribe_tick_events() -> AsyncIterator[dict[str, Any]]:
    """Subscribe to ``populace:ticks`` and yield parsed TickState dicts.

    Usage::

        async for tick in subscribe_tick_events():
            print(tick["tick"])

    Yields parsed message dicts; stops when Redis is unavailable.
    """
    try:
        client = await get_redis()
        pubsub = client.pubsub()
        await pubsub.subscribe(_TICKS_CHANNEL)
        async for message in pubsub.listen():
            if message and message.get("type") == "message":
                try:
                    yield json.loads(message["data"])
                except (json.JSONDecodeError, KeyError) as exc:
                    logger.warning("Skipping malformed Redis tick message: %s", exc)
    except Exception as exc:
        logger.debug("Redis subscribe_tick_events stopped: %s", exc)
        return


# ---------------------------------------------------------------------------
# Short-term memory cache  (populace:memory:{agent_id} list)
# ---------------------------------------------------------------------------

async def cache_agent_memory(agent_id: str, memory: Any) -> None:
    """Append *memory* to the agent's Redis list and trim to SHORT_TERM_SIZE.

    Args:
        agent_id: The resident id.
        memory:   A :class:`engine.types.Memory` dataclass instance.
    """
    try:
        from dataclasses import asdict
        client = await get_redis()
        key = f"{_MEMORY_KEY_PREFIX}{agent_id}"
        payload = json.dumps(asdict(memory))
        pipeline = client.pipeline()
        pipeline.rpush(key, payload)
        pipeline.ltrim(key, -_SHORT_TERM_SIZE, -1)
        await pipeline.execute()
    except Exception as exc:
        logger.debug("Redis cache_agent_memory skipped: %s", exc)


async def load_cached_memories(agent_id: str) -> list[dict[str, Any]]:
    """Return the cached short-term memories for *agent_id* from Redis.

    Returns an empty list when Redis is unavailable.
    """
    try:
        client = await get_redis()
        key = f"{_MEMORY_KEY_PREFIX}{agent_id}"
        raw: list[str] = await client.lrange(key, 0, -1)
        return [json.loads(item) for item in raw]
    except Exception as exc:
        logger.debug("Redis load_cached_memories skipped: %s", exc)
        return []


async def clear_agent_memory_cache(agent_id: str) -> None:
    """Delete the Redis memory list for *agent_id* (e.g. on scenario reset)."""
    try:
        client = await get_redis()
        await client.delete(f"{_MEMORY_KEY_PREFIX}{agent_id}")
    except Exception as exc:
        logger.debug("Redis clear_agent_memory_cache skipped: %s", exc)
