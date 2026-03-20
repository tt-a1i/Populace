from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.api.schemas import ResidentResponse, api_error
from backend.api.simulation import get_simulation_state

_NOT_FOUND = api_error(404, "resident not found", "resident_not_found")


def _find_agent(state: Any, resident_id: str) -> Any:
    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            return agent
    return None


router = APIRouter(prefix="/api/residents", tags=["residents"])


class ResidentUpdateRequest(BaseModel):
    name: Optional[str] = None
    personality: Optional[str] = None
    goals: Optional[list[str]] = None
    mood: Optional[str] = None
    location: Optional[str] = None
    x: Optional[int] = None
    y: Optional[int] = None


@router.get("", response_model=list[ResidentResponse])
async def list_residents(request: Request) -> list[dict[str, Any]]:
    state = get_simulation_state(request)
    return [asdict(agent.resident) for agent in state.world.agents]


@router.get("/{resident_id}")
async def get_resident(resident_id: str, request: Request) -> dict[str, Any]:
    state = get_simulation_state(request)

    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            return asdict(agent.resident)

    raise _NOT_FOUND


@router.patch("/{resident_id}")
async def update_resident(
    resident_id: str,
    payload: ResidentUpdateRequest,
    request: Request,
) -> dict[str, Any]:
    state = get_simulation_state(request)

    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            updates = payload.model_dump(exclude_unset=True)
            for field_name, value in updates.items():
                setattr(agent.resident, field_name, value)
            return asdict(agent.resident)

    raise _NOT_FOUND


@router.get("/{resident_id}/memories")
async def get_resident_memories(resident_id: str, request: Request) -> list[dict[str, Any]]:
    """Return the most recent short-term memories for a resident (max 20)."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    return [asdict(mem) for mem in agent.memory_stream.all]


@router.get("/{resident_id}/relationships")
async def get_resident_relationships(resident_id: str, request: Request) -> list[dict[str, Any]]:
    """Return all relationship edges involving this resident."""
    state = get_simulation_state(request)
    if _find_agent(state, resident_id) is None:
        raise _NOT_FOUND

    result = []
    for (from_id, to_id), rel in state.world.relationships.items():
        if from_id == resident_id or to_id == resident_id:
            rel_dict = asdict(rel)
            counterpart_id = to_id if from_id == resident_id else from_id
            counterpart = _find_agent(state, counterpart_id)
            rel_dict["counterpart_name"] = counterpart.resident.name if counterpart else counterpart_id
            rel_dict["direction"] = "outgoing" if from_id == resident_id else "incoming"
            result.append(rel_dict)
    return result


@router.get("/{resident_id}/reflections")
async def get_resident_reflections(resident_id: str, request: Request) -> list[dict[str, Any]]:
    """Return all reflections accumulated by a resident."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    return [asdict(rf) for rf in agent.reflections]
