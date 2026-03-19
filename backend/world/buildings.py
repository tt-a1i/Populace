"""Building interaction logic — enter, leave, occupancy queries.

Agents entering a building disappear from the tile map; their
``resident.location`` is set to the building's id.  Leaving reverses this.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.types import Building
    from engine.world import World


def enter_building(agent: "Agent", building: "Building", world: "World") -> bool:
    """Move *agent* inside *building*.

    Checks capacity before allowing entry.

    Args:
        agent:    The agent trying to enter.
        building: Target building.
        world:    Current world state (used for capacity check).

    Returns:
        True if the agent successfully entered; False if the building is full.
    """
    occupants = get_occupants(building.id, world)
    if len(occupants) >= building.capacity:
        return False

    agent.resident.location = building.id
    return True


def leave_building(agent: "Agent", world: "World", exit_x: int | None = None, exit_y: int | None = None) -> None:
    """Move *agent* out of their current building onto the tile map.

    Args:
        agent:   The agent to eject.
        world:   Current world state (used to find the building's exit tile).
        exit_x:  Optional override for exit tile x; defaults to building entrance.
        exit_y:  Optional override for exit tile y; defaults to building entrance.
    """
    building_id = agent.resident.location
    if building_id is None:
        return  # Not inside any building

    agent.resident.location = None

    # Place agent at the building's entrance tile (or override)
    if exit_x is not None and exit_y is not None:
        agent.resident.x = exit_x
        agent.resident.y = exit_y
    else:
        building = world.get_building(building_id)
        if building is not None:
            agent.resident.x, agent.resident.y = building.position


def get_occupants(building_id: str, world: "World") -> list["Agent"]:
    """Return all agents currently inside *building_id*.

    Args:
        building_id: The target building's id.
        world:       Current world state.

    Returns:
        List of agents whose ``resident.location == building_id``.
    """
    return [a for a in world.agents if a.resident.location == building_id]
