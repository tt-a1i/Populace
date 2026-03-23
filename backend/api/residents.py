from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from backend.api.schemas import (
    DiaryEntryResponse,
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

    _PATCHABLE_FIELDS = {"name", "personality", "goals", "mood", "location", "x", "y"}
    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            updates = payload.model_dump(exclude_unset=True)
            for field_name, value in updates.items():
                if field_name not in _PATCHABLE_FIELDS:
                    continue
                setattr(agent.resident, field_name, value)
            from backend.api.ws import manager

            await manager.broadcast_operation(
                "resident_updated",
                resident=asdict(agent.resident),
                source_client_id=request.headers.get("x-populace-client-id"),
            )
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
    "/{resident_id}/memories/search",
    response_model=list[ResidentMemoryResponse],
    responses=error_responses(404, 503),
)
async def search_resident_memories(
    resident_id: str,
    request: Request,
    q: str = "",
) -> list[ResidentMemoryResponse]:
    """Full-text search through a resident's memories by keyword."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND

    query = q.strip().lower()
    if not query:
        return [ResidentMemoryResponse(**asdict(mem)) for mem in agent.memory_stream.all]

    results = [
        mem for mem in agent.memory_stream.all
        if query in mem.content.lower()
    ]
    return [ResidentMemoryResponse(**asdict(mem)) for mem in results]


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


class RelationshipHistoryPoint(BaseModel):
    tick: int
    time: str
    intensity: float
    rel_type: str
    dialogue: str | None = None


class RelationshipHistoryResponse(BaseModel):
    from_id: str
    to_id: str
    from_name: str
    to_name: str
    points: list[RelationshipHistoryPoint] = Field(default_factory=list)


@router.get(
    "/{resident_id}/relationship-history/{other_id}",
    response_model=RelationshipHistoryResponse,
    responses=error_responses(404, 503),
)
async def get_relationship_history(
    resident_id: str, other_id: str, request: Request,
) -> RelationshipHistoryResponse:
    """Return intensity-over-time for a specific resident pair from experiment history."""
    state = get_simulation_state(request)
    agent_a = _find_agent(state, resident_id)
    if agent_a is None:
        raise _NOT_FOUND
    agent_b = _find_agent(state, other_id)
    if agent_b is None:
        raise api_error(404, "other resident not found", "resident_not_found")

    points: list[RelationshipHistoryPoint] = []
    experiment_history = getattr(state, "_experiment_history", [])

    for frame in experiment_history:
        tick = frame.get("tick", 0)
        time_str = frame.get("time", "")
        rels = frame.get("relationships", [])
        dialogues = frame.get("dialogues", [])

        # Find this pair's relationship in the snapshot
        intensity = 0.0
        rel_type = "none"
        for rel in rels:
            if (rel["from_id"] == resident_id and rel["to_id"] == other_id) or \
               (rel["from_id"] == other_id and rel["to_id"] == resident_id):
                intensity = rel.get("intensity", 0)
                rel_type = rel.get("type", "knows")
                break

        # Find dialogue between the pair this tick
        dialogue_text = None
        for d in dialogues:
            if (d["from_id"] == resident_id and d["to_id"] == other_id) or \
               (d["from_id"] == other_id and d["to_id"] == resident_id):
                dialogue_text = d.get("text", "")[:80]
                break

        if intensity > 0 or dialogue_text:
            points.append(RelationshipHistoryPoint(
                tick=tick, time=time_str, intensity=intensity,
                rel_type=rel_type, dialogue=dialogue_text,
            ))

    return RelationshipHistoryResponse(
        from_id=resident_id,
        to_id=other_id,
        from_name=agent_a.resident.name,
        to_name=agent_b.resident.name,
        points=points,
    )


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


@router.get(
    "/{resident_id}/diary",
    response_model=list[DiaryEntryResponse],
    responses=error_responses(404, 503),
)
async def get_resident_diary(resident_id: str, request: Request) -> list[DiaryEntryResponse]:
    """Return all diary entries accumulated by a resident."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    return [DiaryEntryResponse(**asdict(entry)) for entry in agent.resident.diary]


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
    from backend.api.ws import manager

    await manager.broadcast_operation(
        "resident_updated",
        resident=asdict(agent.resident),
        source_client_id=request.headers.get("x-populace-client-id"),
    )
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
        source="injected",
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
    from backend.api.ws import manager

    await manager.broadcast_operation(
        "resident_teleported",
        resident=asdict(agent.resident),
        source_client_id=request.headers.get("x-populace-client-id"),
    )
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

