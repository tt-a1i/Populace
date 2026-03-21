"""Tests for the relationship threshold event system."""
from __future__ import annotations

import pytest

from engine.types import RelationType, Relationship, Resident, WorldConfig
from engine.world import World
from engine.generative_agent import GenerativeAgent
from engine.relationship_events import check_relationship_events


def _make_world_with_pair(
    from_id: str,
    to_id: str,
    rel_type: RelationType,
    intensity: float,
) -> tuple[World, GenerativeAgent, GenerativeAgent]:
    world = World(WorldConfig())
    r_a = Resident(id=from_id, name="Alice", personality="friendly")
    r_b = Resident(id=to_id, name="Bob", personality="calm")
    a_a = GenerativeAgent(r_a)
    a_b = GenerativeAgent(r_b)
    world.add_agent(a_a)
    world.add_agent(a_b)
    world.set_relationship(
        Relationship(from_id=from_id, to_id=to_id, type=rel_type, intensity=intensity, since="Day 1")
    )
    return world, a_a, a_b


class _FakeState:
    """Minimal stand-in for SimulationState in tests."""


# ---------------------------------------------------------------------------
# Threshold triggers
# ---------------------------------------------------------------------------

def test_best_friends_fires_at_threshold() -> None:
    world, _, _ = _make_world_with_pair("a1", "b1", RelationType.friendship, 0.80)
    state = _FakeState()
    events = check_relationship_events(world, state)
    assert len(events) == 1
    assert events[0]["event_type"] == "best_friends"


def test_confession_fires_at_threshold() -> None:
    world, _, _ = _make_world_with_pair("a2", "b2", RelationType.love, 0.90)
    state = _FakeState()
    events = check_relationship_events(world, state)
    assert len(events) == 1
    assert events[0]["event_type"] == "confession"


def test_public_argument_fires_at_threshold() -> None:
    world, _, _ = _make_world_with_pair("a3", "b3", RelationType.rivalry, 0.80)
    state = _FakeState()
    events = check_relationship_events(world, state)
    assert len(events) == 1
    assert events[0]["event_type"] == "public_argument"


def test_no_event_below_threshold() -> None:
    world, _, _ = _make_world_with_pair("a4", "b4", RelationType.friendship, 0.79)
    state = _FakeState()
    events = check_relationship_events(world, state)
    assert events == []


# ---------------------------------------------------------------------------
# One-time firing (idempotent on repeated calls)
# ---------------------------------------------------------------------------

def test_event_fires_only_once() -> None:
    world, _, _ = _make_world_with_pair("a5", "b5", RelationType.friendship, 0.85)
    state = _FakeState()
    events_first = check_relationship_events(world, state)
    events_second = check_relationship_events(world, state)
    assert len(events_first) == 1
    assert events_second == []


# ---------------------------------------------------------------------------
# Event content
# ---------------------------------------------------------------------------

def test_event_has_required_fields() -> None:
    world, _, _ = _make_world_with_pair("a6", "b6", RelationType.love, 0.95)
    state = _FakeState()
    ev = check_relationship_events(world, state)[0]
    assert "from_id" in ev
    assert "to_id" in ev
    assert "from_name" in ev
    assert "to_name" in ev
    assert "event_type" in ev
    assert "dialogue" in ev
    assert len(ev["dialogue"]) > 0


def test_dialogue_contains_names() -> None:
    world, _, _ = _make_world_with_pair("a7", "b7", RelationType.friendship, 0.90)
    state = _FakeState()
    ev = check_relationship_events(world, state)[0]
    assert "Alice" in ev["dialogue"] or "Bob" in ev["dialogue"]


# ---------------------------------------------------------------------------
# Mood effects
# ---------------------------------------------------------------------------

def test_best_friends_sets_happy_mood() -> None:
    world, a_a, a_b = _make_world_with_pair("a8", "b8", RelationType.friendship, 0.85)
    state = _FakeState()
    check_relationship_events(world, state)
    assert a_a.resident.mood == "happy"
    assert a_b.resident.mood == "happy"


def test_public_argument_sets_angry_mood() -> None:
    world, a_a, a_b = _make_world_with_pair("a9", "b9", RelationType.rivalry, 0.90)
    state = _FakeState()
    check_relationship_events(world, state)
    assert a_a.resident.mood == "angry"
    assert a_b.resident.mood == "angry"


# ---------------------------------------------------------------------------
# hasattr guard (test environment uses __new__)
# ---------------------------------------------------------------------------

def test_hasattr_guard_initialises_fired_set() -> None:
    """check_relationship_events must work even when state has no _rel_events_fired."""
    world, _, _ = _make_world_with_pair("a10", "b10", RelationType.love, 0.95)
    state = object.__new__(_FakeState)  # skip __init__, no attrs at all
    events = check_relationship_events(world, state)
    assert len(events) == 1
    assert hasattr(state, "_rel_events_fired")
