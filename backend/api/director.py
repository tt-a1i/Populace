"""Director's Console — directed intervention APIs for story operations.

Provides targeted ways to influence the simulation: emotion injection,
forced encounters, rumor spreading, and jealousy triggers.
"""
from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from backend.api.residents import _find_agent
from backend.api.schemas import ResidentResponse, api_error, error_responses
from backend.api.simulation import get_simulation_state
from engine.types import Memory, Relationship, RelationType

router = APIRouter(prefix="/api/director", tags=["director"])

_NOT_FOUND = api_error(404, "resident not found", "resident_not_found")

_VALID_EMOTIONS = {"happy", "sad", "angry", "fearful", "excited"}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class InjectEmotionRequest(BaseModel):
    resident_id: str
    emotion: str  # happy | sad | angry | fearful | excited
    reason: str = ""


class ForceEncounterRequest(BaseModel):
    resident_a_id: str
    resident_b_id: str
    location_building_id: str = ""


class ForceEncounterResponse(BaseModel):
    event_description: str
    location: str


class SpreadRumorRequest(BaseModel):
    target_id: str
    listener_id: str
    content: str
    is_positive: bool = False


class SpreadRumorResponse(BaseModel):
    ok: bool
    effect: str


class TriggerJealousyRequest(BaseModel):
    resident_id: str
    rival_id: str


# ---------------------------------------------------------------------------
# POST /api/director/inject-emotion
# ---------------------------------------------------------------------------


@router.post(
    "/inject-emotion",
    response_model=ResidentResponse,
    responses=error_responses(404, 422, 503),
)
async def inject_emotion(payload: InjectEmotionRequest, request: Request) -> ResidentResponse:
    """Force a mood change on a specific resident."""
    state = get_simulation_state(request)
    agent = _find_agent(state, payload.resident_id)
    if agent is None:
        raise _NOT_FOUND

    emotion = payload.emotion.strip().lower()
    if emotion not in _VALID_EMOTIONS:
        raise api_error(422, f"Invalid emotion '{payload.emotion}'. Must be one of: {', '.join(sorted(_VALID_EMOTIONS))}", "invalid_emotion")

    agent.resident.mood = emotion

    if payload.reason.strip():
        mem = Memory(
            id=str(uuid.uuid4()),
            content=payload.reason.strip(),
            timestamp=state.world.simulation_time(),
            importance=0.7,
            emotion=emotion,
            source="injected",
        )
        agent.memory_stream.add(mem)

    return ResidentResponse(**asdict(agent.resident))


# ---------------------------------------------------------------------------
# POST /api/director/force-encounter
# ---------------------------------------------------------------------------


@router.post(
    "/force-encounter",
    response_model=ForceEncounterResponse,
    responses=error_responses(404, 503),
)
async def force_encounter(payload: ForceEncounterRequest, request: Request) -> ForceEncounterResponse:
    """Teleport two residents to the same location and trigger dialogue."""
    state = get_simulation_state(request)
    agent_a = _find_agent(state, payload.resident_a_id)
    if agent_a is None:
        raise api_error(404, "resident A not found", "resident_not_found")
    agent_b = _find_agent(state, payload.resident_b_id)
    if agent_b is None:
        raise api_error(404, "resident B not found", "resident_not_found")

    # Find target building
    building = None
    if payload.location_building_id:
        building = state.world.get_building(payload.location_building_id)
        if building is None:
            raise api_error(404, f"building '{payload.location_building_id}' not found", "building_not_found")
    else:
        # Default: first cafe, fallback to first park
        for b in state.world.buildings:
            if b.type == "cafe":
                building = b
                break
        if building is None:
            for b in state.world.buildings:
                if b.type == "park":
                    building = b
                    break
        if building is None and state.world.buildings:
            building = state.world.buildings[0]

    if building is None:
        raise api_error(404, "no buildings available for encounter", "no_buildings")

    # Teleport both to building entrance
    bx, by = building.position

    # Leave current buildings if inside any
    if agent_a.resident.location is not None:
        state.world.leave_building(agent_a)
    if agent_b.resident.location is not None:
        state.world.leave_building(agent_b)

    agent_a.resident.x = bx
    agent_a.resident.y = by
    agent_a.current_path = []
    agent_b.resident.x = bx
    agent_b.resident.y = by
    agent_b.current_path = []
    state.world.mark_grid_index_dirty()

    name_a = agent_a.resident.name
    name_b = agent_b.resident.name
    building_name = building.name

    event_description = f"{name_a} 和 {name_b} 在 {building_name} 不期而遇"

    # Inject event into the world pending events
    from engine.types import Event as EngineEvent

    state.world.pending_events.append(
        EngineEvent(
            id=str(uuid.uuid4()),
            description=event_description,
            timestamp=state.world.simulation_time(),
            source="director",
        )
    )

    return ForceEncounterResponse(
        event_description=event_description,
        location=building_name,
    )


