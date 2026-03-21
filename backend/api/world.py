from __future__ import annotations

import json
import re
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Union
from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, field_validator, model_validator

from backend.api.schemas import (
    ActiveWorldEventResponse,
    BuildingResponse,
    PresetEventResponse,
    ScenarioDataResponse,
    WeatherResponse,
    WorldEventResponse,
    api_error,
    error_responses,
)
from backend.api.simulation import get_simulation_state
from engine.pathfinding import PathCache
from engine.types import Building, WeatherType


router = APIRouter(prefix="/api/world", tags=["world"])


class WorldEventRequest(BaseModel):
    description: str = Field(default="")
    source: str = Field(default="user")
    preset_id: str = Field(default="")  # slug from PRESET_EVENTS, e.g. "storm"

    @field_validator("description", "source", "preset_id", mode="before")
    @classmethod
    def strip_string_fields(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def validate_custom_event_description(self) -> "WorldEventRequest":
        if not self.preset_id and not self.description:
            raise ValueError("description is required when preset_id is empty")
        return self


@router.post(
    "/events",
    response_model=Union[WorldEventResponse, PresetEventResponse],
    responses=error_responses(404, 422, 503),
)
async def create_world_event(payload: WorldEventRequest, request: Request) -> Union[WorldEventResponse, PresetEventResponse]:
    """Inject an event.  Pass *preset_id* to activate a named preset event
    with automatic duration and radius, or *description* for a custom one-shot."""
    state = get_simulation_state(request)

    # Preset event path
    if payload.preset_id:
        result = state.enqueue_preset_event(payload.preset_id)
        if result is None:
            raise api_error(404, f"Unknown preset event '{payload.preset_id}'.", "preset_event_not_found")
        return PresetEventResponse(**result)

    event = {
        "id": str(uuid4()),
        "description": payload.description,
        "source": payload.source,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return WorldEventResponse(**state.enqueue_event(event))


@router.get(
    "/events/active",
    response_model=list[ActiveWorldEventResponse],
    responses=error_responses(503),
)
async def get_active_events(request: Request) -> list[ActiveWorldEventResponse]:
    """Return currently active multi-tick events with remaining duration."""
    state = get_simulation_state(request)
    return [ActiveWorldEventResponse(**event) for event in state.get_active_events()]


@router.get("/events/presets", response_model=list[PresetEventResponse])
async def list_preset_events(request: Request) -> list[PresetEventResponse]:  # noqa: ARG001
    """Return all available preset events."""
    from backend.world.events import PRESET_EVENTS
    return [PresetEventResponse(**event) for event in PRESET_EVENTS]


class GenerateScenarioRequest(BaseModel):
    description: str = Field(min_length=1, max_length=500)


@router.post(
    "/generate-scenario",
    response_model=ScenarioDataResponse,
    responses=error_responses(422),
)
async def generate_scenario(payload: GenerateScenarioRequest) -> ScenarioDataResponse:
    """Generate a scenario from a user description using LLM (or mock fallback).

    Returns the scenario JSON preview without starting the simulation.
    The caller can then pass this data to ``/api/simulation/start-custom``.
    """
    from backend.llm.client import chat_completion
    from backend.llm.prompts import build_scenario_prompt

    messages = build_scenario_prompt(payload.description)
    raw = await chat_completion(messages, max_tokens=1000)

    scenario: dict[str, Any] | None = None

    if raw:
        scenario = _parse_scenario_json(raw)

    if scenario is None:
        # LLM unavailable or returned unparseable text — use mock generator
        scenario = _mock_scenario(payload.description)

    # Basic structural validation
    if not scenario.get("buildings") or not scenario.get("residents"):
        scenario = _mock_scenario(payload.description)

    return ScenarioDataResponse(**scenario)


def _parse_scenario_json(raw: str) -> dict[str, Any] | None:
    """Extract the first valid JSON object from an LLM response string."""
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Try to extract a JSON object with brace matching
    start = cleaned.find("{")
    if start == -1:
        return None
    depth = 0
    for i, ch in enumerate(cleaned[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(cleaned[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _mock_scenario(description: str) -> dict[str, Any]:
    """Return a minimal valid scenario when LLM is unavailable."""
    nums = re.findall(r"\d+", description)
    n = max(2, min(int(nums[0]), 10)) if nums else 4

    name = description[:16].rstrip("，。, ") if description else "自定义小镇"

    buildings: list[dict[str, Any]] = [
        {"id": "home_1", "type": "home", "name": "民居A", "capacity": 4, "position": [5, 8]},
        {"id": "home_2", "type": "home", "name": "民居B", "capacity": 4, "position": [12, 8]},
        {"id": "cafe_1", "type": "cafe", "name": "茶馆", "capacity": 4, "position": [22, 8]},
        {"id": "park_1", "type": "park", "name": "广场", "capacity": 10, "position": [30, 8]},
    ]
    home_ids = ["home_1", "home_2"]
    residents: list[dict[str, Any]] = [
        {
            "id": f"r{i + 1}",
            "name": f"居民{i + 1}",
            "personality": "和善，乐于助人",
            "goals": ["探索小镇", "结交朋友"],
            "mood": "neutral",
            "home_id": home_ids[i % 2],
            "x": 5 + (i % 8) * 4,
            "y": 14,
        }
        for i in range(n)
    ]
    return {
        "name": name,
        "description": description,
        "map": {
            "width": 40,
            "height": 30,
            "roads": [{"x": 0, "y": 14, "width": 40, "height": 2}],
            "water": [],
        },
        "buildings": buildings,
        "residents": residents,
    }


@router.get(
    "/buildings",
    response_model=list[BuildingResponse],
    responses=error_responses(503),
)
async def list_buildings(request: Request) -> list[BuildingResponse]:
    """Return the currently loaded buildings and their map positions."""
    state = get_simulation_state(request)
    return [BuildingResponse(**asdict(building)) for building in state.world.buildings]


_VALID_BUILDING_TYPES = {"home", "cafe", "park", "shop", "school", "gym", "library", "hospital"}


class AddBuildingRequest(BaseModel):
    id: str = Field(default="")
    type: str = Field(description="Building type: home|cafe|park|shop|school|…")
    name: str = Field(min_length=1, max_length=60)
    capacity: int = Field(ge=1, le=200, default=4)
    position: tuple[int, int] = Field(description="[x, y] entrance tile")

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        v = value.strip().lower()
        if v not in _VALID_BUILDING_TYPES:
            raise ValueError(f"Unknown building type '{v}'. Valid: {sorted(_VALID_BUILDING_TYPES)}")
        return v

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("id")
    @classmethod
    def strip_id(cls, value: str) -> str:
        return value.strip()


@router.post(
    "/buildings",
    response_model=BuildingResponse,
    status_code=201,
    responses=error_responses(400, 422, 503),
)
async def add_building(payload: AddBuildingRequest, request: Request) -> BuildingResponse:
    """Add a new building to the running world at runtime (Task 61)."""
    state = get_simulation_state(request)
    w = state.world.config.map_width_tiles
    h = state.world.config.map_height_tiles
    x, y = payload.position

    if not (0 <= x < w and 0 <= y < h):
        raise api_error(400, f"Position ({x}, {y}) out of bounds (map is {w}×{h})", "position_out_of_bounds")

    for existing in state.world.buildings:
        if existing.position == (x, y):
            raise api_error(400, f"Building already exists at ({x}, {y}): '{existing.name}'", "position_occupied")

    building_id = payload.id or f"dyn_{payload.type}_{x}_{y}_{uuid4().hex[:6]}"
    building = Building(
        id=building_id,
        type=payload.type,
        name=payload.name,
        capacity=payload.capacity,
        position=(x, y),
    )
    state.world.add_building(building)

    # Apply grid tiles: mark 2×2 footprint body as impassable, entrance walkable
    def _set(tx: int, ty: int, walkable: bool) -> None:
        if 0 <= tx < w and 0 <= ty < h:
            state.world.grid[ty][tx] = walkable

    _set(x, y, True)
    for dy in range(1, 3):
        for dx in range(0, 2):
            _set(x + dx, y + dy, False)

    state.world.path_cache = PathCache()
    return BuildingResponse(**asdict(building))


@router.delete(
    "/buildings/{building_id}",
    status_code=204,
    responses=error_responses(404, 503),
)
async def remove_building(building_id: str, request: Request) -> None:
    """Remove a building from the running world, evicting any occupants (Task 61)."""
    state = get_simulation_state(request)
    removed = state.world.remove_building(building_id)
    if removed is None:
        raise api_error(404, f"Building '{building_id}' not found", "building_not_found")


class SetWeatherRequest(BaseModel):
    type: str = Field(description="Weather type: sunny|cloudy|rainy|stormy|snowy")


@router.post(
    "/weather",
    response_model=WeatherResponse,
    responses=error_responses(400, 422, 503),
)
async def set_weather(payload: SetWeatherRequest, request: Request) -> WeatherResponse:
    """Set current weather and broadcast on next tick (spec §4.2, §14)."""
    state = get_simulation_state(request)
    try:
        weather = WeatherType(payload.type)
    except ValueError:
        raise api_error(
            400,
            f"Unknown weather type '{payload.type}'. Valid: {[w.value for w in WeatherType]}",
            "invalid_weather_type",
        )
    weather_labels = {
        "sunny": "晴天", "cloudy": "多云", "rainy": "小雨", "stormy": "暴风雨", "snowy": "下雪",
    }
    old_weather = state.world.weather.value if hasattr(state.world.weather, "value") else str(state.world.weather)
    state.world.weather = weather
    if old_weather != weather.value:
        state._add_timeline_event(
            "weather_change",
            f"天气变化：{weather_labels.get(old_weather, old_weather)} → {weather_labels.get(weather.value, weather.value)}",
            {"from": old_weather, "to": weather.value},
        )
    return WeatherResponse(weather=weather.value)


@router.get(
    "/weather",
    response_model=WeatherResponse,
    responses=error_responses(503),
)
async def get_weather(request: Request) -> WeatherResponse:
    """Return the current weather."""
    state = get_simulation_state(request)
    return WeatherResponse(weather=state.world.weather.value)
