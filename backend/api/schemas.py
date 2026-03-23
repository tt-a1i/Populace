from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    detail: str
    code: str


def api_error(status_code: int, detail: str, code: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail=ErrorResponse(detail=detail, code=code).model_dump(),
    )


_ERROR_DESCRIPTIONS = {
    400: "Bad Request",
    404: "Not Found",
    422: "Validation Error",
    503: "Service Unavailable",
}


def error_responses(*status_codes: int) -> dict[int, dict[str, Any]]:
    return {
        status_code: {
            "model": ErrorResponse,
            "description": _ERROR_DESCRIPTIONS.get(status_code, "Error"),
        }
        for status_code in status_codes
    }


class HealthResponse(BaseModel):
    status: str = "ok"
    redis: str = "disconnected"
    neo4j: str = "disconnected"


class SimulationStatusResponse(BaseModel):
    running: bool
    speed: int
    tick: int


class SimulationResidentStatResponse(BaseModel):
    id: str
    name: str
    relationship_count: int
    relationship_intensity: float


class StrongestRelationshipResponse(BaseModel):
    from_id: str
    from_name: str
    to_id: str
    to_name: str
    type: str
    intensity: float


class SimulationStatsResponse(BaseModel):
    total_ticks: int
    total_dialogues: int
    total_relationship_changes: int
    active_events: int
    average_mood_score: float
    most_social_resident: SimulationResidentStatResponse | None = None
    loneliest_resident: SimulationResidentStatResponse | None = None
    strongest_relationship: StrongestRelationshipResponse | None = None
    total_memories: int


class WorldEventResponse(BaseModel):
    id: str
    description: str
    source: str
    timestamp: str


class PresetEventResponse(BaseModel):
    id: str
    name: str
    description: str
    radius: int
    duration: int
    source: str


class ActiveWorldEventResponse(BaseModel):
    id: str
    name: str
    description: str
    radius: int
    remaining_ticks: int
    source: str


class BuildingResponse(BaseModel):
    id: str
    type: str
    name: str
    capacity: int
    position: tuple[int, int]
    occupants: int = 0


class BuildingOccupantInfo(BaseModel):
    id: str
    name: str
    occupation: str = "unemployed"
    mood: str = "neutral"
    status: str = "idle"


class BuildingVisitRecord(BaseModel):
    resident_id: str
    resident_name: str
    action: str  # "enter" or "leave"
    tick: int


class BuildingDetailResponse(BaseModel):
    id: str
    type: str
    name: str
    capacity: int
    position: tuple[int, int]
    occupants: int = 0
    current_residents: list[BuildingOccupantInfo] = Field(default_factory=list)
    recent_visits: list[BuildingVisitRecord] = Field(default_factory=list)


class ResidentResponse(BaseModel):
    id: str
    name: str
    personality: str
    goals: list[str] = Field(default_factory=list)
    mood: str = "neutral"
    location: str | None = None
    x: int = 0
    y: int = 0
    home_building_id: str | None = None
    skin_color: str | None = None
    hair_style: str | None = None
    hair_color: str | None = None
    outfit_color: str | None = None
    current_goal: str | None = None
    coins: int = 100
    occupation: str = "unemployed"
    skills: dict[str, float] = Field(default_factory=dict)
    inventory: list[dict[str, Any]] = Field(default_factory=list)
    energy: float = 1.0
    age_days: int = 0


class PopulationResidentResponse(BaseModel):
    id: str
    name: str
    personality: str
    mood: str = "neutral"
    location: str | None = None
    x: int = 0
    y: int = 0
    home_building_id: str | None = None
    skin_color: str | None = None
    hair_style: str | None = None
    hair_color: str | None = None
    outfit_color: str | None = None
    coins: int = 100
    occupation: str = "unemployed"
    skills: dict[str, float] = Field(default_factory=dict)
    inventory: list[dict[str, Any]] = Field(default_factory=list)
    energy: float = 1.0
    age_days: int = 0
    goals: list[str] = Field(default_factory=list)


class MarketStatsResponse(BaseModel):
    trade_volume: int = 0
    total_items_traded: int = 0
    hottest_item: str | None = None
    most_active_trader: str | None = None


class PopulationEventResponse(BaseModel):
    event_type: str
    resident_id: str
    resident_name: str
    resident: PopulationResidentResponse
    parent_ids: list[str] = Field(default_factory=list)
    parent_names: list[str] = Field(default_factory=list)
    summary: str = ""


class PopulationHistoryEntryResponse(BaseModel):
    tick: int
    time: str
    population: int
    births: int = 0
    deaths: int = 0
    summary: str = ""


class DiaryEntryResponse(BaseModel):
    id: str
    date: str
    tick: int
    summary: str


class ResidentMemoryResponse(BaseModel):
    id: str
    content: str
    timestamp: str
    importance: float
    emotion: str
    source: str = "system"


class ResidentRelationshipResponse(BaseModel):
    from_id: str
    to_id: str
    type: str
    intensity: float
    since: str = ""
    familiarity: float = 0.0
    reason: str = ""
    counterpart_name: str
    direction: str


class ResidentMoodLogEntryResponse(BaseModel):
    tick: int
    mood: str
    cause: str


class ResidentReflectionResponse(BaseModel):
    id: str
    summary: str
    timestamp: str
    derived_from: list[str] = Field(default_factory=list)


class ScenarioMapRect(BaseModel):
    x: int
    y: int
    width: int
    height: int


