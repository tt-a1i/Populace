from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from backend.api.schemas import (
    ResidentMemoryResponse,
    ResidentReflectionResponse,
    ResidentRelationshipResponse,
    ResidentResponse,
    api_error,
    error_responses,
)
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


@router.get("", response_model=list[ResidentResponse], responses=error_responses(503))
async def list_residents(request: Request) -> list[ResidentResponse]:
    """Return every resident currently loaded into the simulation world."""
    state = get_simulation_state(request)
    return [ResidentResponse(**asdict(agent.resident)) for agent in state.world.agents]


@router.get("/{resident_id}", response_model=ResidentResponse, responses=error_responses(404, 503))
async def get_resident(resident_id: str, request: Request) -> ResidentResponse:
    """Return the live resident profile for the given resident id."""
    state = get_simulation_state(request)

    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            return ResidentResponse(**asdict(agent.resident))

    raise _NOT_FOUND


@router.patch("/{resident_id}", response_model=ResidentResponse, responses=error_responses(404, 422, 503))
async def update_resident(
    resident_id: str,
    payload: ResidentUpdateRequest,
    request: Request,
) -> ResidentResponse:
    """Patch editable resident fields such as mood, goals, or map position."""
    state = get_simulation_state(request)

    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            updates = payload.model_dump(exclude_unset=True)
            for field_name, value in updates.items():
                setattr(agent.resident, field_name, value)
            return ResidentResponse(**asdict(agent.resident))

    raise _NOT_FOUND


@router.get(
    "/{resident_id}/memories",
    response_model=list[ResidentMemoryResponse],
    responses=error_responses(404, 503),
)
async def get_resident_memories(resident_id: str, request: Request) -> list[ResidentMemoryResponse]:
    """Return the most recent short-term memories for a resident (max 20)."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    return [ResidentMemoryResponse(**asdict(mem)) for mem in agent.memory_stream.all]


@router.get(
    "/{resident_id}/relationships",
    response_model=list[ResidentRelationshipResponse],
    responses=error_responses(404, 503),
)
async def get_resident_relationships(resident_id: str, request: Request) -> list[ResidentRelationshipResponse]:
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
            result.append(ResidentRelationshipResponse(**rel_dict))
    return result


@router.get(
    "/{resident_id}/reflections",
    response_model=list[ResidentReflectionResponse],
    responses=error_responses(404, 503),
)
async def get_resident_reflections(resident_id: str, request: Request) -> list[ResidentReflectionResponse]:
    """Return all reflections accumulated by a resident."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    return [ResidentReflectionResponse(**asdict(rf)) for rf in agent.reflections]
