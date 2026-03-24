from __future__ import annotations

from fastapi import APIRouter, Request

from backend.api.schemas import api_error, error_responses
from backend.api.simulation import get_simulation_state
from engine.achievements import build_resident_achievement_view, check_and_unlock as engine_check_and_unlock


router = APIRouter(prefix="/api/residents", tags=["achievements"])


def check_and_unlock(state: object, dialogue_resident_ids: set[str] | None = None) -> list[dict]:
    del dialogue_resident_ids
    return engine_check_and_unlock(state)


@router.get(
    "/{resident_id}/achievements",
    responses=error_responses(404, 503),
)
async def get_resident_achievements(resident_id: str, request: Request) -> list[dict]:
    state = get_simulation_state(request)
    found = any(agent.resident.id == resident_id for agent in state.world.agents)
    if not found:
        raise api_error(404, "resident not found", "resident_not_found")
    return build_resident_achievement_view(state, resident_id)