class ZoneBoundsResponse(BaseModel):
    x: int
    y: int
    width: int
    height: int


class ZoneAtmosphereResponse(BaseModel):
    noise: float
    safety: float
    beauty: float


class ZoneResponse(BaseModel):
    id: str
    name: str
    type: str
    bounds: ZoneBoundsResponse
    atmosphere: ZoneAtmosphereResponse
    resident_count: int = 0
    building_count: int = 0
    dominant_building_types: list[str] = Field(default_factory=list)


class ScenarioMapResponse(BaseModel):
    width: int | None = None
    height: int | None = None
    roads: list[ScenarioMapRect] = Field(default_factory=list)
    water: list[ScenarioMapRect] = Field(default_factory=list)


class ScenarioBuildingResponse(BaseModel):
    id: str
    type: str
    name: str
    capacity: int
    position: list[int]


class ScenarioResidentResponse(BaseModel):
    id: str
    name: str
    personality: str
    goals: list[str] = Field(default_factory=list)
    mood: str = "neutral"
    home_id: str | None = None
    x: int = 0
    y: int = 0
    skin_color: str | None = None
    hair_style: str | None = None
    hair_color: str | None = None
    outfit_color: str | None = None


class ScenarioDataResponse(BaseModel):
    name: str
    description: str = ""
    buildings: list[ScenarioBuildingResponse] = Field(default_factory=list)
    residents: list[ScenarioResidentResponse] = Field(default_factory=list)
    map: ScenarioMapResponse | None = None


class WeatherResponse(BaseModel):
    weather: str


class ReportSectionResponse(BaseModel):
    heading: str
    content: str


class GeneratedReportResponse(BaseModel):
    title: str
    sections: list[ReportSectionResponse]
    generated_at: str
    tick: int


class DialogueHistoryEntryResponse(BaseModel):
    id: str
    tick: int
    time: str
    from_id: str
    from_name: str
    to_id: str
    to_name: str
    text: str
    kind: str = "dialogue"


class ExperimentHotspotResponse(BaseModel):
    name: str
    visits: int
    interaction_score: float


class ExperimentReportStatsResponse(BaseModel):
    days: int
    start_tick: int
    end_tick: int
    node_count: int
    edge_count: int
    density_start: float
    density_end: float
    density_change: float
    triangle_count: int
    dominant_mood: str
    relation_type_distribution: dict[str, int]
    social_hotspots: list[ExperimentHotspotResponse]
    recorded_ticks: int


class ExperimentReportResponse(BaseModel):
    title: str
    sections: list[ReportSectionResponse]
    stats: ExperimentReportStatsResponse
    generated_at: str


class SaveMetaResponse(BaseModel):
    id: str
    name: str
    created_at: str
    tick: int


class LoadSaveResponse(BaseModel):
    ok: bool
    tick: int
    agents: int
    buildings: int


class DeleteSaveResponse(BaseModel):
    ok: bool
    id: str


class OccupationDistEntry(BaseModel):
    occupation: str
    count: int


class EconomyStatsResponse(BaseModel):
    total_coins: int
    avg_coins: float
    richest: str | None = None
    poorest: str | None = None
    occupation_distribution: list[OccupationDistEntry] = Field(default_factory=list)


class MemoirResponse(BaseModel):
    resident_id: str
    resident_name: str
    content: str
    generated_at: str


class TimelineEventResponse(BaseModel):
    id: str
    event_type: str  # relationship_milestone | weather_change | custom_event | preset_event | achievement
    description: str
    tick: int
    time: str
    metadata: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# What-If Analysis
# ---------------------------------------------------------------------------


class WhatIfEventParam(BaseModel):
    description: str


class WhatIfResidentMod(BaseModel):
    resident_id: str
    mood: str | None = None
    energy: float | None = None
    coins: int | None = None


class WhatIfRequest(BaseModel):
    ticks: int = Field(default=50, ge=1, le=500)
    events: list[WhatIfEventParam] = Field(default_factory=list)
    resident_mods: list[WhatIfResidentMod] = Field(default_factory=list)


class WhatIfResidentSnapshot(BaseModel):
    id: str
    name: str
    mood: str = "neutral"
    coins: int = 100
    energy: float = 1.0
    occupation: str = "unemployed"
    x: int = 0
    y: int = 0


class WhatIfRelationshipSnapshot(BaseModel):
    from_id: str
    to_id: str
    type: str
    intensity: float


class WhatIfStateSnapshot(BaseModel):
    tick: int
    population: int
    avg_mood_score: float
    total_coins: int
    total_relationships: int
    gini_coefficient: float
    residents: list[WhatIfResidentSnapshot] = Field(default_factory=list)
    relationships: list[WhatIfRelationshipSnapshot] = Field(default_factory=list)


class WhatIfResponse(BaseModel):
    ticks_simulated: int
    current: WhatIfStateSnapshot
    predicted: WhatIfStateSnapshot


# ---------------------------------------------------------------------------
# Knowledge Graph
# ---------------------------------------------------------------------------


class KnowledgeGraphNode(BaseModel):
    id: str
    label: str
    type: str  # "resident" | "building" | "event"
    metadata: dict = Field(default_factory=dict)


class KnowledgeGraphEdge(BaseModel):
    source: str
    target: str
    label: str
    tick: int = 0


class KnowledgeGraphResponse(BaseModel):
    nodes: list[KnowledgeGraphNode] = Field(default_factory=list)
    edges: list[KnowledgeGraphEdge] = Field(default_factory=list)
