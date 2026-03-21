from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

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


class AttributeUpdateRequest(BaseModel):
    name: Optional[str] = None
    personality: Optional[str] = None
    mood: Optional[str] = None
    goals: Optional[list[str]] = None


@router.patch(
    "/{resident_id}/attributes",
    response_model=ResidentResponse,
    responses=error_responses(404, 422, 503),
)
async def update_resident_attributes(
    resident_id: str,
    payload: AttributeUpdateRequest,
    request: Request,
) -> ResidentResponse:
    """God-mode: directly overwrite resident attributes (name/personality/mood/goals)."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(agent.resident, field_name, value)
    return ResidentResponse(**asdict(agent.resident))


class InjectMemoryRequest(BaseModel):
    content: str
    importance: float = 0.7
    emotion: str = "neutral"


@router.post(
    "/{resident_id}/inject-memory",
    response_model=ResidentMemoryResponse,
    responses=error_responses(404, 422, 503),
)
async def inject_resident_memory(
    resident_id: str,
    payload: InjectMemoryRequest,
    request: Request,
) -> ResidentMemoryResponse:
    """God-mode: inject a custom memory into a resident's short-term stream."""
    import uuid
    from engine.types import Memory
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    mem = Memory(
        id=str(uuid.uuid4()),
        content=payload.content,
        timestamp=state.world.simulation_time(),
        importance=max(0.0, min(1.0, payload.importance)),
        emotion=payload.emotion,
    )
    agent.memory_stream.add(mem)
    return ResidentMemoryResponse(**asdict(mem))


class TeleportRequest(BaseModel):
    x: int
    y: int


@router.post(
    "/{resident_id}/teleport",
    response_model=ResidentResponse,
    responses=error_responses(404, 422, 503),
)
async def teleport_resident(
    resident_id: str,
    payload: TeleportRequest,
    request: Request,
) -> ResidentResponse:
    """God-mode: instantly move a resident to the given tile coordinates."""
    from backend.api.schemas import api_error as _api_error
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    cfg = state.world.config
    if not (0 <= payload.x < cfg.map_width_tiles and 0 <= payload.y < cfg.map_height_tiles):
        raise _api_error(422, f"Coordinates ({payload.x}, {payload.y}) are out of map bounds.", "out_of_bounds")
    # Leave current building if inside one
    if agent.resident.location is not None:
        state.world.leave_building(agent)
    agent.resident.x = payload.x
    agent.resident.y = payload.y
    agent.current_path = []
    state.world.mark_grid_index_dirty()
    return ResidentResponse(**asdict(agent.resident))


class InitialRelationship(BaseModel):
    resident_id: str
    type: str = "knows"
    intensity: float = 0.5


class ResidentCreateRequest(BaseModel):
    name: str
    personality: str
    mood: str = "neutral"
    home_building_id: Optional[str] = None
    initial_relationships: list[InitialRelationship] = Field(default_factory=list)


@router.post("/create", response_model=ResidentResponse, responses=error_responses(400, 422, 503))
async def create_resident(payload: ResidentCreateRequest, request: Request) -> ResidentResponse:
    """Create a new resident and inject them into the live simulation world."""
    import random
    import uuid

    from engine.generative_agent import GenerativeAgent
    from engine.types import Relationship, RelationType, Resident
    from backend.world.town import generate_resident_appearance

    if not payload.name.strip():
        raise api_error(400, "name cannot be empty", "invalid_name")

    state = get_simulation_state(request)
    cfg = state.world.config
    resident_id = str(uuid.uuid4())
    appearance = generate_resident_appearance(resident_id)

    start_x = random.randint(0, cfg.map_width_tiles - 1)
    start_y = random.randint(0, cfg.map_height_tiles - 1)

    home_building = None
    if payload.home_building_id:
        home_building = state.world.get_building(payload.home_building_id)
        if home_building is None:
            raise api_error(400, f"building '{payload.home_building_id}' not found", "building_not_found")
        start_x, start_y = home_building.position

    resident = Resident(
        id=resident_id,
        name=payload.name.strip(),
        personality=payload.personality,
        mood=payload.mood,
        home_building_id=payload.home_building_id,
        x=start_x,
        y=start_y,
        **appearance,
    )

    agent = GenerativeAgent(resident)
    state.world.add_agent(agent)

    if home_building is not None:
        state.world.enter_building(agent, home_building)

    for rel_input in payload.initial_relationships:
        target_agent = _find_agent(state, rel_input.resident_id)
        if target_agent is None:
            continue
        try:
            rel_type = RelationType(rel_input.type)
        except ValueError:
            rel_type = RelationType.knows
        intensity = max(0.0, min(1.0, rel_input.intensity))
        state.world.set_relationship(
            Relationship(from_id=resident_id, to_id=rel_input.resident_id, type=rel_type, intensity=intensity)
        )
        state.world.set_relationship(
            Relationship(from_id=rel_input.resident_id, to_id=resident_id, type=rel_type, intensity=intensity)
        )

    return ResidentResponse(**asdict(resident))


# ---------------------------------------------------------------------------
# POST /api/residents/{resident_id}/transfer
# ---------------------------------------------------------------------------

class TransferRequest(BaseModel):
    to_id: str
    amount: int

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("amount must be positive")
        return v


@router.post(
    "/{resident_id}/transfer",
    response_model=ResidentResponse,
    responses=error_responses(400, 404, 422, 503),
)
async def transfer_coins(
    resident_id: str,
    payload: TransferRequest,
    request: Request,
) -> ResidentResponse:
    """Transfer coins from one resident to another."""
    state = get_simulation_state(request)

    from_agent = _find_agent(state, resident_id)
    if from_agent is None:
        raise HTTPException(status_code=404, detail="Resident not found")

    to_agent = _find_agent(state, payload.to_id)
    if to_agent is None:
        raise HTTPException(status_code=404, detail="Target resident not found")

    if from_agent.resident.coins < payload.amount:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient coins: has {from_agent.resident.coins}, needs {payload.amount}",
        )

    from_agent.resident.coins -= payload.amount
    to_agent.resident.coins += payload.amount

    return ResidentResponse(**asdict(from_agent.resident))
