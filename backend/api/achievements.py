from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from backend.api.schemas import api_error, error_responses
from backend.api.simulation import get_simulation_state

ACHIEVEMENTS: list[dict[str, str]] = [
    {
        "id": "first_chat",
        "name": "破冰者",
        "description": "第一次与其他居民交谈",
        "icon": "💬",
    },
    {
        "id": "five_friends",
        "name": "社交达人",
        "description": "与5个或更多居民建立关系",
        "icon": "🤝",
    },
    {
        "id": "rich_500",
        "name": "小富翁",
        "description": "积累500金币",
        "icon": "💰",
    },
    {
        "id": "storm_survivor",
        "name": "风雨无阻",
        "description": "在暴风雨天气中生存",
        "icon": "⛈️",
    },
    {
        "id": "explorer",
        "name": "探险家",
        "description": "探索所有建筑物",
        "icon": "🗺️",
    },
]

_ACHIEVEMENT_MAP: dict[str, dict[str, str]] = {a["id"]: a for a in ACHIEVEMENTS}

router = APIRouter(prefix="/api/residents", tags=["achievements"])


def check_and_unlock(state: Any, dialogue_resident_ids: set[str]) -> list[dict[str, str]]:
    """Check all residents for newly unlocked achievements this tick.

    Returns a list of unlock event dicts for any newly unlocked achievements.
    Modifies ``state._achievements_store`` in place.
    """
    from engine.types import WeatherType

    # Guard: state may be constructed without __init__ in tests
    if not hasattr(state, "_achievements_store"):
        state._achievements_store = {}
    if not hasattr(state, "_buildings_visited"):
        state._buildings_visited = {}

    unlocks: list[dict[str, str]] = []
    achievement_store: dict[str, set[str]] = state._achievements_store
    buildings_visited: dict[str, set[str]] = state._buildings_visited
    all_building_ids = {b.id for b in state.world.buildings}

    for agent in state.world.agents:
        rid = agent.resident.id
        unlocked = achievement_store.setdefault(rid, set())

        def _try(ach_id: str, _rid: str = rid, _unlocked: set[str] = unlocked) -> None:
            if ach_id not in _unlocked:
                _unlocked.add(ach_id)
                ach = _ACHIEVEMENT_MAP[ach_id]
                unlocks.append({
                    "resident_id": _rid,
                    "achievement_id": ach_id,
                    "achievement_name": ach["name"],
                    "icon": ach["icon"],
                })

        if rid in dialogue_resident_ids:
            _try("first_chat")

        rel_count = sum(1 for (f, t) in state.world.relationships if f == rid or t == rid)
        if rel_count >= 5:
            _try("five_friends")

        if agent.resident.coins >= 500:
            _try("rich_500")

        if state.world.weather is WeatherType.stormy:
            _try("storm_survivor")

        visited = buildings_visited.get(rid, set())
        if all_building_ids and visited >= all_building_ids:
            _try("explorer")

    return unlocks


@router.get(
    "/{resident_id}/achievements",
    responses=error_responses(404, 503),
)
async def get_resident_achievements(resident_id: str, request: Request) -> list[dict]:
    """Return all achievements for a resident with locked/unlocked status."""
    state = get_simulation_state(request)

    found = any(a.resident.id == resident_id for a in state.world.agents)
    if not found:
        raise api_error(404, "resident not found", "resident_not_found")

    unlocked = state._achievements_store.get(resident_id, set())
    return [{**a, "unlocked": a["id"] in unlocked} for a in ACHIEVEMENTS]