class FamilyMemberResponse(BaseModel):
    id: str
    name: str
    age_days: int = 0
    deceased: bool = False
    relation: str  # "self", "parent", "child", "spouse"


class FamilyTreeResponse(BaseModel):
    root: FamilyMemberResponse
    parents: list[FamilyMemberResponse] = Field(default_factory=list)
    spouse: FamilyMemberResponse | None = None
    children: list[FamilyMemberResponse] = Field(default_factory=list)


@router.get(
    "/{resident_id}/family-tree",
    response_model=FamilyTreeResponse,
    responses=error_responses(404, 503),
)
async def get_family_tree(resident_id: str, request: Request) -> FamilyTreeResponse:
    """Build a family tree for a resident from relationships and population history."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND

    alive_ids = {a.resident.id for a in state.world.agents}

    def _member(rid: str, relation: str) -> FamilyMemberResponse:
        a = _find_agent(state, rid)
        if a:
            return FamilyMemberResponse(
                id=rid,
                name=a.resident.name,
                age_days=a.resident.age_days,
                deceased=False,
                relation=relation,
            )
        return FamilyMemberResponse(
            id=rid, name=rid, age_days=0, deceased=True, relation=relation,
        )

    root = FamilyMemberResponse(
        id=resident_id,
        name=agent.resident.name,
        age_days=agent.resident.age_days,
        deceased=False,
        relation="self",
    )

    # Scan relationships for parent-child bonds (reason contains "家庭纽带")
    parents: list[FamilyMemberResponse] = []
    children: list[FamilyMemberResponse] = []
    seen_ids: set[str] = set()

    for (from_id, to_id), rel in state.world.relationships.items():
        if rel.reason and "家庭纽带" in rel.reason:
            if to_id == resident_id and from_id not in seen_ids:
                # from_id is a parent or child — determine by age
                other = _find_agent(state, from_id)
                if other and other.resident.age_days > agent.resident.age_days:
                    parents.append(_member(from_id, "parent"))
                elif other and other.resident.age_days < agent.resident.age_days:
                    children.append(_member(from_id, "child"))
                else:
                    parents.append(_member(from_id, "parent"))
                seen_ids.add(from_id)
            elif from_id == resident_id and to_id not in seen_ids:
                other = _find_agent(state, to_id)
                if other and other.resident.age_days > agent.resident.age_days:
                    parents.append(_member(to_id, "parent"))
                elif other and other.resident.age_days < agent.resident.age_days:
                    children.append(_member(to_id, "child"))
                else:
                    children.append(_member(to_id, "child"))
                seen_ids.add(to_id)

    # Also scan timeline events for birth records
    timeline = getattr(state, "_timeline_events", [])
    for event in timeline:
        meta = event.get("metadata", {})
        if meta.get("event_type") == "birth":
            if meta.get("resident_id") == resident_id:
                for pid in meta.get("parent_ids", []):
                    if pid not in seen_ids:
                        parents.append(_member(pid, "parent"))
                        seen_ids.add(pid)
            elif resident_id in meta.get("parent_ids", []):
                child_id = meta["resident_id"]
                if child_id not in seen_ids:
                    children.append(_member(child_id, "child"))
                    seen_ids.add(child_id)

    # Find spouse: bidirectional love relationship with highest intensity
    spouse: FamilyMemberResponse | None = None
    best_love = 0.0
    for (from_id, to_id), rel in state.world.relationships.items():
        if from_id == resident_id and rel.type.value == "love" and rel.intensity > best_love:
            reverse_key = (to_id, from_id)
            reverse = state.world.relationships.get(reverse_key)
            if reverse and reverse.type.value == "love":
                best_love = rel.intensity
                spouse = _member(to_id, "spouse")

    return FamilyTreeResponse(root=root, parents=parents, spouse=spouse, children=children)


class TransferRequest(BaseModel):
    to_id: str
    amount: int

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("amount must be positive")
        return v


class TransferResponse(BaseModel):
    from_resident: ResidentResponse
    to_resident: ResidentResponse


@router.post(
    "/{resident_id}/transfer",
    response_model=TransferResponse,
    responses=error_responses(400, 404, 422, 503),
)
async def transfer_coins(
    resident_id: str,
    payload: TransferRequest,
    request: Request,
) -> TransferResponse:
    """Transfer coins from one resident to another."""
    state = get_simulation_state(request)

    from_agent = _find_agent(state, resident_id)
    if from_agent is None:
        raise api_error(404, "Resident not found", "resident_not_found")

    to_agent = _find_agent(state, payload.to_id)
    if to_agent is None:
        raise api_error(404, "Target resident not found", "resident_not_found")

    if from_agent.resident.coins < payload.amount:
        raise api_error(
            400,
            f"Insufficient coins: has {from_agent.resident.coins}, needs {payload.amount}",
            "insufficient_coins",
        )

    from_agent.resident.coins -= payload.amount
    to_agent.resident.coins += payload.amount

    return TransferResponse(
        from_resident=ResidentResponse(**asdict(from_agent.resident)),
        to_resident=ResidentResponse(**asdict(to_agent.resident)),
    )


# ---------------------------------------------------------------------------
# Resident chat — direct user → resident conversation
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)

class ChatResponse(BaseModel):
    reply: str
    resident_id: str
    resident_name: str


@router.post(
    "/{resident_id}/chat",
    response_model=ChatResponse,
    responses=error_responses(404, 422, 503),
)
async def chat_with_resident(
    resident_id: str,
    payload: ChatRequest,
    request: Request,
) -> ChatResponse:
    """User sends a message to a resident; the resident replies based on personality and memories."""
    import uuid
    from engine.types import Memory
    from backend.llm.client import chat_completion, has_runtime_api_key

    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND

    resident = agent.resident
    recent_memories = agent.memory_stream.retrieve("", k=5)
    memory_text = "\n".join(
        f"- {m.content}" for m in recent_memories
    ) or "\uff08\u65e0\u8fd1\u671f\u8bb0\u5fc6\uff09"

    system_prompt = (
        f"\u4f60\u662f{resident.name}\uff0c\u4e00\u4e2a\u865a\u62df\u5c0f\u9547\u7684\u5c45\u6c11\u3002\n"
        f"\u6027\u683c\uff1a{resident.personality}\n"
        f"\u5f53\u524d\u5fc3\u60c5\uff1a{resident.mood}\n"
        f"\u804c\u4e1a\uff1a{resident.occupation}\n"
        f"\u8fd1\u671f\u8bb0\u5fc6\uff1a\n{memory_text}\n\n"
        f"\u8bf7\u4ee5{resident.name}\u7684\u8eab\u4efd\u3001\u6027\u683c\u548c\u8bed\u6c14\u56de\u590d\u7528\u6237\u7684\u5bf9\u8bdd\u3002"
        f"\u56de\u590d\u7b80\u77ed\u81ea\u7136\uff081-3\u53e5\u8bdd\uff09\uff0c\u50cf\u771f\u4eba\u804a\u5929\u4e00\u6837\u3002"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": payload.message},
    ]

    reply: str | None = None
    if has_runtime_api_key():
        reply = await chat_completion(messages, max_tokens=150)

    if reply is None:
        reply = f"\uff08{resident.name}\u770b\u7740\u4f60\u5fae\u5fae\u4e00\u7b11\uff09\u55ef\u2026\u2026\u6211\u73b0\u5728\u5fc3\u60c5{resident.mood}\u3002"

    now = state.world.simulation_time()
    user_mem = Memory(
        id=str(uuid.uuid4()),
        content=f"\u6709\u4eba\u5bf9\u6211\u8bf4\uff1a\u201c{payload.message}\u201d",
        timestamp=now,
        importance=0.6,
        emotion="neutral",
        source="injected",
    )
    reply_mem = Memory(
        id=str(uuid.uuid4()),
        content=f"\u6211\u56de\u590d\u8bf4\uff1a\u201c{reply}\u201d",
        timestamp=now,
        importance=0.5,
        emotion=resident.mood,
        source="injected",
    )
    agent.memory_stream.add(user_mem)
    agent.memory_stream.add(reply_mem)

    return ChatResponse(
        reply=reply,
        resident_id=resident.id,
        resident_name=resident.name,
    )
