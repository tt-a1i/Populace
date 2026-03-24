"""Core type definitions for the Populace simulation engine.

Matches the Neo4j graph model described in spec §4.5 and
configuration parameters from spec §16.

When Python starts in the ``engine/`` directory, stdlib imports such as
``import types`` can accidentally resolve to this file. The top-level shim
below delegates that case back to the real stdlib ``types`` module so that
``python -m pip`` and standalone demos keep working from inside ``engine/``.
"""
from __future__ import annotations

if __name__ == "types":
    import sys

    stdlib_types = (
        f"{sys.base_prefix}/lib/python{sys.version_info.major}.{sys.version_info.minor}/types.py"
    )
    namespace = {
        "__name__": "types",
        "__file__": stdlib_types,
        "__package__": "",
        "__builtins__": __builtins__,
    }
    with open(stdlib_types, "r", encoding="utf-8") as fh:
        exec(compile(fh.read(), stdlib_types, "exec"), namespace)
    globals().update(namespace)
else:
    from dataclasses import dataclass, field
    from enum import Enum
    from typing import Dict, List, Optional, Tuple

    # ---------------------------------------------------------------------------
    # Enums
    # ---------------------------------------------------------------------------

    class RelationType(str, Enum):
        knows = "knows"
        love = "love"
        friendship = "friendship"
        rivalry = "rivalry"
        fear = "fear"
        trust = "trust"
        dislike = "dislike"


    class WeatherType(str, Enum):
        sunny = "sunny"
        cloudy = "cloudy"
        rainy = "rainy"
        stormy = "stormy"
        snowy = "snowy"


    class Season(str, Enum):
        spring = "spring"
        summer = "summer"
        autumn = "autumn"
        winter = "winter"


    # ---------------------------------------------------------------------------
    # Neo4j node types (§4.5)
    # ---------------------------------------------------------------------------

    @dataclass
    class DiaryEntry:
        """A daily journal entry written by a resident at end of day."""
        id: str
        date: str      # e.g. "Day 3"
        tick: int      # tick at which the entry was generated
        summary: str = ""   # backward-compatible narrative text alias
        day: int = 0
        content: str = ""
        tags: List[str] = field(default_factory=list)
        mood_snapshot: str = "neutral"
        highlight: bool = False

        def __post_init__(self) -> None:
            if not self.content and self.summary:
                self.content = self.summary
            if not self.summary and self.content:
                self.summary = self.content
            if self.day <= 0 and self.date.startswith("Day "):
                day_token = self.date.split(",", 1)[0].replace("Day ", "").strip()
                if day_token.isdigit():
                    self.day = int(day_token)

    @dataclass
    class MoodEntry:
        tick: int
        mood: str
        cause: str

    @dataclass
    class ReputationEntry:
        tick: int
        source: str
        delta: float
        before: float
        after: float

    @dataclass
    class Weather:
        current: "WeatherType" = WeatherType.sunny
        season: "Season" = Season.spring
        forecast: List[str] = field(default_factory=list)

    @dataclass
    class Item:
        name: str
        quantity: int = 1
        value: int = 0

    @dataclass
    class Pet:
        id: str
        name: str
        species: str
        owner_id: Optional[str] = None
        mood: str = "calm"
        hunger: float = 1.0
        location: Optional[str] = None
        x: int = 0
        y: int = 0

    @dataclass
    class Course:
        subject: str
        name: str
        building_id: Optional[str] = None
        enrolled_tick: int = 0
        attendance_count: int = 0

    @dataclass
    class CourseHistoryEntry:
        tick: int
        subject: str
        course_name: str

    @dataclass
    class FamilyInfo:
        parent_ids: List[str] = field(default_factory=list)
        sibling_ids: List[str] = field(default_factory=list)
        partner_id: Optional[str] = None
        children_ids: List[str] = field(default_factory=list)
        family_name: str = ""

    @dataclass
    class Festival:
        name: str
        type: str
        start_tick: int
        duration: int
        location: str
        participants: List[str] = field(default_factory=list)

    @dataclass
    class Education:
        courses: List["Course"] = field(default_factory=list)
        knowledge_level: Dict[str, float] = field(default_factory=dict)
        course_history: List["CourseHistoryEntry"] = field(default_factory=list)

    @dataclass
    class Job:
        title: str = "unemployed"
        workplace_id: Optional[str] = None
        salary: float = 0.0
        work_hours: List[int] = field(default_factory=lambda: [8, 12, 13, 17])
        satisfaction: float = 0.5

    @dataclass
    class Achievement:
        id: str
        name: str
        description: str
        category: str
        unlocked_at_tick: int = 0
        icon: str = "🏅"

    @dataclass
    class CrimeEvent:
        type: str
        perpetrator: str
        victim: Optional[str]
        location: str
        tick: int
        resolved: bool = False

    @dataclass
    class Resident:
        """An AI resident of the town. Maps to a Neo4j ``Resident`` node."""

        id: str
        name: str
        personality: str
        goals: List[str] = field(default_factory=list)
        mood: str = "neutral"
        location: Optional[str] = None
        x: int = 0
        y: int = 0
        home_building_id: Optional[str] = None
        skin_color: Optional[str] = None
        hair_style: Optional[str] = None
        hair_color: Optional[str] = None
        outfit_color: Optional[str] = None
        current_goal: Optional[str] = None   # active short-term goal text
        coins: int = 100
        occupation: str = "unemployed"
        wallet: float = 0.0
        job: "Job" = field(default_factory=Job)
        skills: Dict[str, float] = field(default_factory=dict)
        inventory: List["Item"] = field(default_factory=list)
        energy: float = 1.0
        age_days: int = 0
        mood_history: List["MoodEntry"] = field(default_factory=list)
        mental_state: str = "stable"
        low_mood_ticks: int = 0
        safety_feeling: float = 1.0
        flagged_for_crime: bool = False
        reputation: float = 0.0
        reputation_history: List["ReputationEntry"] = field(default_factory=list)
        education: "Education" = field(default_factory=Education)
        family: "FamilyInfo" = field(default_factory=FamilyInfo)
        achievements: List["Achievement"] = field(default_factory=list)
        memories: List["Memory"] = field(default_factory=list)
        pets: List["Pet"] = field(default_factory=list)
        diary: List["DiaryEntry"] = field(default_factory=list)


    @dataclass
    class Building:
        """A building on the town map. Maps to a Neo4j ``Building`` node."""

        id: str
        type: str
        name: str
        capacity: int
        position: Tuple[int, int]


    @dataclass
    class ZoneBounds:
        x: int
        y: int
        width: int
        height: int


    @dataclass
    class ZoneAtmosphere:
        noise: float
        safety: float
        beauty: float


    @dataclass
    class Zone:
        id: str
        name: str
        type: str
        bounds: "ZoneBounds"
        atmosphere: "ZoneAtmosphere"


    @dataclass
    class Memory:
        id: str
        content: str
        timestamp: str
        importance: float
        emotion: str
        tick: int = 0
        type: str = "memoir"
        emotional_weight: float = 0.0
        related_resident_ids: List[str] = field(default_factory=list)
        source: str = "system"  # 'system' | 'heartbeat' | 'dialogue' | 'event' | 'gossip' | 'injected'

        def __post_init__(self) -> None:
            if self.tick <= 0 and self.timestamp.startswith("Day "):
                day_token = self.timestamp.split(",", 1)[0].replace("Day ", "").strip()
                if day_token.isdigit():
                    self.tick = int(day_token)

            if self.type == "memoir":
                source_map = {
                    "dialogue": "first_meeting",
                    "gossip": "festival",
                    "event": "festival",
                    "injected": "gift",
                }
                self.type = source_map.get(self.source, "achievement" if self.emotion == "proud" else "memoir")

            if self.emotional_weight == 0.0:
                if self.emotion in {"happy", "excited", "ecstatic", "calm", "content", "proud"}:
                    self.emotional_weight = round(max(0.1, self.importance), 3)
                elif self.emotion in {"sad", "angry", "fearful", "tired"}:
                    self.emotional_weight = round(-max(0.1, self.importance), 3)


    @dataclass
    class Event:
        id: str
        description: str
        timestamp: str
        source: str


    @dataclass
    class Reflection:
        id: str
        summary: str
        timestamp: str
        derived_from: List[str] = field(default_factory=list)


    # ---------------------------------------------------------------------------
    # Neo4j relationship types (§4.5)
    # ---------------------------------------------------------------------------

    @dataclass
    class Relationship:
        """Directed resident relationship edge."""

        from_id: str
        to_id: str
        type: RelationType
        intensity: float
        since: str = ""
        familiarity: float = 0.0
        reason: str = ""


    # ---------------------------------------------------------------------------
    # WebSocket / tick diff types (§4.5)
    # ---------------------------------------------------------------------------

    @dataclass
    class MovementUpdate:
        id: str
        x: int
        y: int
        action: str


    @dataclass
    class DialogueUpdate:
        from_id: str
        to_id: str
        text: str
        kind: str = "dialogue"


    @dataclass
    class RelationshipDelta:
        from_id: str
        to_id: str
        type: str
        delta: float


    @dataclass
    class EventUpdate:
        description: str


    @dataclass
    class GoalUpdate:
        """Agent's current active goal, pushed with each tick."""
        id: str    # resident id
        goal: str  # short goal text, e.g. "去咖啡馆找小红聊天"


    @dataclass
    class EnergyUpdate:
        """Current energy level for a resident, pushed with each tick."""
        id: str      # resident id
        energy: float  # [0.0, 1.0]


    @dataclass
    class AchievementUnlock:
        """Fired when a resident unlocks an achievement this tick."""
        resident_id: str
        achievement_id: str
        achievement_name: str
        icon: str
        resident_name: str = ""
        category: str = ""
        unlocked_at_tick: int = 0


    @dataclass
    class RelationshipEvent:
        """Fired when a relationship crosses a key intensity threshold."""
        from_id: str
        to_id: str
        from_name: str
        to_name: str
        event_type: str   # 'best_friends' | 'confession' | 'public_argument'
        dialogue: str     # special dialogue text for this milestone


    @dataclass
    class GossipUpdate:
        """A gossip event surfaced to the frontend for bubble rendering."""
        speaker_id: str
        listener_id: str
        target_id: str
        target_name: str
        content: str
        is_positive: bool


    @dataclass
    class PopulationResidentSnapshot:
        """Resident data embedded in birth/death events for the frontend."""

        id: str
        name: str
        personality: str
        mood: str = "neutral"
        location: Optional[str] = None
        x: int = 0
        y: int = 0
        home_building_id: Optional[str] = None
        skin_color: Optional[str] = None
        hair_style: Optional[str] = None
        hair_color: Optional[str] = None
        outfit_color: Optional[str] = None
        coins: int = 100
        occupation: str = "unemployed"
        skills: Dict[str, float] = field(default_factory=dict)
        inventory: List["Item"] = field(default_factory=list)
        energy: float = 1.0
        age_days: int = 0
        goals: List[str] = field(default_factory=list)


    @dataclass
    class PopulationEvent:
        """Birth/death event surfaced to the frontend and history timeline."""

        event_type: str
        resident_id: str
        resident_name: str
        resident: "PopulationResidentSnapshot"
        parent_ids: List[str] = field(default_factory=list)
        parent_names: List[str] = field(default_factory=list)
        summary: str = ""


    @dataclass
    class VoteUpdate:
        id: str
        issue: str
        options: List[str] = field(default_factory=list)
        counts: dict[str, int] = field(default_factory=dict)
        status: str = "active"
        start_tick: int = 0
        end_tick: int = 0
        winning_option: Optional[str] = None
        result_announced: bool = False
        total_votes: int = 0
        effects: List[str] = field(default_factory=list)
        effects: List[str] = field(default_factory=list)

    @dataclass
    class FestivalUpdate:
        festival: "Festival"
        status: str = "started"
        memorial: Optional[str] = None


    @dataclass
    class TickState:
        """Complete diff pushed to the frontend each tick."""

        tick: int
        time: str
        movements: List[MovementUpdate] = field(default_factory=list)
        dialogues: List[DialogueUpdate] = field(default_factory=list)
        relationships: List[RelationshipDelta] = field(default_factory=list)
        events: List[EventUpdate] = field(default_factory=list)
        weather: str = WeatherType.sunny.value
        goals: List["GoalUpdate"] = field(default_factory=list)
        achievement_unlocks: List["AchievementUnlock"] = field(default_factory=list)
        relationship_events: List["RelationshipEvent"] = field(default_factory=list)
        season: str = Season.spring.value
        energy_updates: List["EnergyUpdate"] = field(default_factory=list)
        gossips: List["GossipUpdate"] = field(default_factory=list)
        population_events: List["PopulationEvent"] = field(default_factory=list)
        vote_updates: List["VoteUpdate"] = field(default_factory=list)
        vote_announcements: List["VoteUpdate"] = field(default_factory=list)
        festival_updates: List["FestivalUpdate"] = field(default_factory=list)


    # ---------------------------------------------------------------------------
    # World configuration (§16)
    # ---------------------------------------------------------------------------

    @dataclass
    class WorldConfig:
        """All tunable simulation parameters."""

        tick_interval_seconds: float = 3.0
        tick_per_day: int = 48  # must be > 0

        def __post_init__(self) -> None:
            if self.tick_per_day < 1:
                raise ValueError("tick_per_day must be >= 1")
        max_concurrent_llm_calls: int = 3
        llm_timeout_seconds: float = 5.0
        llm_call_probability: float = 0.2

        short_term_memory_size: int = 20
        reflection_threshold: int = 10
        relationship_decay_rate: float = 0.01

        map_width_tiles: int = 40
        map_height_tiles: int = 30
        tile_size_px: int = 32
        interaction_distance: int = 2
        max_dialogues_per_tick: int = 2

        snapshot_interval_ticks: int = 10
        seed: Optional[int] = None
