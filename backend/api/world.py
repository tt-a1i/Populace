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
    AchievementLeaderboardEntryResponse,
    BuildingDetailResponse,
    BuildingOccupantInfo,
    BuildingResponse,
    BuildingUpgradeResponse,
    BuildingVisitRecord,
    CrimeEventResponse,
    DisasterListResponse,
    FestivalListResponse,
    PetResponse,
    PresetEventResponse,
    ReputationRankingEntryResponse,
    SafetyHotspotResponse,
    SafetyStatsResponse,
    ScenarioDataResponse,
    WeatherResponse,
    WorldBulletinResponse,
    WorldCultureResponse,
    WorldDiplomacyResponse,
    WorldDemographicsResponse,
    WorldDreamStatsResponse,
    WorldHealthResponse,
    EconomyCycleResponse,
    TownLevelResponse,
    WorldMarketResponse,
    WorldRumorsResponse,
    WorldEconomyResponse,
    WorldFashionResponse,
    WorldNewsResponse,
    WorldEducationCourseResponse,
    WorldEventResponse,
    WorldPoliticsResponse,
    WorldReligionResponse,
    WorldPersonalityStatsResponse,
    WorldRomanceStatsResponse,
    WorldTransportResponse,
    ZoneResponse,
    api_error,
    error_responses,
)
from backend.api.simulation import get_simulation_state
from engine.pathfinding import PathCache
from engine.types import Building, WeatherType
from engine.weather import build_forecast, normalize_season


router = APIRouter(prefix="/api/world", tags=["world"])
buildings_router = APIRouter(prefix="/api/buildings", tags=["buildings"])


def _vote_passed_for_building(state: Any, building: Building) -> bool:
    votes = [*getattr(state, "_active_votes", []), *getattr(state, "_vote_history", [])]
    building_markers = {building.id.lower(), building.name.lower()}
    support_markers = ("同意", "通过", "批准", "支持", "升级", "扩建", "豪华", "approve", "upgrade", "expand", "luxury")
    for vote in votes:
        issue = str(vote.get("issue", "")).lower()
        if not any(marker in issue for marker in building_markers):
            continue
        if vote.get("status") != "completed":
            continue
        winning_option = str(vote.get("winning_option") or "").lower()
        if any(marker in winning_option for marker in support_markers):
            return True
    return False


def _average_visit_willingness(state: Any, building: Building) -> float:
    candidates = [agent.resident for agent in state.world.agents if agent.resident.home_building_id != building.id]
    if not candidates:
        return 0.0
    total = sum(state.world.get_building_visit_willingness(resident, building) for resident in candidates)
    return round(total / len(candidates), 3)


def _serialize_building_upgrade(state: Any, building: Building) -> BuildingUpgradeResponse:
    required_reserve = round(state.world.get_building_upgrade_cost(building), 2)
    reserve_ready = float(state.world.economic_output) >= required_reserve
    vote_passed = _vote_passed_for_building(state, building)
    next_level = building.level + 1 if building.level < 3 else None
    return BuildingUpgradeResponse(
        id=building.id,
        type=building.type,
        name=building.name,
        level=building.level,
        capacity=building.capacity,
        upgrades=list(building.upgrades),
        decoration_score=round(float(building.decoration_score), 3),
        next_level=next_level,
        required_reserve=required_reserve,
        reserve_ready=reserve_ready,
        vote_passed=vote_passed,
        can_upgrade=state.world.can_upgrade_building(building, state.world.economic_output, vote_passed),
        special_feature=state.world.get_building_special_feature(building),
    )


