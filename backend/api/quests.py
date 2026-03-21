"""Quest system — provides explicit goals for users watching the simulation.

Defines 5 built-in quests with progress tracking, time limits, and win conditions.
Called each tick from ``SimulationState._tick()`` via ``check_quest_progress``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.api.schemas import api_error, error_responses
from backend.api.simulation import get_simulation_state


# ---------------------------------------------------------------------------
# Quest status enum
# ---------------------------------------------------------------------------


class QuestStatus(str, Enum):
    available = "available"
    active = "active"
    completed = "completed"
    failed = "failed"


# ---------------------------------------------------------------------------
# Quest definitions
# ---------------------------------------------------------------------------


@dataclass
class QuestDefinition:
    id: str
    name: str
    description: str
    icon: str
    time_limit_ticks: int  # 0 = no limit
    check_fn_name: str  # name of the progress check function
    requires_params: bool = False


QUEST_DEFINITIONS: list[QuestDefinition] = [
    QuestDefinition(
        id="matchmaker",
        name="红娘",
        description="让指定两人建立爱情关系",
        icon="💕",
        time_limit_ticks=300,
        check_fn_name="_check_matchmaker",
        requires_params=True,
    ),
    QuestDefinition(
        id="troublemaker",
        name="搅局者",
        description="制造 2 段竞争关系",
        icon="⚔️",
        time_limit_ticks=400,
        check_fn_name="_check_troublemaker",
    ),
    QuestDefinition(
        id="gossip_master",
        name="谣言大师",
        description="让一条谣言传播到 4 个居民",
        icon="🗣️",
        time_limit_ticks=200,
        check_fn_name="_check_gossip_master",
        requires_params=True,
    ),
    QuestDefinition(
        id="guardian",
        name="守护者",
        description="暴风雨中让所有居民找到庇护所",
        icon="🛡️",
        time_limit_ticks=0,
        check_fn_name="_check_guardian",
    ),
    QuestDefinition(
        id="social_butterfly",
        name="社交达人",
        description="让一个居民拥有 5 段友谊",
        icon="🦋",
        time_limit_ticks=500,
        check_fn_name="_check_social_butterfly",
        requires_params=True,
    ),
]

_QUEST_MAP: dict[str, QuestDefinition] = {q.id: q for q in QUEST_DEFINITIONS}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class QuestInfo(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    status: str  # available | active | completed
    requires_params: bool


class QuestStartRequest(BaseModel):
    params: dict[str, str] = {}


class QuestStartResponse(BaseModel):
    ok: bool
    quest_id: str
    message: str


class ActiveQuestResponse(BaseModel):
    quest_id: str
    name: str
    icon: str
    description: str
    progress: float  # 0.0 to 1.0
    progress_text: str  # "关系强度: 0.45 / 0.85"
    remaining_ticks: int  # -1 if no limit
    status: str


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/quests", tags=["quests"])


@router.get("", response_model=list[QuestInfo], responses=error_responses(503))
async def list_quests(request: Request) -> list[QuestInfo]:
    """Return all quest definitions with current status."""
    state = get_simulation_state(request)
    active_ids = {q["quest_id"] for q in state._active_quests if q["status"] == "active"}
    completed_ids = set(state._completed_quests)

    result: list[QuestInfo] = []
    for qdef in QUEST_DEFINITIONS:
        if qdef.id in active_ids:
            status = "active"
        elif qdef.id in completed_ids:
            status = "completed"
        else:
            status = "available"
        result.append(QuestInfo(
            id=qdef.id,
            name=qdef.name,
            description=qdef.description,
            icon=qdef.icon,
            status=status,
            requires_params=qdef.requires_params,
        ))
    return result


@router.post(
    "/{quest_id}/start",
    response_model=QuestStartResponse,
    responses=error_responses(400, 404, 503),
)
async def start_quest(
    quest_id: str,
    payload: QuestStartRequest,
    request: Request,
) -> QuestStartResponse:
    """Start a quest. Some quests need params (e.g. matchmaker needs two resident IDs)."""
    state = get_simulation_state(request)
    qdef = _QUEST_MAP.get(quest_id)
    if qdef is None:
        raise api_error(404, f"Quest '{quest_id}' not found", "quest_not_found")

    # Check if already active
    for q in state._active_quests:
        if q["quest_id"] == quest_id and q["status"] == "active":
            raise api_error(400, f"Quest '{quest_id}' is already active", "quest_already_active")

    # Validate params for quests that require them
    if qdef.requires_params and not payload.params:
        raise api_error(400, f"Quest '{quest_id}' requires params", "quest_params_required")

    quest_state: dict[str, Any] = {
        "quest_id": quest_id,
        "params": dict(payload.params),
        "started_tick": state.world.current_tick,
        "status": "active",
        "time_limit": qdef.time_limit_ticks,
        "progress": 0.0,
        "progress_text": "",
    }
    state._active_quests.append(quest_state)

    return QuestStartResponse(
        ok=True,
        quest_id=quest_id,
        message=f"Quest '{qdef.name}' started",
    )


@router.get("/active", response_model=list[ActiveQuestResponse], responses=error_responses(503))
async def get_active_quests(request: Request) -> list[ActiveQuestResponse]:
    """Return currently active quests with progress."""
    state = get_simulation_state(request)
    result: list[ActiveQuestResponse] = []
    for q in state._active_quests:
        if q["status"] != "active":
            continue
        qdef = _QUEST_MAP.get(q["quest_id"])
        if qdef is None:
            continue
        time_limit = q.get("time_limit", 0)
        elapsed = state.world.current_tick - q["started_tick"]
        remaining = (time_limit - elapsed) if time_limit > 0 else -1
        result.append(ActiveQuestResponse(
            quest_id=q["quest_id"],
            name=qdef.name,
            icon=qdef.icon,
            description=qdef.description,
            progress=q.get("progress", 0.0),
            progress_text=q.get("progress_text", ""),
            remaining_ticks=remaining,
            status=q["status"],
        ))
    return result


@router.post(
    "/{quest_id}/abandon",
    responses=error_responses(404, 503),
)
async def abandon_quest(quest_id: str, request: Request) -> dict[str, Any]:
    """Abandon an active quest."""
    state = get_simulation_state(request)
    for q in state._active_quests:
        if q["quest_id"] == quest_id and q["status"] == "active":
            q["status"] = "failed"
            return {"ok": True, "quest_id": quest_id, "message": "Quest abandoned"}
    raise api_error(404, f"No active quest '{quest_id}' found", "quest_not_active")


# ---------------------------------------------------------------------------
# Progress checking — called every tick from _tick()
# ---------------------------------------------------------------------------


def check_quest_progress(state: Any) -> list[dict[str, Any]]:
    """Check all active quests, update progress, complete/fail as needed.

    Returns a list of event dicts (quest_id + event type).
    """
    if not hasattr(state, "_active_quests"):
        return []

    results: list[dict[str, Any]] = []
    for quest in state._active_quests:
        if quest["status"] != "active":
            continue

        # Check time limit
        elapsed = state.world.current_tick - quest["started_tick"]
        time_limit = quest.get("time_limit", 0)
        if time_limit > 0 and elapsed > time_limit:
            quest["status"] = "failed"
            results.append({"quest_id": quest["quest_id"], "event": "failed"})
            continue

        # Compute progress
        progress = _compute_progress(state, quest)
        quest["progress"] = progress["value"]
        quest["progress_text"] = progress["text"]

        if progress["completed"]:
            quest["status"] = "completed"
            if not hasattr(state, "_completed_quests"):
                state._completed_quests = []
            state._completed_quests.append(quest["quest_id"])
            results.append({"quest_id": quest["quest_id"], "event": "completed"})

    return results


def _compute_progress(state: Any, quest: dict[str, Any]) -> dict[str, Any]:
    """Dispatch to the correct progress checker for the quest type."""
    quest_id = quest["quest_id"]
    checkers = {
        "matchmaker": _check_matchmaker,
        "troublemaker": _check_troublemaker,
        "gossip_master": _check_gossip_master,
        "guardian": _check_guardian,
        "social_butterfly": _check_social_butterfly,
    }
    checker = checkers.get(quest_id)
    if checker is None:
        return {"value": 0.0, "text": "", "completed": False}
    return checker(state, quest)


def _check_matchmaker(state: Any, quest: dict[str, Any]) -> dict[str, Any]:
    """Check relationship between two specified residents."""
    params = quest.get("params", {})
    a_id = params.get("resident_a", "")
    b_id = params.get("resident_b", "")

    from engine.types import RelationType

    rel = state.world.relationships.get((a_id, b_id))
    if rel is None:
        rel = state.world.relationships.get((b_id, a_id))

    if rel is None:
        return {"value": 0.0, "text": "关系强度: 0.00 / 0.85", "completed": False}

    intensity = float(rel.intensity)
    is_love = (
        hasattr(rel.type, "value") and rel.type.value == "love"
    ) or str(rel.type) == "love"
    completed = is_love or intensity >= 0.85
    value = min(1.0, intensity / 0.85)
    return {
        "value": value,
        "text": f"关系强度: {intensity:.2f} / 0.85",
        "completed": completed,
    }


def _check_troublemaker(state: Any, quest: dict[str, Any]) -> dict[str, Any]:
    """Count rivalry relationships."""
    rivalry_count = 0
    for rel in state.world.relationships.values():
        rel_type = rel.type.value if hasattr(rel.type, "value") else str(rel.type)
        if rel_type == "rivalry":
            rivalry_count += 1

    # Each pair has two directed edges, count unique pairs
    pair_count = rivalry_count // 2 if rivalry_count > 1 else rivalry_count
    # But for simplicity, count directed edges as individual rivalries
    value = min(1.0, rivalry_count / 2.0)
    completed = rivalry_count >= 2
    return {
        "value": value,
        "text": f"竞争关系数: {rivalry_count} / 2",
        "completed": completed,
    }


def _check_gossip_master(state: Any, quest: dict[str, Any]) -> dict[str, Any]:
    """Count residents with memories containing the tracked keyword."""
    params = quest.get("params", {})
    keyword = params.get("keyword", "")

    if not keyword:
        return {"value": 0.0, "text": "关键词: (未设置)", "completed": False}

    count = 0
    for agent in state.world.agents:
        for mem in agent.memory_stream.all:
            if keyword in mem.content:
                count += 1
                break  # count each resident only once

    value = min(1.0, count / 4.0)
    completed = count >= 4
    return {
        "value": value,
        "text": f"传播居民数: {count} / 4",
        "completed": completed,
    }


def _check_guardian(state: Any, quest: dict[str, Any]) -> dict[str, Any]:
    """During storm, check % of residents indoors."""
    from engine.types import WeatherType

    weather = state.world.weather
    is_stormy = (
        weather is WeatherType.stormy
        or (hasattr(weather, "value") and weather.value == "stormy")
    )

    if not is_stormy:
        return {"value": 0.0, "text": "等待暴风雨...", "completed": False}

    total = len(state.world.agents)
    if total == 0:
        return {"value": 1.0, "text": "无居民", "completed": True}

    indoors = sum(1 for a in state.world.agents if a.resident.location is not None)
    pct = indoors / total
    completed = indoors == total
    return {
        "value": pct,
        "text": f"庇护居民: {indoors} / {total}",
        "completed": completed,
    }


def _check_social_butterfly(state: Any, quest: dict[str, Any]) -> dict[str, Any]:
    """Count friendships for specified resident."""
    params = quest.get("params", {})
    resident_id = params.get("resident_id", "")

    friendship_count = 0
    for (from_id, to_id), rel in state.world.relationships.items():
        rel_type = rel.type.value if hasattr(rel.type, "value") else str(rel.type)
        if rel_type == "friendship" and (from_id == resident_id or to_id == resident_id):
            friendship_count += 1

    value = min(1.0, friendship_count / 5.0)
    completed = friendship_count >= 5
    return {
        "value": value,
        "text": f"友谊数: {friendship_count} / 5",
        "completed": completed,
    }
