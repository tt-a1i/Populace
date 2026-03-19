"""Town scenario loader.

Reads a JSON template and constructs a fully populated World with
GenerativeAgent and Building instances ready for simulation.
"""
from __future__ import annotations

import json
import pathlib
from typing import Any

from engine.generative_agent import GenerativeAgent
from engine.types import Building, Resident, WorldConfig
from engine.world import World

# Default template bundled with the backend
DEFAULT_TEMPLATE = pathlib.Path(__file__).parent / "templates" / "modern_community.json"


def load_scenario(
    template_path: str | pathlib.Path = DEFAULT_TEMPLATE,
    config: WorldConfig | None = None,
) -> World:
    """Load a scenario from a JSON template and return a populated World.

    Args:
        template_path: Path to the scenario JSON file.
        config:        Optional WorldConfig override; defaults to the
                       values baked into the backend Settings.

    Returns:
        A :class:`~engine.world.World` pre-populated with agents and
        buildings as described in the template.
    """
    if config is None:
        from backend.core.config import settings
        config = WorldConfig(
            tick_interval_seconds=settings.tick_interval_seconds,
            tick_per_day=settings.tick_per_day,
            max_concurrent_llm_calls=settings.max_concurrent_llm_calls,
            llm_timeout_seconds=settings.llm_timeout_seconds,
            llm_call_probability=settings.llm_call_probability,
            short_term_memory_size=settings.short_term_memory_size,
            reflection_threshold=settings.reflection_threshold,
            relationship_decay_rate=settings.relationship_decay_rate,
            map_width_tiles=settings.map_width_tiles,
            map_height_tiles=settings.map_height_tiles,
            tile_size_px=settings.tile_size_px,
            interaction_distance=settings.interaction_distance,
            max_dialogues_per_tick=settings.max_dialogues_per_tick,
            snapshot_interval_ticks=settings.snapshot_interval_ticks,
        )

    with open(template_path, encoding="utf-8") as fh:
        data: dict[str, Any] = json.load(fh)

    world = World(config=config)

    # -------------------------------------------------------------------------
    # Buildings (must come before residents so enter_building can find them)
    # -------------------------------------------------------------------------
    for b in data.get("buildings", []):
        pos = tuple(b["position"])  # [x, y] in JSON → (x, y)
        building = Building(
            id=b["id"],
            type=b["type"],
            name=b["name"],
            capacity=b["capacity"],
            position=pos,  # type: ignore[arg-type]
        )
        world.add_building(building)

    # -------------------------------------------------------------------------
    # Apply road / water / building tiles to the grid (after buildings are added)
    # -------------------------------------------------------------------------
    map_data = data.get("map", {})
    _apply_map_tiles(world, map_data, data.get("buildings", []))

    # -------------------------------------------------------------------------
    # Residents → GenerativeAgent → place in home building
    # -------------------------------------------------------------------------
    from backend.world.buildings import enter_building

    for r in data.get("residents", []):
        home_id: str | None = r.get("home_id")
        resident = Resident(
            id=r["id"],
            name=r["name"],
            personality=r["personality"],
            goals=list(r.get("goals", [])),
            mood=r.get("mood", "neutral"),
            location=None,
            x=r.get("x", 0),
            y=r.get("y", 0),
        )
        agent = GenerativeAgent(resident)
        world.add_agent(agent)

        # Move resident into their home building at startup
        if home_id:
            home = world.get_building(home_id)
            if home is not None:
                enter_building(agent, home, world)

    return world


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _apply_map_tiles(
    world: World,
    map_data: dict[str, Any],
    buildings_data: list[dict[str, Any]],
) -> None:
    """Write walkability flags to World.grid.

    Rules:
    - Water rectangles  → False (impassable)
    - Road rectangles   → True  (already default; ensures road tiles stay open)
    - Building footprint → False (2×2 body tiles behind entrance are blocked)
    - Building entrance  → True  (the position tile listed in template)

    Args:
        world:          The world whose grid is mutated.
        map_data:       The ``"map"`` section of the template JSON.
        buildings_data: The ``"buildings"`` list from the template JSON.
    """
    h = world.config.map_height_tiles
    w = world.config.map_width_tiles

    def set_tile(x: int, y: int, walkable: bool) -> None:
        if 0 <= x < w and 0 <= y < h:
            world.grid[y][x] = walkable

    # Water → False
    for rect in map_data.get("water", []):
        rx, ry = rect["x"], rect["y"]
        for dy in range(rect.get("height", 1)):
            for dx in range(rect.get("width", 1)):
                set_tile(rx + dx, ry + dy, False)

    # Roads → True (explicit; may overlap water edges — road wins)
    for rect in map_data.get("roads", []):
        rx, ry = rect["x"], rect["y"]
        for dy in range(rect.get("height", 1)):
            for dx in range(rect.get("width", 1)):
                set_tile(rx + dx, ry + dy, True)

    # Building footprint: mark a 2×2 block "behind" the entrance as blocked,
    # then restore the entrance tile itself as walkable.
    for b in buildings_data:
        ex, ey = b["position"]  # entrance (walkable)
        # Body tiles: directly below and to the right of entrance
        for dy in range(1, 3):
            for dx in range(0, 2):
                set_tile(ex + dx, ey + dy, False)
        # Entrance stays open
        set_tile(ex, ey, True)