def _build_building_detail(building_id: str, state: Any) -> BuildingDetailResponse:
    building = state.world.get_building(building_id)
    if building is None:
        raise api_error(404, f"Building '{building_id}' not found", "building_not_found")

    occupant_agents = state.world.get_occupants(building_id)
    current_residents = [
        BuildingOccupantInfo(
            id=agent.resident.id,
            name=agent.resident.name,
            occupation=getattr(agent.resident, "occupation", "unemployed"),
            mood=agent.resident.mood,
            status="chatting" if getattr(agent, "in_dialogue", False) else "idle",
        )
        for agent in occupant_agents
    ]

    visit_log: list[dict[str, Any]] = getattr(state, "building_visit_log", [])
    recent_visits = [
        BuildingVisitRecord(
            resident_id=entry["resident_id"],
            resident_name=entry["resident_name"],
            action=entry["action"],
            tick=entry["tick"],
        )
        for entry in visit_log
        if entry.get("building_id") == building_id
    ][-10:]

    upgrade = _serialize_building_upgrade(state, building)
    return BuildingDetailResponse(
        id=building.id,
        type=building.type,
        name=building.name,
        capacity=building.capacity,
        position=building.position,
        level=building.level,
        upgrades=list(building.upgrades),
        decoration_score=round(float(building.decoration_score), 3),
        occupants=len(occupant_agents),
        next_level=upgrade.next_level,
        required_reserve=upgrade.required_reserve,
        reserve_ready=upgrade.reserve_ready,
        vote_passed=upgrade.vote_passed,
        special_feature=upgrade.special_feature,
        visit_willingness=_average_visit_willingness(state, building),
        current_residents=current_residents,
        recent_visits=recent_visits,
    )

