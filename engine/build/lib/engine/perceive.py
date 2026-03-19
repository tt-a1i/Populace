"""Perceive module — sense the environment for a single agent tick.

Implements step 1 of the decision loop described in spec §4.1:
  "感知（Perceive）— 查询：我在哪？周围有谁？刚发生了什么？"
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from engine.types import Event

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.world import World


def perceive(agent: "Agent", world: "World") -> list[Event]:
    """Build the list of events observable by *agent* this tick.

    Checks:
    - Nearby agents (Manhattan distance ≤ interaction_distance)
    - Agents inside the same building
    - Any world-level events queued for this tick

    Args:
        agent: The observing agent.
        world: Current world state snapshot.

    Returns:
        List of :class:`~engine.types.Event` objects visible to the agent.
    """
    events: list[Event] = []
    resident = agent.resident
    tick_time = world.simulation_time()

    # Nearby agents on the open map
    nearby = world.get_nearby_agents(resident.x, resident.y)
    for other in nearby:
        events.append(Event(
            id=str(uuid.uuid4()),
            description=f"{other.resident.name} 在附近（距离：曼哈顿 ≤ {world.config.interaction_distance} 格）",
            timestamp=tick_time,
            source="system",
        ))

    # Agents in the same building
    if resident.location:
        same_building = [
            a for a in world.agents
            if a is not agent and a.resident.location == resident.location
        ]
        for other in same_building:
            events.append(Event(
                id=str(uuid.uuid4()),
                description=f"{other.resident.name} 也在 {resident.location} 里",
                timestamp=tick_time,
                source="system",
            ))

    # World-level pending events (stored on world if present)
    pending: list[Event] = getattr(world, "pending_events", [])
    events.extend(pending)

    return events
