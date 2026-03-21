"""Act module — execute a planned action and mutate world state.

Implements step 5 of the decision loop described in spec §4.1:
  "行动（Act）— 执行：移动、对话、交互"

Dialogue is handled by engine/social.py (Task 09).
This module handles movement and idle only.

Movement with a target uses A* pathfinding (spec §10).  The computed path
is stored on the agent as ``agent.current_path`` and consumed across
multiple ticks until the agent arrives or the path is blocked.
"""
from __future__ import annotations

import random
from typing import TYPE_CHECKING, List

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.world import World

# Ordered mood ladder: index 0 = most negative, 9 = most positive
_MOOD_LADDER: List[str] = [
    "sad", "fearful", "angry", "tired",
    "neutral", "calm", "content",
    "happy", "excited", "ecstatic",
]
_MOOD_RANK = {mood: i for i, mood in enumerate(_MOOD_LADDER)}


def act(agent: "Agent", plan: dict, world: "World") -> None:
    """Execute *plan* for *agent*, mutating ``agent.resident`` in place.

    Supported actions:
    - ``"move"``  — move toward ``plan["target"]`` (tile coords) via A*,
                    or random adjacent tile if no target given.
    - ``"idle"``  — stay in place (no-op).
    - ``"talk"``  — no-op here; dialogue handled by social.py.

    Args:
        agent: The acting agent.
        plan:  Action dict from :func:`engine.plan.plan`.
        world: Current world state (used for grid walkability and path cache).
    """
    if agent.resident.location is not None:
        _stay_or_leave_building(agent, world)
        return

    action = plan.get("action", "idle")

    if action == "move":
        target = plan.get("target")
        if target is not None:
            _step_astar(agent, tuple(target), world)
        else:
            _step_random(agent, world)

    # "idle" and "talk" require no position change here
    _maybe_enter_building(agent, world)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _step_astar(agent: "Agent", target: tuple, world: "World") -> None:
    """Move agent toward *target* using A* pathfinding (spec §10).

    Consumes the first step of ``agent.current_path`` per call.  Recomputes
    the path when none exists, the destination has changed, or the next tile
    is blocked.  Uses ``world.path_cache`` to avoid redundant A* searches
    within the same tick.
    """
    from engine.pathfinding import astar

    res = agent.resident
    pos = (res.x, res.y)

    if pos == target:
        agent.current_path = []
        _maybe_enter_building(agent, world)
        return

    path = agent.current_path

    # Recompute when: no path or destination changed
    # (blocked next-step is handled in the walk loop below, not here)
    if not path or path[-1] != target:
        if world.path_cache.has(pos, target):
            new_path = world.path_cache.get(pos, target)
        else:
            new_path = astar(world.grid, pos, target)
            world.path_cache.set(pos, target, new_path)

        if not new_path:
            agent.current_path = []
            return

        # Exclude the starting tile — agent is already there
        agent.current_path = new_path[1:]

    # Advance up to 2 steps along the path (spec §10: 1-2 步/tick)
    steps = min(2, len(agent.current_path))
    for _ in range(steps):
        if not agent.current_path:
            break
        next_pos = agent.current_path[0]
        if _is_walkable(next_pos[0], next_pos[1], world):
            res.x, res.y = next_pos
            world.mark_grid_index_dirty()
            agent.current_path = agent.current_path[1:]
            # Moving costs energy
            res.energy = max(0.0, res.energy - 0.01)
            _maybe_enter_building(agent, world)
        else:
            # Path became blocked; clear so next tick recomputes
            agent.current_path = []
            break


def _step_random(agent: "Agent", world: "World") -> None:
    """Move agent to a random adjacent walkable tile (or stay)."""
    import random
    res = agent.resident
    candidates = [
        (res.x + 1, res.y),
        (res.x - 1, res.y),
        (res.x, res.y + 1),
        (res.x, res.y - 1),
    ]
    walkable = [p for p in candidates if _is_walkable(p[0], p[1], world)]
    if walkable:
        res.x, res.y = random.choice(walkable)
        world.mark_grid_index_dirty()
        res.energy = max(0.0, res.energy - 0.01)
        _maybe_enter_building(agent, world)


def _is_walkable(x: int, y: int, world: "World") -> bool:
    """Return True if tile (x, y) exists and is walkable."""
    cfg = world.config
    if not (0 <= x < cfg.map_width_tiles and 0 <= y < cfg.map_height_tiles):
        return False
    return world.grid[y][x]


def _maybe_enter_building(agent: "Agent", world: "World") -> None:
    building = world.get_building_at_position(agent.resident.x, agent.resident.y)
    if building is None:
        return

    if world.enter_building(agent, building):
        agent.current_path = []
        setattr(agent, "_building_ticks_remaining", world.building_stay_duration())


def _stay_or_leave_building(agent: "Agent", world: "World") -> None:
    world.apply_building_effects(agent)

    remaining = getattr(agent, "_building_ticks_remaining", None)
    if remaining is None:
        remaining = world.building_stay_duration()

    remaining -= 1
    if remaining <= 0:
        world.leave_building(agent)
        setattr(agent, "_building_ticks_remaining", None)
        return

    setattr(agent, "_building_ticks_remaining", remaining)


def apply_mood_contagion(world: "World") -> None:
    """Nudge moods of co-occupants toward each other based on relationship strength.

    For each building with ≥2 occupants:
    - Each agent accumulates a net push from co-occupants (positive = nudge up,
      negative = nudge down) weighted by relationship intensity.
    - If the net push exceeds a random threshold, mood moves one step on the
      ladder, keeping emotion dynamics gradual and stochastic.
    """
    for building in world.buildings:
        occupants = world.get_occupants(building.id)
        if len(occupants) < 2:
            continue

        for agent in occupants:
            my_rank = _MOOD_RANK.get(agent.resident.mood, 4)
            net_push = 0.0

            for other in occupants:
                if other is agent:
                    continue
                other_rank = _MOOD_RANK.get(other.resident.mood, 4)
                if other_rank == my_rank:
                    continue
                rel = world.get_relationship(other.resident.id, agent.resident.id)
                # Use a small base intensity even with no established relationship
                intensity = rel.intensity if rel is not None else 0.1
                direction = 1.0 if other_rank > my_rank else -1.0
                net_push += direction * intensity * 0.05

            if net_push > 0 and random.random() < net_push:
                new_rank = min(my_rank + 1, len(_MOOD_LADDER) - 1)
                agent.resident.mood = _MOOD_LADDER[new_rank]
            elif net_push < 0 and random.random() < -net_push:
                new_rank = max(my_rank - 1, 0)
                agent.resident.mood = _MOOD_LADDER[new_rank]
