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
    from typing import List, Optional, Tuple

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


    # ---------------------------------------------------------------------------
    # Neo4j node types (§4.5)
    # ---------------------------------------------------------------------------

    @dataclass
    class DiaryEntry:
        """A daily journal entry written by a resident at end of day."""
        id: str
        date: str      # e.g. "Day 3"
        tick: int      # tick at which the entry was generated
        summary: str   # narrative diary text

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
        energy: float = 1.0
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
    class Memory:
        id: str
        content: str
        timestamp: str
        importance: float
        emotion: str


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
        season: str = "spring"
        energy_updates: List["EnergyUpdate"] = field(default_factory=list)


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
