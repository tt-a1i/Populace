"""Core type definitions for the Populace simulation engine.

Matches the Neo4j graph model described in spec §4.5 and
configuration parameters from spec §16.
"""
from __future__ import annotations

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


# ---------------------------------------------------------------------------
# Neo4j node types (§4.5)
# ---------------------------------------------------------------------------

@dataclass
class Resident:
    """An AI resident of the town.  Maps to (Resident) node in Neo4j."""
    id: str
    name: str
    personality: str          # e.g. "外向, 善良, 喜欢八卦"
    goals: List[str] = field(default_factory=list)
    mood: str = "neutral"     # happy | sad | angry | neutral | ...
    location: Optional[str] = None  # building id, or None if on the map
    x: int = 0               # tile grid x-coordinate
    y: int = 0               # tile grid y-coordinate


@dataclass
class Building:
    """A building on the town map.  Maps to (Building) node in Neo4j."""
    id: str
    type: str                 # cafe | home | park | shop | school | ...
    name: str
    capacity: int
    position: Tuple[int, int]  # (tile_x, tile_y) of entrance


@dataclass
class Memory:
    """A single memory entry.  Maps to (Memory) node in Neo4j."""
    id: str
    content: str
    timestamp: str            # e.g. "Day 1, 08:30"
    importance: float         # 0.0 – 1.0
    emotion: str              # happy | sad | angry | surprised | neutral | ...


@dataclass
class Event:
    """An in-world event.  Maps to (Event) node in Neo4j."""
    id: str
    description: str
    timestamp: str
    source: str               # "user" | "system"


@dataclass
class Reflection:
    """A high-level cognitive summary.  Maps to (Reflection) node in Neo4j."""
    id: str
    summary: str
    timestamp: str
    derived_from: List[str] = field(default_factory=list)  # Memory ids


# ---------------------------------------------------------------------------
# Neo4j relationship types (§4.5)
# ---------------------------------------------------------------------------

@dataclass
class Relationship:
    """Directed resident relationship edge.

    Covers both the base acquaintance edge from spec §4.5
    ``(Resident)-[:KNOWS {since, familiarity}]->(Resident)`` and the
    emotional FEELS edge. ``type="knows"`` represents neutral
    acquaintance; other values map to FEELS ``type``.
    """
    from_id: str
    to_id: str
    type: RelationType
    intensity: float          # 0.0 (neutral) … 1.0 (very strong)
    since: str = ""
    familiarity: float = 0.0  # 0.0 … 1.0; does not decay once established
    reason: str = ""


# ---------------------------------------------------------------------------
# WebSocket / tick diff types (§4.5 WebSocket message format)
# ---------------------------------------------------------------------------

@dataclass
class MovementUpdate:
    id: str
    x: int
    y: int
    action: str               # "walking" | "standing" | "in_building"


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
class TickState:
    """Complete diff pushed to the frontend each tick (§4.5, §8)."""
    tick: int
    time: str                                           # "Day 3, 14:30"
    movements: List[MovementUpdate] = field(default_factory=list)
    dialogues: List[DialogueUpdate] = field(default_factory=list)
    relationships: List[RelationshipDelta] = field(default_factory=list)
    events: List[EventUpdate] = field(default_factory=list)


# ---------------------------------------------------------------------------
# World configuration (§16)
# ---------------------------------------------------------------------------

@dataclass
class WorldConfig:
    """All tunable simulation parameters, mirroring backend/core/config.py §16."""
    # Simulation params
    tick_interval_seconds: float = 3.0
    tick_per_day: int = 48
    max_concurrent_llm_calls: int = 3
    llm_timeout_seconds: float = 5.0
    llm_call_probability: float = 0.2

    # Memory params
    short_term_memory_size: int = 20
    reflection_threshold: int = 10
    relationship_decay_rate: float = 0.01

    # Spatial params (§10)
    map_width_tiles: int = 40
    map_height_tiles: int = 30
    tile_size_px: int = 32
    interaction_distance: int = 2
    max_dialogues_per_tick: int = 2

    # Persistence
    snapshot_interval_ticks: int = 10

    # Deterministic mode (spec §15)
    seed: Optional[int] = None
