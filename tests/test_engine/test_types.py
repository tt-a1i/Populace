"""Tests for engine/types.py — dataclass creation and basic validation."""
from dataclasses import asdict

import pytest

from engine.types import (
    Building,
    Event,
    Memory,
    Reflection,
    RelationType,
    Relationship,
    Resident,
    TickState,
    WorldConfig,
)


def test_resident_defaults():
    r = Resident(id="r1", name="小明", personality="外向")
    assert r.mood == "neutral"
    assert r.location is None
    assert r.goals == []
    assert r.x == 0 and r.y == 0


def test_resident_serialisation():
    r = Resident(id="r1", name="小明", personality="外向", goals=["交朋友"], mood="happy")
    d = asdict(r)
    assert d["id"] == "r1"
    assert d["goals"] == ["交朋友"]


def test_building_creation():
    b = Building(id="b1", type="cafe", name="咖啡馆", capacity=4, position=(5, 5))
    assert b.capacity == 4
    assert b.position == (5, 5)


def test_memory_creation():
    m = Memory(id="m1", content="遇见小红", timestamp="Day 1, 08:00", importance=0.8, emotion="happy")
    assert m.importance == 0.8


def test_event_creation():
    e = Event(id="e1", description="下雨了", timestamp="Day 1, 10:00", source="user")
    assert e.source == "user"


def test_reflection_creation():
    rf = Reflection(id="rf1", summary="感觉今天不错", timestamp="Day 1, 12:00", derived_from=["m1", "m2"])
    assert len(rf.derived_from) == 2


def test_relation_type_enum():
    assert RelationType.friendship.value == "friendship"
    assert RelationType.love.value == "love"
    assert RelationType("rivalry") == RelationType.rivalry


def test_relationship_creation():
    rel = Relationship(
        from_id="r1", to_id="r2",
        type=RelationType.friendship,
        intensity=0.7,
        since="Day 1, 00:00",
        familiarity=0.3,
    )
    assert rel.intensity == 0.7


def test_world_config_defaults():
    cfg = WorldConfig()
    assert cfg.tick_per_day == 48
    assert cfg.map_width_tiles == 40
    assert cfg.llm_call_probability == 0.2


def test_tick_state_empty():
    ts = TickState(tick=1, time="Day 1, 00:30")
    assert ts.movements == []
    assert ts.dialogues == []
    assert ts.relationships == []