class VoteRequest(BaseModel):
    issue: str = Field(min_length=2, max_length=120)
    options: list[str] = Field(min_length=2, max_length=8)
    duration_ticks: int = Field(ge=1, le=240, default=8)

    @field_validator("issue", mode="before")
    @classmethod
    def strip_issue(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("options", mode="before")
    @classmethod
    def normalize_options(cls, value: Any) -> Any:
        if isinstance(value, list):
            normalized = [item.strip() for item in value if isinstance(item, str) and item.strip()]
            deduped: list[str] = []
            for item in normalized:
                if item not in deduped:
                    deduped.append(item)
            return deduped
        return value


class VoteResponse(BaseModel):
    id: str
    issue: str
    options: list[str]
    counts: dict[str, int]
    status: str
    start_tick: int
    end_tick: int
    winning_option: str | None = None
    result_announced: bool = False
    total_votes: int = 0
    effects: list[str] = Field(default_factory=list)


class WorldFamilyMemberResponse(BaseModel):
    id: str
    name: str
    age_days: int = 0
    partner_id: str | None = None
    children_ids: list[str] = Field(default_factory=list)


class WorldFamilyResponse(BaseModel):
    family_name: str
    member_count: int = 0
    average_mood: float = 0.0
    members: list[WorldFamilyMemberResponse] = Field(default_factory=list)


class CrimeEventResponse(BaseModel):
    type: str
    perpetrator: str
    victim: str | None = None
    location: str
    tick: int
    resolved: bool = False


class SafetyHotspotResponse(BaseModel):
    location: str
    count: int
    resolved_count: int = 0
    intensity: float = 0.0


class SafetyStatsResponse(BaseModel):
    safety_index: float
    average_safety_feeling: float
    total_crimes: int
    unresolved_crimes: int
    crimes_by_type: dict[str, int] = Field(default_factory=dict)
    hotspots: list[SafetyHotspotResponse] = Field(default_factory=list)
    flagged_residents: list[str] = Field(default_factory=list)
    patrol_zones: list[str] = Field(default_factory=list)


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


@router.post(
    "/vote",
    response_model=VoteResponse,
    responses=error_responses(422, 503),
)
async def create_vote(payload: VoteRequest, request: Request) -> VoteResponse:
    state = get_simulation_state(request)
    vote = state.create_vote(payload.issue, payload.options, payload.duration_ticks)
    return VoteResponse(**vote)


@router.get(
    "/votes/active",
    response_model=list[VoteResponse],
    responses=error_responses(503),
)
async def get_active_votes(request: Request) -> list[VoteResponse]:
    state = get_simulation_state(request)
    return [VoteResponse(**vote) for vote in state.get_active_votes()]


@router.get(
    "/votes/history",
    response_model=list[VoteResponse],
    responses=error_responses(503),
)
async def get_vote_history(request: Request) -> list[VoteResponse]:
    state = get_simulation_state(request)
    return [VoteResponse(**vote) for vote in state.get_vote_history()]


@router.get(
    "/economy",
    response_model=WorldEconomyResponse,
    responses=error_responses(503),
)
async def get_world_economy(request: Request) -> WorldEconomyResponse:
    state = get_simulation_state(request)
    return WorldEconomyResponse(**state.world.get_economy_overview())


@router.get(
    "/economy/cycle",
    response_model=EconomyCycleResponse,
    responses=error_responses(503),
)
async def get_economy_cycle(request: Request) -> EconomyCycleResponse:
    state = get_simulation_state(request)
    return EconomyCycleResponse(**state.world.get_economy_cycle_overview())


@router.get(
    "/level",
    response_model=TownLevelResponse,
    responses=error_responses(503),
)
async def get_town_level(request: Request) -> TownLevelResponse:
    state = get_simulation_state(request)
    return TownLevelResponse(**state.world.get_town_level_overview())


@router.get(
    "/rumors",
    response_model=WorldRumorsResponse,
    responses=error_responses(503),
)
async def get_world_rumors(request: Request) -> WorldRumorsResponse:
    state = get_simulation_state(request)
    return WorldRumorsResponse(**state.world.get_rumors_overview())


@router.get(
    "/market",
    response_model=WorldMarketResponse,
    responses=error_responses(503),
)
async def get_world_market(request: Request) -> WorldMarketResponse:
    state = get_simulation_state(request)
    return WorldMarketResponse(**state.world.get_market_overview())


@router.get(
    "/fashion",
    response_model=WorldFashionResponse,
    responses=error_responses(503),
)
async def get_world_fashion(request: Request) -> WorldFashionResponse:
    state = get_simulation_state(request)
    return WorldFashionResponse(**state.world.get_fashion_overview())


@router.get(
    "/news",
    response_model=WorldNewsResponse,
    responses=error_responses(503),
)
async def get_world_news(request: Request) -> WorldNewsResponse:
    state = get_simulation_state(request)
    return WorldNewsResponse(**state.world.get_news_overview())


@router.get(
    "/health",
    response_model=WorldHealthResponse,
    responses=error_responses(503),
)
async def get_world_health(request: Request) -> WorldHealthResponse:
    state = get_simulation_state(request)
    return WorldHealthResponse(**state.world.get_health_stats())


@router.get(
    "/demographics",
    response_model=WorldDemographicsResponse,
    responses=error_responses(503),
)
async def get_world_demographics(request: Request) -> WorldDemographicsResponse:
    state = get_simulation_state(request)
    return WorldDemographicsResponse(**state.world.get_demographics_overview())


@router.get(
    "/politics",
    response_model=WorldPoliticsResponse,
    responses=error_responses(503),
)
async def get_world_politics(request: Request) -> WorldPoliticsResponse:
    state = get_simulation_state(request)
    return WorldPoliticsResponse(**state.get_politics_overview())


@router.get(
    "/crimes",
    response_model=list[CrimeEventResponse],
    responses=error_responses(503),
)
async def get_crimes(request: Request) -> list[CrimeEventResponse]:
    state = get_simulation_state(request)
    return [CrimeEventResponse(**asdict(event)) for event in state.world.get_crime_log()]


@router.get(
    "/safety",
    response_model=SafetyStatsResponse,
    responses=error_responses(503),
)
async def get_safety(request: Request) -> SafetyStatsResponse:
    state = get_simulation_state(request)
    return SafetyStatsResponse(**state.world.get_safety_stats())


@router.get(
    "/reputation/rankings",
    response_model=list[ReputationRankingEntryResponse],
    responses=error_responses(503),
)
async def get_reputation_rankings(request: Request) -> list[ReputationRankingEntryResponse]:
    state = get_simulation_state(request)
    return [ReputationRankingEntryResponse(**row) for row in state.world.get_reputation_rankings()]


@router.get(
    "/achievements/leaderboard",
    response_model=list[AchievementLeaderboardEntryResponse],
    responses=error_responses(503),
)
async def get_achievement_leaderboard(request: Request) -> list[AchievementLeaderboardEntryResponse]:
    from engine.achievements import build_leaderboard

    state = get_simulation_state(request)
    return [AchievementLeaderboardEntryResponse(**row) for row in build_leaderboard(state)]


@router.get(
    "/pets",
    response_model=list[PetResponse],
    responses=error_responses(503),
)
async def get_world_pets(request: Request) -> list[PetResponse]:
    state = get_simulation_state(request)
    return [PetResponse(**asdict(pet)) for pet in state.world.list_pets()]


@router.get(
    "/relationships",
    response_model=WorldRomanceStatsResponse,
    responses=error_responses(503),
)
async def get_world_relationships(request: Request) -> WorldRomanceStatsResponse:
    from engine.romance import get_romance_stats

    state = get_simulation_state(request)
    return WorldRomanceStatsResponse(**get_romance_stats(state.world))


@router.get(
    "/dream_stats",
    response_model=WorldDreamStatsResponse,
    responses=error_responses(503),
)
async def get_dream_stats(request: Request) -> WorldDreamStatsResponse:
    from engine.dream import get_dream_stats

    state = get_simulation_state(request)
    return WorldDreamStatsResponse(**get_dream_stats(state.world))


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
    "/education",
    response_model=list[WorldEducationCourseResponse],
    responses=error_responses(503),
)
async def get_world_education(request: Request) -> list[WorldEducationCourseResponse]:
    state = get_simulation_state(request)
    return [WorldEducationCourseResponse(**item) for item in state.world.get_education_overview()]


