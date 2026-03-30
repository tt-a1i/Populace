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
    level: int = 1
    upgrades: list[str] = Field(default_factory=list)
    decoration_score: float = 0.0
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
    level: int = 1
    upgrades: list[str] = Field(default_factory=list)
    decoration_score: float = 0.0
    occupants: int = 0
    next_level: int | None = None
    required_reserve: float = 0.0
    reserve_ready: bool = False
    vote_passed: bool = False
    special_feature: str | None = None
    visit_willingness: float = 0.0
    current_residents: list[BuildingOccupantInfo] = Field(default_factory=list)
    recent_visits: list[BuildingVisitRecord] = Field(default_factory=list)


class BuildingUpgradeResponse(BaseModel):
    id: str
    type: str
    name: str
    level: int = 1
    capacity: int
    upgrades: list[str] = Field(default_factory=list)
    decoration_score: float = 0.0
    next_level: int | None = None
    required_reserve: float = 0.0
    reserve_ready: bool = False
    vote_passed: bool = False
    can_upgrade: bool = False
    special_feature: str | None = None


class PetResponse(BaseModel):
    id: str
    name: str
    species: str
    owner_id: str | None = None
    mood: str = "calm"
    hunger: float = 1.0
    location: str | None = None
    x: int = 0
    y: int = 0


class IllnessResponse(BaseModel):
    type: str
    contagious: bool = False
    severity: float = 0.0


class ResidentHealthStateResponse(BaseModel):
    hp: float = 1.0
    illness: IllnessResponse | None = None
    recovery_tick: int = 0


class WorldHealthHotspotResponse(BaseModel):
    location: str
    cases: int
    intensity: float = 0.0


class ResidentHealthResponse(BaseModel):
    resident_id: str
    resident_name: str
    health: ResidentHealthStateResponse


class WorldHealthResponse(BaseModel):
    active_cases: int = 0
    contagious_cases: int = 0
    hospitalized_count: int = 0
    treatment_rate: float = 0.0
    average_hp: float = 1.0
    illness_counts: dict[str, int] = Field(default_factory=dict)
    outbreak_hotspots: list[WorldHealthHotspotResponse] = Field(default_factory=list)


class AppearanceResponse(BaseModel):
    hair: str = "short"
    clothing: str = "casual"
    style_score: float = 0.35


class ClothingItemResponse(BaseModel):
    id: str
    name: str
    category: str = "casual"
    color_name: str = "sky"
    color: str = "#38BDF8"
    style: str = "classic"
    price: float = 0.0
    quality: float = 0.0
    designed_by: str | None = None


class ResidentResponse(BaseModel):
    class FamilyInfoResponse(BaseModel):
        parent_ids: list[str] = Field(default_factory=list)
        sibling_ids: list[str] = Field(default_factory=list)
        partner_id: str | None = None
        children_ids: list[str] = Field(default_factory=list)
        family_name: str = ""

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
    appearance: AppearanceResponse = Field(default_factory=AppearanceResponse)
    wardrobe: list[ClothingItemResponse] = Field(default_factory=list)
    current_goal: str | None = None
    coins: int = 100
    occupation: str = "unemployed"
    wallet: float = 0.0
    job: dict[str, Any] = Field(default_factory=dict)
    skills: dict[str, float] = Field(default_factory=dict)
    inventory: list[dict[str, Any]] = Field(default_factory=list)
    energy: float = 1.0
    age_days: int = 0
    reputation: float = 0.0
    family: FamilyInfoResponse = Field(default_factory=FamilyInfoResponse)
    education: "EducationResponse" = Field(default_factory=lambda: EducationResponse())
    pets: list[PetResponse] = Field(default_factory=list)
    health: ResidentHealthStateResponse = Field(default_factory=ResidentHealthStateResponse)
    relationship_status: str = "single"


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
    appearance: AppearanceResponse = Field(default_factory=AppearanceResponse)
    wardrobe: list[ClothingItemResponse] = Field(default_factory=list)
    coins: int = 100
    occupation: str = "unemployed"
    skills: dict[str, float] = Field(default_factory=dict)
    inventory: list[dict[str, Any]] = Field(default_factory=list)
    energy: float = 1.0
    age_days: int = 0
    goals: list[str] = Field(default_factory=list)
    education: "EducationResponse" = Field(default_factory=lambda: EducationResponse())
    pets: list[PetResponse] = Field(default_factory=list)
    health: ResidentHealthStateResponse = Field(default_factory=ResidentHealthStateResponse)


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
    day: int = 0
    tick: int
    summary: str = ""
    content: str = ""
    tags: list[str] = Field(default_factory=list)
    mood_snapshot: str = "neutral"
    highlight: bool = False


