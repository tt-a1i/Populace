"""Custom simulation rules engine.

Rules are user-defined condition→action pairs evaluated each tick.
Conditions are checked against resident state and world state.
Actions modify resident attributes when conditions are met.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from backend.api.schemas import api_error, error_responses
from backend.api.simulation import get_simulation_state


router = APIRouter(prefix="/api/simulation/rules", tags=["rules"])


# ---------------------------------------------------------------------------
# Rule data model
# ---------------------------------------------------------------------------

class RuleCondition(BaseModel):
    field: str = Field(..., description="e.g. 'mood', 'energy', 'coins', 'weather', 'occupation'")
    operator: str = Field(..., description="eq, neq, lt, lte, gt, gte, contains")
    value: str = Field(..., description="Comparison value (cast appropriately at eval time)")


class RuleAction(BaseModel):
    action: str = Field(..., description="e.g. 'set_mood', 'adjust_energy', 'adjust_coins', 'move_home'")
    value: str = Field(default="", description="Action parameter (mood name, delta amount, etc.)")


class CreateRuleRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=300)
    conditions: list[RuleCondition] = Field(..., min_length=1)
    actions: list[RuleAction] = Field(..., min_length=1)
    enabled: bool = True


class RuleResponse(BaseModel):
    id: str
    name: str
    description: str
    conditions: list[RuleCondition]
    actions: list[RuleAction]
    enabled: bool
    times_fired: int


class ToggleRuleRequest(BaseModel):
    enabled: bool


# ---------------------------------------------------------------------------
# In-memory rule store (attached to SimulationState)
# ---------------------------------------------------------------------------

class SimulationRule:
    def __init__(self, rule_id: str, name: str, description: str,
                 conditions: list[RuleCondition], actions: list[RuleAction],
                 enabled: bool = True):
        self.id = rule_id
        self.name = name
        self.description = description
        self.conditions = conditions
        self.actions = actions
        self.enabled = enabled
        self.times_fired = 0

    def to_response(self) -> RuleResponse:
        return RuleResponse(
            id=self.id, name=self.name, description=self.description,
            conditions=self.conditions, actions=self.actions,
            enabled=self.enabled, times_fired=self.times_fired,
        )


def _get_rules_store(state: Any) -> list[SimulationRule]:
    """Lazily attach a rules list to the simulation state."""
    if not hasattr(state, '_custom_rules'):
        state._custom_rules = []
    return state._custom_rules


# ---------------------------------------------------------------------------
# Rule evaluation
# ---------------------------------------------------------------------------

_MOOD_SCORE = {
    "ecstatic": 1.0, "excited": 0.8, "happy": 1.0, "content": 0.3,
    "neutral": 0.0, "calm": 0.1, "tired": -0.2,
    "sad": -1.0, "angry": -0.9, "fearful": -0.7,
}


def _resolve_field(resident: Any, world: Any, field: str) -> Any:
    """Resolve a condition field to a value."""
    if field == "weather":
        return getattr(world, "weather", "sunny")
    if field == "season":
        return getattr(world, "season", "spring")
    if field == "mood":
        return getattr(resident, "mood", "neutral")
    if field == "mood_score":
        return _MOOD_SCORE.get(getattr(resident, "mood", "neutral"), 0.0)
    if field == "energy":
        return getattr(resident, "energy", 1.0)
    if field == "coins":
        return getattr(resident, "coins", 0)
    if field == "occupation":
        return getattr(resident, "occupation", "unemployed")
    if field == "name":
        return getattr(resident, "name", "")
    return None


def _cast_value(value: str, reference: Any) -> Any:
    """Cast string value to match the reference type."""
    if isinstance(reference, float):
        try:
            return float(value)
        except ValueError:
            return 0.0
    if isinstance(reference, int):
        try:
            return int(value)
        except ValueError:
            return 0
    return value


def _check_condition(cond: RuleCondition, resident: Any, world: Any) -> bool:
    actual = _resolve_field(resident, world, cond.field)
    if actual is None:
        return False
    expected = _cast_value(cond.value, actual)
    op = cond.operator
    if op == "eq":
        return actual == expected
    if op == "neq":
        return actual != expected
    if op == "lt":
        return actual < expected
    if op == "lte":
        return actual <= expected
    if op == "gt":
        return actual > expected
    if op == "gte":
        return actual >= expected
    if op == "contains":
        return str(expected) in str(actual)
    return False


def _apply_action(action: RuleAction, agent: Any, world: Any) -> None:
    resident = agent.resident
    if action.action == "set_mood":
        world.set_resident_mood(agent, action.value or "neutral", "event")
    elif action.action == "adjust_energy":
        try:
            delta = float(action.value)
        except ValueError:
            delta = 0.0
        resident.energy = max(0.0, min(1.0, resident.energy + delta))
    elif action.action == "adjust_coins":
        try:
            delta = int(action.value)
        except ValueError:
            delta = 0
        resident.coins = max(0, resident.coins + delta)
    elif action.action == "move_home":
        if resident.home_building_id:
            resident.location = resident.home_building_id


def evaluate_rules(state: Any) -> int:
    """Evaluate all enabled rules against all agents. Returns total fires."""
    rules = _get_rules_store(state)
    total_fired = 0
    for rule in rules:
        if not rule.enabled:
            continue
        for agent in state.world.agents:
            if all(_check_condition(c, agent.resident, state.world) for c in rule.conditions):
                for action in rule.actions:
                    _apply_action(action, agent, state.world)
                rule.times_fired += 1
                total_fired += 1
    return total_fired


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[RuleResponse])
async def list_rules(request: Request) -> list[RuleResponse]:
    """List all custom simulation rules."""
    state = get_simulation_state(request)
    rules = _get_rules_store(state)
    return [r.to_response() for r in rules]


@router.post("", response_model=RuleResponse, responses=error_responses(422))
async def create_rule(payload: CreateRuleRequest, request: Request) -> RuleResponse:
    """Create a new custom simulation rule."""
    state = get_simulation_state(request)
    rules = _get_rules_store(state)

    if len(rules) >= 50:
        raise api_error(400, "Maximum 50 rules allowed", "rules_limit_exceeded")

    rule = SimulationRule(
        rule_id=str(uuid.uuid4()),
        name=payload.name,
        description=payload.description,
        conditions=payload.conditions,
        actions=payload.actions,
        enabled=payload.enabled,
    )
    rules.append(rule)
    return rule.to_response()


@router.patch("/{rule_id}", response_model=RuleResponse, responses=error_responses(404))
async def toggle_rule(rule_id: str, payload: ToggleRuleRequest, request: Request) -> RuleResponse:
    """Enable or disable a rule."""
    state = get_simulation_state(request)
    rules = _get_rules_store(state)
    for rule in rules:
        if rule.id == rule_id:
            rule.enabled = payload.enabled
            return rule.to_response()
    raise api_error(404, "Rule not found", "rule_not_found")


@router.delete("/{rule_id}", responses=error_responses(404))
async def delete_rule(rule_id: str, request: Request) -> dict[str, str]:
    """Delete a custom simulation rule."""
    state = get_simulation_state(request)
    rules = _get_rules_store(state)
    for i, rule in enumerate(rules):
        if rule.id == rule_id:
            rules.pop(i)
            return {"status": "deleted", "id": rule_id}
    raise api_error(404, "Rule not found", "rule_not_found")