@router.get(
    "/culture",
    response_model=WorldCultureResponse,
    responses=error_responses(503),
)
async def get_world_culture(request: Request) -> WorldCultureResponse:
    state = get_simulation_state(request)
    return WorldCultureResponse(**state.world.get_culture_overview())


@router.get(
    "/religion",
    response_model=WorldReligionResponse,
    responses=error_responses(503),
)
async def get_world_religion(request: Request) -> WorldReligionResponse:
    state = get_simulation_state(request)
    return WorldReligionResponse(**state.world.get_religion_overview())


@router.get(
    "/zones",
    response_model=list[ZoneResponse],
    responses=error_responses(503),
)
async def list_zones(request: Request) -> list[ZoneResponse]:
    state = get_simulation_state(request)
    return [ZoneResponse(**zone_stats) for zone_stats in state.world.list_zone_stats()]


@router.get(
    "/families",
    response_model=list[WorldFamilyResponse],
    responses=error_responses(503),
)
async def list_families(request: Request) -> list[WorldFamilyResponse]:
    state = get_simulation_state(request)
    return [WorldFamilyResponse(**family) for family in state.world.list_families()]


@router.get(
    "/festivals",
    response_model=FestivalListResponse,
    responses=error_responses(503),
)
async def list_festivals(request: Request) -> FestivalListResponse:
    state = get_simulation_state(request)
    return FestivalListResponse(**state.get_festivals())


@router.get(
    "/disasters",
    response_model=DisasterListResponse,
    responses=error_responses(503),
)
async def list_disasters(request: Request) -> DisasterListResponse:
    state = get_simulation_state(request)
    return DisasterListResponse(**state.get_disasters())


@router.get(
    "/bulletin",
    response_model=WorldBulletinResponse,
    responses=error_responses(503),
)
async def get_world_bulletin(request: Request) -> WorldBulletinResponse:
    state = get_simulation_state(request)
    return WorldBulletinResponse(**state.get_bulletin_board())


@router.get(
    "/diplomacy",
    response_model=WorldDiplomacyResponse,
    responses=error_responses(503),
)
async def get_world_diplomacy(request: Request) -> WorldDiplomacyResponse:
    state = get_simulation_state(request)
    return WorldDiplomacyResponse(**state.get_diplomacy_overview())


class RivalryEntryResponse(BaseModel):
    from_id: str
    from_name: str
    target_id: str
    target_name: str
    reason: str
    reason_label: str
    intensity: float


class RivalryHotspotResponse(BaseModel):
    resident_id: str
    resident_name: str
    total_jealousy: float


class WorldRivalriesResponse(BaseModel):
    rivalries: list[RivalryEntryResponse] = Field(default_factory=list)
    hotspots: list[RivalryHotspotResponse] = Field(default_factory=list)
    total_rivalries: int = 0
    avg_intensity: float = 0.0


