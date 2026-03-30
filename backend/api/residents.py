from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from backend.api.schemas import (
    DiaryEntryResponse,
    EducationResponse,
    PetResponse,
    ResidentHealthResponse,
    ResidentMemoryResponse,
    ResidentEducationResponse,
    ResidentJobResponse,
    ResidentMoodLogEntryResponse,
    ResidentReputationResponse,
    ResidentReflectionResponse,
    ResidentRelationshipResponse,
    ResidentResponse,
    ResidentRomanceResponse,
    RomancePartnerInfo,
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


@router.get(
    "/{resident_id}/job",
    response_model=ResidentJobResponse,
    responses=error_responses(404, 503),
)
async def get_resident_job(resident_id: str, request: Request) -> ResidentJobResponse:
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    resident = agent.resident
    return ResidentJobResponse(
        resident_id=resident.id,
        resident_name=resident.name,
        wallet=float(getattr(resident, "wallet", 0.0)),
        job=asdict(getattr(resident, "job", None)) if getattr(resident, "job", None) is not None else {},
    )


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
                if field_name == "mood":
                    state.world.set_resident_mood(agent, value or "neutral", "event")
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
async def get_resident_memories(
    resident_id: str,
    request: Request,
    page: int = 1,
    page_size: int = 20,
    memory_type: str | None = None,
) -> list[ResidentMemoryResponse]:
    """Return resident memoir entries with optional pagination and type filtering."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    resident = agent.resident
    state.world._ensure_resident_memories(resident)
    resident_memory_ids = {memory.id for memory in resident.memories}
    combined = [*resident.memories]
    combined.extend(memory for memory in agent.memory_stream.all if memory.id not in resident_memory_ids)
    memories = list(reversed(combined))
    if memory_type:
        memories = [memory for memory in memories if memory.type == memory_type]
    safe_page = max(1, page)
    safe_page_size = max(1, min(100, page_size))
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    return [ResidentMemoryResponse(**asdict(mem)) for mem in memories[start:end]]


@router.get(
    "/{resident_id}/mood-log",
    response_model=list[ResidentMoodLogEntryResponse],
    responses=error_responses(404, 503),
)
async def get_resident_mood_log(resident_id: str, request: Request) -> list[ResidentMoodLogEntryResponse]:
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    return [ResidentMoodLogEntryResponse(**asdict(entry)) for entry in agent.resident.mood_history]


@router.get(
    "/{resident_id}/reputation",
    response_model=ResidentReputationResponse,
    responses=error_responses(404, 503),
)
async def get_resident_reputation(resident_id: str, request: Request) -> ResidentReputationResponse:
    state = get_simulation_state(request)
    profile = state.world.get_reputation_profile(resident_id)
    if profile is None:
        raise _NOT_FOUND
    return ResidentReputationResponse(**profile)


@router.get(
    "/{resident_id}/education",
    response_model=ResidentEducationResponse,
    responses=error_responses(404, 503),
)
async def get_resident_education(resident_id: str, request: Request) -> ResidentEducationResponse:
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND

    state.world.ensure_resident_education(agent.resident)
    return ResidentEducationResponse(
        resident_id=agent.resident.id,
        resident_name=agent.resident.name,
        education=EducationResponse(**asdict(agent.resident.education)),
    )


@router.get(
    "/{resident_id}/pets",
    response_model=list[PetResponse],
    responses=error_responses(404, 503),
)
async def get_resident_pets(resident_id: str, request: Request) -> list[PetResponse]:
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    return [PetResponse(**asdict(pet)) for pet in state.world.list_resident_pets(resident_id)]


@router.get(
    "/{resident_id}/health",
    response_model=ResidentHealthResponse,
    responses=error_responses(404, 503),
)
async def get_resident_health(resident_id: str, request: Request) -> ResidentHealthResponse:
    state = get_simulation_state(request)
    profile = state.world.get_resident_health_profile(resident_id)
    if profile is None:
        raise _NOT_FOUND
    return ResidentHealthResponse(**profile)


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


class ResidentSkillsResponse(BaseModel):
    resident_id: str
    resident_name: str
    skills: dict[str, float] = Field(default_factory=dict)


class TradeRequest(BaseModel):
    buyer_id: str
    item_name: str
    quantity: int = 1

    @field_validator("item_name")
    @classmethod
    def item_name_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("item_name must not be empty")
        return cleaned

    @field_validator("quantity")
    @classmethod
    def quantity_positive(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("quantity must be positive")
        return value


class TradeResponse(BaseModel):
    seller_resident: ResidentResponse
    buyer_resident: ResidentResponse
    item_name: str
    quantity: int
    total_price: int


def _friendship_discount(state: Any, seller_id: str, buyer_id: str) -> float:
    relationship_scores: list[float] = []
    for relation in (
        state.world.get_relationship(seller_id, buyer_id),
        state.world.get_relationship(buyer_id, seller_id),
    ):
        if relation is None:
            continue
        multiplier = 1.0
        if relation.type.value == "love":
            multiplier = 1.0
        elif relation.type.value in {"friendship", "trust"}:
            multiplier = 0.85
        else:
            multiplier = 0.35
        relationship_scores.append(max(0.0, relation.intensity) * multiplier)

    if not relationship_scores:
        return 0.0

    closeness = min(1.0, sum(relationship_scores) / len(relationship_scores))
    return round(min(0.3, closeness * 0.3), 2)


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
    "/{resident_id}/skills",
    response_model=ResidentSkillsResponse,
    responses=error_responses(404, 503),
)
async def get_resident_skills(resident_id: str, request: Request) -> ResidentSkillsResponse:
    """Return the resident's current skill levels."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND

    return ResidentSkillsResponse(
        resident_id=agent.resident.id,
        resident_name=agent.resident.name,
        skills=dict(sorted(agent.resident.skills.items())),
    )


@router.post(
    "/{resident_id}/trade",
    response_model=TradeResponse,
    responses=error_responses(400, 404, 422, 503),
)
async def trade_resident_item(
    resident_id: str,
    payload: TradeRequest,
    request: Request,
) -> TradeResponse:
    """Trade an inventory item from one resident to another with relationship-based discounts."""
    state = get_simulation_state(request)
    seller = _find_agent(state, resident_id)
    if seller is None:
        raise _NOT_FOUND

    buyer = _find_agent(state, payload.buyer_id)
    if buyer is None:
        raise api_error(404, "buyer resident not found", "resident_not_found")
    if buyer.resident.id == seller.resident.id:
        raise api_error(400, "cannot trade with self", "trade_invalid")

    item = next(
        (inventory_item for inventory_item in seller.resident.inventory if inventory_item.name == payload.item_name),
        None,
    )
    if item is None or item.quantity < payload.quantity:
        raise api_error(400, "item not available", "item_not_available")

    unit_value = max(1, int(item.value or 1))
    discount = _friendship_discount(state, seller.resident.id, buyer.resident.id)
    total_price = max(1, round(unit_value * payload.quantity * (1.0 - discount)))

    if buyer.resident.coins < total_price:
        raise api_error(400, "buyer has insufficient coins", "insufficient_coins")

    buyer.resident.coins -= total_price
    seller.resident.coins += total_price
    item.quantity -= payload.quantity
    if item.quantity <= 0:
        seller.resident.inventory = [
            inventory_item
            for inventory_item in seller.resident.inventory
            if inventory_item.name != payload.item_name
        ]
    state.world.add_inventory_item(
        buyer.resident,
        item_name=payload.item_name,
        quantity=payload.quantity,
        value=unit_value,
    )

    state._trade_history.append(
        {
            "tick": state.world.current_tick,
            "seller_id": seller.resident.id,
            "buyer_id": buyer.resident.id,
            "item_name": payload.item_name,
            "quantity": payload.quantity,
            "unit_price": unit_value,
            "discount": discount,
            "total_price": total_price,
        }
    )

    return TradeResponse(
        seller_resident=ResidentResponse(**asdict(seller.resident)),
        buyer_resident=ResidentResponse(**asdict(buyer.resident)),
        item_name=payload.item_name,
        quantity=payload.quantity,
        total_price=total_price,
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
async def get_resident_diary(
    resident_id: str,
    request: Request,
    day: int | None = None,
    limit: int = 30,
    offset: int = 0,
) -> list[DiaryEntryResponse]:
    """Return diary entries, newest first, with optional day filter and pagination."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND
    diary_entries = list(agent.resident.diary)
    if day is not None:
        diary_entries = [entry for entry in diary_entries if entry.day == day]

    diary_entries.sort(key=lambda entry: (entry.day, entry.tick, entry.id), reverse=True)
    page = diary_entries[max(0, offset): max(0, offset) + max(1, limit)]
    return [DiaryEntryResponse(**asdict(entry)) for entry in page]


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
    if "第一次" in payload.content or "初次" in payload.content:
        memory_type = "first_meeting"
    elif "礼物" in payload.content or "收到" in payload.content:
        memory_type = "gift"
    elif "节" in payload.content or "祭" in payload.content:
        memory_type = "festival"
    elif "争吵" in payload.content or "吵" in payload.content:
        memory_type = "argument"
    elif "失去" in payload.content or "离开" in payload.content:
        memory_type = "loss"
    else:
        memory_type = "achievement"
    mem = Memory(
        id=str(uuid.uuid4()),
        content=payload.content,
        timestamp=state.world.simulation_time(),
        importance=max(0.0, min(1.0, payload.importance)),
        emotion=payload.emotion,
        tick=state.world.current_tick,
        type=memory_type,
        emotional_weight=max(0.1, min(1.0, payload.importance)),
        source="injected",
    )
    agent.memory_stream.add(mem)
    state.world.remember_resident_memory(
        agent.resident,
        memory_type=mem.type,
        content=payload.content,
        emotional_weight=mem.emotional_weight,
        related_resident_ids=[],
    )
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
    siblings: list[FamilyMemberResponse] = Field(default_factory=list)
    spouse: FamilyMemberResponse | None = None
    children: list[FamilyMemberResponse] = Field(default_factory=list)


class ResidentFamilyResponse(BaseModel):
    family_name: str
    resident: FamilyMemberResponse
    members: list[FamilyMemberResponse] = Field(default_factory=list)
    tree: FamilyTreeResponse


@router.get(
    "/{resident_id}/family",
    response_model=ResidentFamilyResponse,
    responses=error_responses(404, 503),
)
async def get_resident_family(resident_id: str, request: Request) -> ResidentFamilyResponse:
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND

    tree = await get_family_tree(resident_id, request)
    family_members = state.world.get_family_members(agent.resident)
    members = [
        FamilyMemberResponse(
            id=member.id,
            name=member.name,
            age_days=member.age_days,
            deceased=False,
            relation="self" if member.id == resident_id else _family_relation_label(agent.resident, member),
        )
        for member in sorted(family_members, key=lambda item: (-item.age_days, item.name))
    ]
    return ResidentFamilyResponse(
        family_name=agent.resident.family.family_name,
        resident=tree.root,
        members=members,
        tree=tree,
    )


@router.get(
    "/{resident_id}/family-tree",
    response_model=FamilyTreeResponse,
    responses=error_responses(404, 503),
)
async def get_family_tree(resident_id: str, request: Request) -> FamilyTreeResponse:
    """Build a family tree for a resident from explicit family links."""
    state = get_simulation_state(request)
    agent = _find_agent(state, resident_id)
    if agent is None:
        raise _NOT_FOUND

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

    family = agent.resident.family
    parents = [_member(parent_id, "parent") for parent_id in family.parent_ids]
    siblings = [_member(sibling_id, "sibling") for sibling_id in family.sibling_ids]
    children = [_member(child_id, "child") for child_id in family.children_ids]
    spouse = _member(family.partner_id, "spouse") if family.partner_id else None

    return FamilyTreeResponse(root=root, parents=parents, siblings=siblings, spouse=spouse, children=children)


def _family_relation_label(root: Any, other: Any) -> str:
    if other.id in root.family.parent_ids:
        return "parent"
    if other.id in root.family.children_ids:
        return "child"
    if other.id in root.family.sibling_ids:
        return "sibling"
    if other.id == root.family.partner_id:
        return "spouse"
    return "family"


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


@router.get(
    "/{resident_id}/romance",
    response_model=ResidentRomanceResponse,
    responses=error_responses(404, 503),
)
async def get_resident_romance(resident_id: str, request: Request) -> ResidentRomanceResponse:
    from engine.romance import get_resident_romance as _get_romance

    state = get_simulation_state(request)
    agent = state.world.get_agent(resident_id)
    if agent is None:
        raise _NOT_FOUND
    data = _get_romance(state.world, resident_id)
    partner = None
    if data["partner"] is not None:
        partner = RomancePartnerInfo(**data["partner"])
    return ResidentRomanceResponse(
        relationship_status=data["relationship_status"],
        partner=partner,
        love_intensity=data["love_intensity"],
    )


class ResidentLifeGoalResponse(BaseModel):
    type: str
    name: str
    description: str
    icon: str = "🎯"
    progress: float = 0.0
    target: float = 1.0
    percentage: float = 0.0
    completed: bool = False
    completed_tick: int | None = None
    reward: str = ""


@router.get(
    "/{resident_id}/goals",
    response_model=Optional[ResidentLifeGoalResponse],
    responses=error_responses(404, 503),
)
async def get_resident_goals(resident_id: str, request: Request) -> Optional[ResidentLifeGoalResponse]:
    from engine.goals import get_resident_goal_view

    state = get_simulation_state(request)
    found = any(agent.resident.id == resident_id for agent in state.world.agents)
    if not found:
        raise _NOT_FOUND
    data = get_resident_goal_view(state, resident_id)
    if data is None:
        return None
    return ResidentLifeGoalResponse(**data)


class WishResponse(BaseModel):
    index: int
    type: str
    description: str
    priority: float = 0.5
    fulfilled: bool = False
    fulfilled_tick: int | None = None
    target_id: str | None = None


class FulfillWishResponse(BaseModel):
    fulfilled: bool = False
    already_fulfilled: bool = False
    wish: WishResponse


@router.get(
    "/{resident_id}/wishes",
    response_model=list[WishResponse],
    responses=error_responses(404, 503),
)
async def get_resident_wishes(resident_id: str, request: Request) -> list[WishResponse]:
    from engine.wishes import get_resident_wishes as _get_wishes

    state = get_simulation_state(request)
    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            return [WishResponse(**w) for w in _get_wishes(agent.resident)]
    raise _NOT_FOUND


@router.post(
    "/{resident_id}/wishes/{wish_index}/fulfill",
    response_model=FulfillWishResponse,
    responses=error_responses(400, 404, 503),
)
async def fulfill_resident_wish(resident_id: str, wish_index: int, request: Request) -> FulfillWishResponse:
    from engine.wishes import fulfill_wish_by_god

    state = get_simulation_state(request)
    found = any(agent.resident.id == resident_id for agent in state.world.agents)
    if not found:
        raise _NOT_FOUND
    result = fulfill_wish_by_god(state, resident_id, wish_index)
    if result is None:
        raise api_error(400, "Invalid wish index", "invalid_wish_index")
    return FulfillWishResponse(**result)


class TravelEntryResponse(BaseModel):
    destination: str = ""
    destination_type: str = ""
    tick_departed: int = 0
    tick_returned: int = 0
    souvenirs: list[str] = Field(default_factory=list)
    story: str = ""


@router.get(
    "/{resident_id}/travels",
    response_model=list[TravelEntryResponse],
    responses=error_responses(404, 503),
)
async def get_resident_travels(resident_id: str, request: Request) -> list[TravelEntryResponse]:
    from engine.travel import get_resident_travels as _get_travels

    state = get_simulation_state(request)
    agent = state.world.get_agent(resident_id)
    if agent is None:
        raise _NOT_FOUND
    return [TravelEntryResponse(**entry) for entry in _get_travels(state.world, resident_id)]