class ResidentMemoryResponse(BaseModel):
    id: str
    content: str
    timestamp: str
    importance: float
    emotion: str
    tick: int = 0
    type: str = "memoir"
    emotional_weight: float = 0.0
    related_resident_ids: list[str] = Field(default_factory=list)
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


class ResidentAchievementResponse(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    category: str
    unlocked: bool = False
    unlocked_at_tick: int | None = None


class AchievementLeaderboardEntryResponse(BaseModel):
    resident_id: str
    resident_name: str
    unlocked_count: int = 0
    achievements: list[dict[str, Any]] = Field(default_factory=list)


class CourseResponse(BaseModel):
    subject: str
    name: str
    building_id: str | None = None
    enrolled_tick: int = 0
    attendance_count: int = 0


class CourseHistoryEntryResponse(BaseModel):
    tick: int
    subject: str
    course_name: str


class EducationResponse(BaseModel):
    courses: list[CourseResponse] = Field(default_factory=list)
    knowledge_level: dict[str, float] = Field(default_factory=dict)
    course_history: list[CourseHistoryEntryResponse] = Field(default_factory=list)


class ResidentEducationResponse(BaseModel):
    resident_id: str
    resident_name: str
    education: EducationResponse


class WorldEducationCourseResponse(BaseModel):
    subject: str
    name: str
    building_id: str | None = None
    registration_count: int = 0


class CulturalEventResponse(BaseModel):
    type: str
    name: str
    venue_id: str
    organizer_id: str
    participants: list[str] = Field(default_factory=list)
    tick_start: int = 0
    duration: int = 0


class CultureProsperityPointResponse(BaseModel):
    tick: int
    prosperity_index: float


class CultureTalentRankingResponse(BaseModel):
    resident_id: str
    resident_name: str
    artistic_talent: float
    art_skill: float
    art_knowledge: float = 0.0


class WorldCultureResponse(BaseModel):
    events: list[CulturalEventResponse] = Field(default_factory=list)
    prosperity_index: float = 0.0
    prosperity_history: list[CultureProsperityPointResponse] = Field(default_factory=list)
    talent_rankings: list[CultureTalentRankingResponse] = Field(default_factory=list)


class ReligionDistributionResponse(BaseModel):
    religion: str
    label: str
    count: int
    share: float


class MoralityPointResponse(BaseModel):
    tick: int
    morality_index: float


class ReligiousEventResponse(BaseModel):
    religion: str
    event_type: str
    name: str
    venue_id: str
    leader_id: str
    participants: list[str] = Field(default_factory=list)
    tick_start: int = 0
    duration: int = 0
    town_mood_boost: float = 0.0
    morality_boost: float = 0.0


class ReligionLeaderResponse(BaseModel):
    resident_id: str
    resident_name: str
    religion: str
    piety: float
    reputation: float


class WorldReligionResponse(BaseModel):
    distribution: list[ReligionDistributionResponse] = Field(default_factory=list)
    morality_index: float = 0.0
    morality_history: list[MoralityPointResponse] = Field(default_factory=list)
    events: list[ReligiousEventResponse] = Field(default_factory=list)
    leaders: list[ReligionLeaderResponse] = Field(default_factory=list)


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
    resident_count: int
    building_count: int
    dominant_building_types: list[str] = Field(default_factory=list)


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
    intensity: float


class SafetyStatsResponse(BaseModel):
    safety_index: float
    average_safety_feeling: float
    total_crimes: int
    unresolved_crimes: int
    crimes_by_type: dict[str, int] = Field(default_factory=dict)
    hotspots: list[SafetyHotspotResponse] = Field(default_factory=list)
    flagged_residents: list[str] = Field(default_factory=list)
    patrol_zones: list[str] = Field(default_factory=list)


class ReputationHistoryEntryResponse(BaseModel):
    tick: int
    source: str
    delta: float
    before: float
    after: float


class ResidentReputationResponse(BaseModel):
    resident_id: str
    resident_name: str
    reputation: float
    title: str = ""
    history: list[ReputationHistoryEntryResponse] = Field(default_factory=list)


class ReputationRankingEntryResponse(BaseModel):
    resident_id: str
    resident_name: str
    reputation: float
    title: str = ""
    recent_events: list[str] = Field(default_factory=list)


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
    season: str
    forecast: list[str] = Field(default_factory=list)


class FestivalResponse(BaseModel):
    name: str
    type: str
    start_tick: int
    duration: int
    location: str
    participants: list[str] = Field(default_factory=list)
    status: str = "active"
    end_tick: int | None = None
    memorial: str | None = None


class FestivalListResponse(BaseModel):
    current: list[FestivalResponse] = Field(default_factory=list)
    history: list[FestivalResponse] = Field(default_factory=list)


class DisasterResponse(BaseModel):
    type: str
    severity: float
    affected_buildings: list[str] = Field(default_factory=list)
    tick_start: int
    duration: int
    casualties: int = 0
    status: str = "active"
    end_tick: int | None = None
    reserve_spent: float = 0.0
    evacuations: int = 0
    memorial: str | None = None


class DisasterSummaryResponse(BaseModel):
    active_count: int = 0
    history_count: int = 0
    affected_buildings: int = 0
    total_casualties: int = 0
    reserve_spent: float = 0.0
    by_type: dict[str, int] = Field(default_factory=dict)


class DisasterListResponse(BaseModel):
    current: list[DisasterResponse] = Field(default_factory=list)
    history: list[DisasterResponse] = Field(default_factory=list)
    summary: DisasterSummaryResponse = Field(default_factory=DisasterSummaryResponse)


class BulletinPostResponse(BaseModel):
    id: str
    author_id: str
    author_name: str
    content: str
    tick: int
    likes: list[str] = Field(default_factory=list)
    category: str
    topic: str
    subject_id: str
    tone: str = "neutral"


class BulletinTopicResponse(BaseModel):
    topic: str
    label: str
    category: str
    post_count: int
    heat: float
    sentiment: str = "neutral"


class WorldBulletinResponse(BaseModel):
    posts: list[BulletinPostResponse] = Field(default_factory=list)
    hot_topics: list[BulletinTopicResponse] = Field(default_factory=list)


class PoliticsMayorResponse(BaseModel):
    resident_id: str
    resident_name: str
    party: str = "neutral"
    term_start: int = 0
    term_end: int = 0
    approval: float = 0.0


class PoliticsPolicyResponse(BaseModel):
    type: str
    effect: dict[str, float] = Field(default_factory=dict)
    duration: int = 0
    issued_tick: int = 0


class PoliticsElectionResponse(BaseModel):
    issue: str
    total_votes: int = 0
    status: str = "active"


class WorldPoliticsResponse(BaseModel):
    mayor: PoliticsMayorResponse | None = None
    active_policies: list[PoliticsPolicyResponse] = Field(default_factory=list)
    election_countdown: int = 0
    public_satisfaction: float = 0.0
    party_distribution: dict[str, int] = Field(default_factory=dict)
    active_election: PoliticsElectionResponse | None = None
    impeachment_risk: bool = False


class DiplomacyTownResponse(BaseModel):
    name: str
    relation_score: float = 0.0
    relation_status: str = "neutral"
    trade_balance: float = 0.0
    ambassador_id: str | None = None
    ambassador_name: str | None = None
    specialties: list[str] = Field(default_factory=list)


class DiplomacyTradeRouteResponse(BaseModel):
    id: str
    from_town: str
    to_town: str
    goods: list[str] = Field(default_factory=list)
    profit_per_tick: float = 0.0
    merchant_id: str | None = None
    merchant_name: str | None = None
    relation_status: str = "neutral"
    rare_goods: list[str] = Field(default_factory=list)


class DiplomacyLedgerEntryResponse(BaseModel):
    tick: int
    type: str
    town_name: str
    route_id: str
    amount: float = 0.0
    description: str


class DiplomacySummaryResponse(BaseModel):
    active_routes: int = 0
    total_profit: float = 0.0
    total_trade_balance: float = 0.0


class WorldDiplomacyResponse(BaseModel):
    towns: list[DiplomacyTownResponse] = Field(default_factory=list)
    trade_routes: list[DiplomacyTradeRouteResponse] = Field(default_factory=list)
    summary: DiplomacySummaryResponse = Field(default_factory=DiplomacySummaryResponse)
    ledger: list[DiplomacyLedgerEntryResponse] = Field(default_factory=list)


class AchievementLeaderboardEntryResponse(BaseModel):
    resident_id: str
    resident_name: str
    unlocked_count: int
    achievements: list[ResidentAchievementResponse] = Field(default_factory=list)


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


class ResidentJobResponse(BaseModel):
    resident_id: str
    resident_name: str
    wallet: float = 0.0
    job: dict[str, Any] = Field(default_factory=dict)


class WorldEconomyResponse(BaseModel):
    employment_rate: float = 0.0
    average_income: float = 0.0
    gdp: float = 0.0
    unemployed_count: int = 0
    employed_count: int = 0
    employment_distribution: list[OccupationDistEntry] = Field(default_factory=list)
    income_distribution: list[dict[str, float | int | str]] = Field(default_factory=list)
    gdp_history: list[dict[str, float | int]] = Field(default_factory=list)


class EconomyCycleResponse(BaseModel):
    phase: str = "recovery"
    gdp_modifier: float = 1.0
    unemployment_modifier: float = 1.0
    started_tick: int = 0
    ticks_in_phase: int = 0
    ticks_remaining: int = 200
    next_phase: str = "boom"
    seasonal_modifier: float = 1.0
    gdp_history: list[dict[str, float | int]] = Field(default_factory=list)


class RumorEntry(BaseModel):
    secret_id: str = ""
    owner_id: str = ""
    owner_name: str = ""
    content: str = ""
    type: str = ""
    spread_count: int = 0
    is_public: bool = False
    revealed_tick: int = 0


class RecentLeak(BaseModel):
    tick: int = 0
    secret_id: str = ""
    owner_id: str = ""
    owner_name: str = ""
    told_to_id: str = ""
    told_to_name: str = ""
    content: str = ""
    type: str = ""
    spread_count: int = 0


class WorldRumorsResponse(BaseModel):
    rumors: list[RumorEntry] = Field(default_factory=list)
    total_secrets: int = 0
    total_spread: int = 0
    recent_leaks: list[RecentLeak] = Field(default_factory=list)


class MilestoneResponse(BaseModel):
    id: str = ""
    name: str = ""
    description: str = ""
    achieved: bool = False
    achieved_tick: int = 0
    unlocks: list[str] = Field(default_factory=list)


class TownRatingResponse(BaseModel):
    composite: float = 0.0
    population: float = 0.0
    happiness: float = 0.0
    economy: float = 0.0
    safety: float = 0.0
    education: float = 0.0
    culture: float = 0.0


class TownLevelResponse(BaseModel):
    level: int = 1
    rating: TownRatingResponse = Field(default_factory=TownRatingResponse)
    next_level_threshold: float = 0.15
    milestones: list[MilestoneResponse] = Field(default_factory=list)
    unlocks: list[str] = Field(default_factory=list)


class FashionTrendResponse(BaseModel):
    color_name: str
    color: str
    style: str
    category: str
    started_tick: int = 0


class FashionRankingEntryResponse(BaseModel):
    resident_id: str
    resident_name: str
    style_score: float = 0.0
    clothing: str = "casual"
    current_outfit: str = ""
    accent_color: str = "#38BDF8"
    trend_match: bool = False
    designed_by_tailor: bool = False


class FashionConsumptionResponse(BaseModel):
    total_purchases: int = 0
    total_spent: float = 0.0
    average_spend: float = 0.0
    top_category: str | None = None
    top_color: str | None = None
    recent_purchases: list[dict[str, Any]] = Field(default_factory=list)


class WorldFashionResponse(BaseModel):
    current_trend: FashionTrendResponse
    trend_history: list[FashionTrendResponse] = Field(default_factory=list)
    rankings: list[FashionRankingEntryResponse] = Field(default_factory=list)
    consumption: FashionConsumptionResponse = Field(default_factory=FashionConsumptionResponse)


class RoadResponse(BaseModel):
    from_building: str
    to_building: str
    distance: float
    road_type: str
    traffic: int = 0


class TransportHotspotResponse(BaseModel):
    road_key: str
    traffic: int
    slowdown: float


class TransportStatsResponse(BaseModel):
    mode_share: dict[str, int] = Field(default_factory=dict)
    average_travel_ticks: float = 0.0
    congestion_hotspots: list[TransportHotspotResponse] = Field(default_factory=list)


class WorldTransportResponse(BaseModel):
    roads: list[RoadResponse] = Field(default_factory=list)
    stats: TransportStatsResponse = Field(default_factory=TransportStatsResponse)


class GenerationalTimelineEntryResponse(BaseModel):
    tick: int
    type: str
    resident_id: str | None = None
    resident_name: str = ""
    summary: str = ""


class WorldDemographicsResponse(BaseModel):
    age_distribution: dict[str, int] = Field(default_factory=dict)
    aging_index: float = 0.0
    average_age: float = 0.0
    retired_count: int = 0
    recent_deaths: int = 0
    generational_timeline: list[GenerationalTimelineEntryResponse] = Field(default_factory=list)


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


class NewsArticleResponse(BaseModel):
    headline: str = ""
    content: str = ""
    category: str = "general"
    importance: float = 0.5
    tick: int = 0
    icon: str = ""


class NewsArchiveEntry(BaseModel):
    edition: int = 0
    tick: int = 0
    headline: str = ""
    article_count: int = 0


class WorldNewsResponse(BaseModel):
    headline: str = ""
    latest_edition: int = 0
    latest_tick: int = 0
    articles: list[NewsArticleResponse] = Field(default_factory=list)
    archive: list[NewsArchiveEntry] = Field(default_factory=list)


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


class WorldRomanceStatsResponse(BaseModel):
    couples_count: int = 0
    marriages: int = 0
    dating_pairs: int = 0
    divorces: int = 0


class RomancePartnerInfo(BaseModel):
    id: str
    name: str


class ResidentRomanceResponse(BaseModel):
    relationship_status: str = "single"
    partner: RomancePartnerInfo | None = None
    love_intensity: float = 0.0