@router.get(
    "/rivalries",
    response_model=WorldRivalriesResponse,
    responses=error_responses(503),
)
async def get_world_rivalries(request: Request) -> WorldRivalriesResponse:
    from engine.jealousy import get_rivalries_overview

    state = get_simulation_state(request)
    return WorldRivalriesResponse(**get_rivalries_overview(state))


@router.get(
    "/crimes",
    response_model=list[CrimeEventResponse],
    responses=error_responses(503),
)
async def list_crimes(request: Request) -> list[CrimeEventResponse]:
    state = get_simulation_state(request)
    return [CrimeEventResponse(**asdict(event)) for event in state.world.get_crime_log()]


@router.get(
    "/safety",
    response_model=SafetyStatsResponse,
    responses=error_responses(503),
)
async def get_safety_stats(request: Request) -> SafetyStatsResponse:
    state = get_simulation_state(request)
    return SafetyStatsResponse(**state.world.get_safety_stats())


@router.get(
    "/transport",
    response_model=WorldTransportResponse,
    responses=error_responses(503),
)
async def get_transport(request: Request) -> WorldTransportResponse:
    state = get_simulation_state(request)
    return WorldTransportResponse(**state.world.get_transport_overview())


@router.get(
    "/buildings",
    response_model=list[BuildingResponse],
    responses=error_responses(503),
)
async def list_buildings(request: Request) -> list[BuildingResponse]:
    """Return the currently loaded buildings and their map positions."""
    state = get_simulation_state(request)
    return [BuildingResponse(**asdict(building)) for building in state.world.buildings]


@router.get(
    "/buildings/upgrades",
    response_model=list[BuildingUpgradeResponse],
    responses=error_responses(503),
)
async def list_building_upgrades(request: Request) -> list[BuildingUpgradeResponse]:
    state = get_simulation_state(request)
    return [_serialize_building_upgrade(state, building) for building in state.world.buildings]


@router.get(
    "/buildings/{building_id}/details",
    response_model=BuildingDetailResponse,
    responses=error_responses(404, 503),
)
async def get_building_details(building_id: str, request: Request) -> BuildingDetailResponse:
    """Return detailed info about a building including current occupants and visit history."""
    state = get_simulation_state(request)
    return _build_building_detail(building_id, state)


@buildings_router.get(
    "/{building_id}/details",
    response_model=BuildingDetailResponse,
    responses=error_responses(404, 503),
)
async def get_building_details_alias(building_id: str, request: Request) -> BuildingDetailResponse:
    state = get_simulation_state(request)
    return _build_building_detail(building_id, state)


_VALID_BUILDING_TYPES = {"home", "cafe", "park", "shop", "school", "gym", "library", "hospital", "temple", "shrine", "chapel"}


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

    # Buildings occupy a 2×2 tile footprint; ensure the full footprint fits
    if not (0 <= x < w and 0 <= y < h):
        raise api_error(400, f"Position ({x}, {y}) out of bounds (map is {w}×{h})", "position_out_of_bounds")
    if x + 1 >= w or y + 1 >= h:
        raise api_error(400, f"Building footprint at ({x}, {y}) extends beyond map edge (2×2 needs ({x+1}, {y+1}) < ({w}, {h}))", "footprint_out_of_bounds")

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
    return WeatherResponse(
        weather=weather.value,
        season=normalize_season(state.world.season).value,
        forecast=list(getattr(state.world, "weather_forecast", [])) or build_forecast(state.world.season),
    )


@router.get(
    "/weather",
    response_model=WeatherResponse,
    responses=error_responses(503),
)
async def get_weather(request: Request) -> WeatherResponse:
    """Return the current weather."""
    state = get_simulation_state(request)
    return WeatherResponse(
        weather=state.world.weather.value,
        season=normalize_season(state.world.season).value,
        forecast=list(getattr(state.world, "weather_forecast", [])) or build_forecast(state.world.season),
    )


# ---------------------------------------------------------------------------
# Player Intervention System (Task 105)
# ---------------------------------------------------------------------------

