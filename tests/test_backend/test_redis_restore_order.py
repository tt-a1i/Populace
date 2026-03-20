"""Regression test for Task 47 fix: Redis positions must override Neo4j home reset.

The bug: restore_from_neo4j() applied Redis positions BEFORE Neo4j, but
Neo4j's restore_world_memories() then reset every in-building agent to their
home entrance — discarding the Redis coordinates.

The fix: Redis positions are now applied AFTER Neo4j so they always win.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from backend.api.simulation import SimulationState
from engine.types import Resident


@pytest.mark.asyncio
async def test_redis_positions_override_neo4j_home_reset() -> None:
    """Redis cached positions must survive the Neo4j restore pass."""
    state = SimulationState()

    # Grab first agent and record its starting position
    agent = state.world.agents[0]
    redis_x, redis_y = 17, 22           # arbitrary "Redis-cached" position
    home_x, home_y = agent.resident.x, agent.resident.y  # original home entrance

    # Simulate: Redis has a cached position far from home
    fake_positions = {agent.resident.id: (redis_x, redis_y)}

    # Simulate: Neo4j knows this resident (so restore runs)
    fake_residents = [{"id": agent.resident.id, "name": agent.resident.name}]

    with (
        patch(
            "backend.db.redis.load_agent_positions",
            new_callable=AsyncMock,
            return_value=fake_positions,
        ),
        patch(
            "backend.db.redis.load_cached_memories",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "backend.db.neo4j.load_residents",
            new_callable=AsyncMock,
            return_value=fake_residents,
        ),
        patch(
            "backend.db.neo4j.restore_world_memories",
            new_callable=AsyncMock,
        ) as mock_neo4j_restore,
    ):
        # Simulate Neo4j resetting the agent to home entrance (the old bug)
        def side_effect(world, *, skip_position_reset=False):
            if not skip_position_reset:
                agent.resident.x = home_x
                agent.resident.y = home_y

        mock_neo4j_restore.side_effect = side_effect

        await state.restore_from_neo4j()

    # After restore, position must be the Redis value, not the home entrance
    assert agent.resident.x == redis_x, (
        f"Expected Redis x={redis_x}, got x={agent.resident.x} "
        "(Neo4j home reset was not overridden by Redis)"
    )
    assert agent.resident.y == redis_y, (
        f"Expected Redis y={redis_y}, got y={agent.resident.y} "
        "(Neo4j home reset was not overridden by Redis)"
    )


@pytest.mark.asyncio
async def test_neo4j_home_reset_used_when_no_redis_positions() -> None:
    """When Redis has no positions, Neo4j home reset should still apply."""
    state = SimulationState()
    agent = state.world.agents[0]

    # Put agent at an arbitrary position
    agent.resident.x = 5
    agent.resident.y = 5
    # Place agent in a building so Neo4j reset fires
    agent.resident.location = state.world.buildings[0].id
    expected_x, expected_y = state.world.buildings[0].position

    with (
        patch(
            "backend.db.redis.load_agent_positions",
            new_callable=AsyncMock,
            return_value={},   # no Redis positions
        ),
        patch(
            "backend.db.redis.load_cached_memories",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "backend.db.neo4j.load_residents",
            new_callable=AsyncMock,
            return_value=[{"id": agent.resident.id}],
        ),
        patch(
            "backend.db.neo4j.restore_world_memories",
            new_callable=AsyncMock,
        ) as mock_neo4j_restore,
    ):
        def side_effect(world, *, skip_position_reset=False):
            # Neo4j home reset should NOT be skipped when Redis is empty
            assert not skip_position_reset, (
                "skip_position_reset should be False when Redis has no positions"
            )
            agent.resident.x = expected_x
            agent.resident.y = expected_y

        mock_neo4j_restore.side_effect = side_effect

        await state.restore_from_neo4j()

    assert agent.resident.x == expected_x
    assert agent.resident.y == expected_y
