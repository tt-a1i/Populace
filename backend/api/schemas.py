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


class SimulationStatusResponse(BaseModel):
    running: bool
    speed: int
    tick: int


class SimulationStatsResponse(BaseModel):
    total_ticks: int
    total_dialogues: int
    total_relationship_changes: int
    active_events: int


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


class ResidentMemoryResponse(BaseModel):
    id: str
    content: str
    timestamp: str
    importance: float
    emotion: str


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