class InterveneRequest(BaseModel):
    action: str = Field(description="Intervention action: bless_resident, curse_resident, give_money, trigger_festival, trigger_disaster, inspire_resident")
    target_id: str = Field(default="", description="Target resident ID (optional for global actions)")
    value: Any = Field(default=None, description="Additional value (e.g., amount for give_money)")

    @field_validator("action", mode="before")
    @classmethod
    def strip_action(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class InterveneResponse(BaseModel):
    success: bool
    message: str
    action: str
    target_id: str | None = None
    effect_description: str


class InterventionLogEntry(BaseModel):
    id: str
    tick: int
    action: str
    target_id: str
    target_name: str
    value: Any
    effect_description: str
    timestamp: str


class InterventionLogResponse(BaseModel):
    interventions: list[InterventionLogEntry]


@router.post(
    "/intervene",
    response_model=InterveneResponse,
    responses=error_responses(400, 422, 503),
)
async def intervene(payload: InterveneRequest, request: Request) -> InterveneResponse:
    """Execute a player intervention action."""
    state = get_simulation_state(request)
    world = state.world

    action = payload.action
    target_id = payload.target_id
    value = payload.value

    valid_actions = {"bless_resident", "curse_resident", "give_money", "trigger_festival", "trigger_disaster", "inspire_resident"}
    if action not in valid_actions:
        raise api_error(400, f"Invalid action '{action}'. Valid: {list(valid_actions)}", "invalid_intervention_action")

    # Global actions (no target required)
    if action == "trigger_festival":
        effect_desc = world.intervene_trigger_festival()
        world.record_intervention(action, "", "", None, effect_desc)
        return InterveneResponse(success=True, message=effect_desc, action=action, effect_description=effect_desc)

    if action == "trigger_disaster":
        effect_desc = world.intervene_trigger_disaster()
        world.record_intervention(action, "", "", None, effect_desc)
        return InterveneResponse(success=True, message=effect_desc, action=action, effect_description=effect_desc)

    # Resident-targeted actions
    if not target_id:
        raise api_error(400, "target_id is required for this action", "missing_target_id")

    agent = world.get_agent(target_id)
    target_name = agent.resident.name if agent else target_id

    if action == "bless_resident":
        effect_desc = world.intervene_bless_resident(target_id)
        world.record_intervention(action, target_id, target_name, None, effect_desc)
    elif action == "curse_resident":
        effect_desc = world.intervene_curse_resident(target_id)
        world.record_intervention(action, target_id, target_name, None, effect_desc)
    elif action == "give_money":
        amount = float(value) if value is not None else 50.0
        effect_desc = world.intervene_give_money(target_id, amount)
        world.record_intervention(action, target_id, target_name, amount, effect_desc)
    elif action == "inspire_resident":
        effect_desc = world.intervene_inspire_resident(target_id)
        world.record_intervention(action, target_id, target_name, None, effect_desc)
    else:
        raise api_error(400, f"Unhandled action '{action}'", "unhandled_intervention_action")

    return InterveneResponse(success=True, message=effect_desc, action=action, target_id=target_id, effect_description=effect_desc)


class WorldGangMemberResponse(BaseModel):
    resident_id: str
    resident_name: str


class WorldGangResponse(BaseModel):
    name: str
    leader_id: str
    leader_name: str
    member_count: int
    territory: str
    influence: float
    activity: str
    color: str
    created_tick: int
    last_action_tick: int


class WorldGangsResponse(BaseModel):
    gangs: list[WorldGangResponse]
    recent_events: list[dict]


@router.get(
    "/gangs",
    response_model=WorldGangsResponse,
    responses=error_responses(503),
)
async def get_gangs(request: Request) -> WorldGangsResponse:
    """Return the list of gangs in the town."""
    state = get_simulation_state(request)
    overview = state.world.get_gang_overview()
    return WorldGangsResponse(
        gangs=[
            WorldGangResponse(
                name=g["name"],
                leader_id=g["leader_id"],
                leader_name=g["leader_name"],
                member_count=g["member_count"],
                territory=g["territory"],
                influence=g["influence"],
                activity=g["activity"],
                color=g["color"],
                created_tick=g["created_tick"],
                last_action_tick=g["last_action_tick"],
            )
            for g in overview["gangs"]
        ],
        recent_events=overview["recent_events"],
    )


@router.get(
    "/intervention_log",
    response_model=InterventionLogResponse,
    responses=error_responses(503),
)
async def get_intervention_log(request: Request) -> InterventionLogResponse:
    """Return the most recent player intervention records."""
    state = get_simulation_state(request)
    interventions = state.world.get_intervention_log(limit=20)
    return InterventionLogResponse(
        interventions=[
            InterventionLogEntry(
                id=i.id,
                tick=i.tick,
                action=i.action,
                target_id=i.target_id,
                target_name=i.target_name,
                value=i.value,
                effect_description=i.effect_description,
                timestamp=i.timestamp,
            )
            for i in interventions
        ]
    )


@router.get(
    "/personality_stats",
    response_model=WorldPersonalityStatsResponse,
    responses=error_responses(503),
)
async def get_personality_stats(request: Request) -> WorldPersonalityStatsResponse:
    """Return average personality trait values across all residents."""
    from engine.personality import get_personality_stats

    state = get_simulation_state(request)
    stats = get_personality_stats(state)
    return WorldPersonalityStatsResponse(**stats)


# ---------------------------------------------------------------------------
# Leaderboards & Badges System (Task 106)
# ---------------------------------------------------------------------------

class LeaderboardEntryResponse(BaseModel):
    resident_id: str
    name: str
    value: float
    rank: int


class LeaderboardsResponse(BaseModel):
    richest: list[LeaderboardEntryResponse]
    happiest: list[LeaderboardEntryResponse]
    most_social: list[LeaderboardEntryResponse]
    most_traveled: list[LeaderboardEntryResponse]
    most_influential: list[LeaderboardEntryResponse]


class BadgeResponse(BaseModel):
    badge_id: str
    name: str
    emoji: str
    condition_desc: str


class BadgesStatsResponse(BaseModel):
    total_awarded: int
    rarest_badge: dict | None = None
    badge_distribution: dict[str, int]


@router.get(
    "/leaderboards",
    response_model=LeaderboardsResponse,
    responses=error_responses(503),
)
async def get_leaderboards(request: Request) -> LeaderboardsResponse:
    """Return 5 leaderboards with top 5 residents each."""
    state = get_simulation_state(request)
    leaderboards = state.world.get_leaderboards()

    def convert(entries):
        return [
            LeaderboardEntryResponse(
                resident_id=e.resident_id,
                name=e.name,
                value=e.value,
                rank=e.rank,
            )
            for e in entries
        ]

    return LeaderboardsResponse(
        richest=convert(leaderboards["richest"]),
        happiest=convert(leaderboards["happiest"]),
        most_social=convert(leaderboards["most_social"]),
        most_traveled=convert(leaderboards["most_traveled"]),
        most_influential=convert(leaderboards["most_influential"]),
    )


@router.get(
    "/badges",
    response_model=list[BadgeResponse],
    responses=error_responses(503),
)
async def get_badges(request: Request) -> list[BadgeResponse]:
    """Return all badge definitions."""
    state = get_simulation_state(request)
    badges = state.world.get_badge_definitions()
    return [
        BadgeResponse(
            badge_id=b.badge_id,
            name=b.name,
            emoji=b.emoji,
            condition_desc=b.condition_desc,
        )
        for b in badges
    ]


@router.get(
    "/badges_stats",
    response_model=BadgesStatsResponse,
    responses=error_responses(503),
)
async def get_badges_stats(request: Request) -> BadgesStatsResponse:
    """Return badge statistics."""
    state = get_simulation_state(request)
    stats = state.world.get_badges_stats()
    return BadgesStatsResponse(**stats)


@router.post(
    "/badges/award",
    response_model=list[tuple],
    responses=error_responses(503),
)
async def award_badges(request: Request) -> list[tuple]:
    """Check and award badges to eligible residents."""
    state = get_simulation_state(request)
    awarded = state.world.award_badges()
    return awarded
