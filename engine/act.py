"""Act module — execute a planned action and mutate world state.

Implements step 5 of the decision loop described in spec §4.1:
  "行动（Act）— 执行：移动、对话、交互"

Dialogue is handled by engine/social.py (Task 09).
This module handles movement and idle only.
"""
from __future__ import annotations

import math
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.world import World


def act(agent: "Agent", plan: dict, world: "World") -> None:
    """Execute *plan* for *agent*, mutating ``agent.resident`` in place.

    Supported actions:
    - ``"move"``  — move one step toward ``plan["target"]`` (tile coords),
                    or random adjacent tile if no target given.
    - ``"idle"``  — stay in place (no-op).
    - ``"talk"``  — no-op here; dialogue handled by social.py.

    Args:
        agent: The acting agent.
        plan:  Action dict from :func:`engine.plan.plan`.
        world: Current world state (used for grid walkability checks).
    """
    action = plan.get("action", "idle")

    if action == "move":
        target = plan.get("target")
        if target is not None:
            _step_toward(agent, target, world)
        else:
            _step_random(agent, world)

    # "idle" and "talk" require no position change here


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _step_toward(agent: "Agent", target: tuple[int, int], world: "World") -> None:
    """Move agent one tile toward *target* along the dominant axis."""
    res = agent.resident
    tx, ty = target
    dx = tx - res.x
    dy = ty - res.y

    if dx == 0 and dy == 0:
        return  # Already at target

    # Move along whichever axis has greater distance
    if abs(dx) >= abs(dy):
        nx, ny = res.x + int(math.copysign(1, dx)), res.y
    else:
        nx, ny = res.x, res.y + int(math.copysign(1, dy))

    if _is_walkable(nx, ny, world):
        res.x, res.y = nx, ny


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


def _is_walkable(x: int, y: int, world: "World") -> bool:
    """Return True if tile (x, y) exists and is walkable."""
    cfg = world.config
    if not (0 <= x < cfg.map_width_tiles and 0 <= y < cfg.map_height_tiles):
        return False
    return world.grid[y][x]