# ---------------------------------------------------------------------------
# POST /api/director/spread-rumor
# ---------------------------------------------------------------------------


@router.post(
    "/spread-rumor",
    response_model=SpreadRumorResponse,
    responses=error_responses(404, 503),
)
async def spread_rumor(payload: SpreadRumorRequest, request: Request) -> SpreadRumorResponse:
    """Targeted gossip injection: make a resident hear a rumor about another."""
    state = get_simulation_state(request)
    target_agent = _find_agent(state, payload.target_id)
    if target_agent is None:
        raise api_error(404, "target resident not found", "resident_not_found")
    listener_agent = _find_agent(state, payload.listener_id)
    if listener_agent is None:
        raise api_error(404, "listener resident not found", "resident_not_found")

    # Create gossip memory on the listener
    mem = Memory(
        id=str(uuid.uuid4()),
        content=f"[八卦] {payload.content}",
        timestamp=state.world.simulation_time(),
        importance=0.6,
        emotion="curious" if payload.is_positive else "suspicious",
        source="gossip",
    )
    listener_agent.memory_stream.add(mem)

    # Nudge listener's relationship with target
    delta = 0.08 if payload.is_positive else -0.06
    effect = "positive" if payload.is_positive else "negative"

    existing = state.world.get_relationship(payload.listener_id, payload.target_id)
    if existing is not None:
        new_intensity = max(0.0, min(1.0, existing.intensity + delta))
        existing_type = existing.type
        # If negative and intensity goes high enough, potentially shift toward dislike/rivalry
        state.world.set_relationship(
            Relationship(
                from_id=payload.listener_id,
                to_id=payload.target_id,
                type=existing_type,
                intensity=new_intensity,
                since=existing.since,
                familiarity=existing.familiarity,
                reason=existing.reason,
            )
        )
    else:
        # Create a new "knows" relationship with the delta as base intensity
        base = max(0.0, 0.3 + delta)
        state.world.set_relationship(
            Relationship(
                from_id=payload.listener_id,
                to_id=payload.target_id,
                type=RelationType.knows,
                intensity=base,
            )
        )

    return SpreadRumorResponse(ok=True, effect=effect)


# ---------------------------------------------------------------------------
# POST /api/director/trigger-jealousy
# ---------------------------------------------------------------------------


@router.post(
    "/trigger-jealousy",
    response_model=ResidentResponse,
    responses=error_responses(404, 503),
)
async def trigger_jealousy(payload: TriggerJealousyRequest, request: Request) -> ResidentResponse:
    """Make a resident jealous of another's relationships."""
    state = get_simulation_state(request)
    agent = _find_agent(state, payload.resident_id)
    if agent is None:
        raise api_error(404, "resident not found", "resident_not_found")
    rival_agent = _find_agent(state, payload.rival_id)
    if rival_agent is None:
        raise api_error(404, "rival resident not found", "resident_not_found")

    # Set mood to angry
    agent.resident.mood = "angry"

    # Inject jealousy memory
    name = agent.resident.name
    rival_name = rival_agent.resident.name
    mem = Memory(
        id=str(uuid.uuid4()),
        content=f"{name} 看到了 {rival_name} 和别人相处很好，心生嫉妒",
        timestamp=state.world.simulation_time(),
        importance=0.8,
        emotion="angry",
        source="injected",
    )
    agent.memory_stream.add(mem)

    # Nudge relationship toward rivalry
    existing = state.world.get_relationship(payload.resident_id, payload.rival_id)
    if existing is not None:
        new_intensity = min(1.0, existing.intensity + 0.1)
        new_type = existing.type
        # If intensity crosses 0.7 threshold from a "knows" relationship, shift to rivalry
        if new_intensity >= 0.7 and existing.type == RelationType.knows:
            new_type = RelationType.rivalry
        state.world.set_relationship(
            Relationship(
                from_id=payload.resident_id,
                to_id=payload.rival_id,
                type=new_type,
                intensity=new_intensity,
                since=existing.since,
                familiarity=existing.familiarity,
                reason=existing.reason,
            )
        )
    else:
        state.world.set_relationship(
            Relationship(
                from_id=payload.resident_id,
                to_id=payload.rival_id,
                type=RelationType.rivalry,
                intensity=0.4,
            )
        )

    return ResidentResponse(**asdict(agent.resident))
