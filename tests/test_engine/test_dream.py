"""Tests for the dream system."""
import random

import pytest

from engine.dream import (
    DREAMS,
    _assign_initial_dream,
    _compute_progress_delta,
    _fulfill_dream,
    get_dream_stats,
    process_dream_tick,
)
from engine.types import (
    DiaryEntry,
    FamilyInfo,
    Job,
    RelationshipStatus,
    Resident,
    TravelEntry,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_resident(rid: str = "r1", **kwargs) -> Resident:
    defaults = dict(
        id=rid,
        name=f"居民{rid}",
        personality="和善",
        age_days=500,
        age_stage="adult",
        wallet=0.0,
        coins=100,
        skills={},
        safety_feeling=0.5,
        travel_log=[],
        traveling=False,
        diary=[],
        relationship_status=RelationshipStatus.single,
        family=FamilyInfo(),
        dream="",
        dream_progress=0.0,
    )
    defaults.update(kwargs)
    return Resident(**defaults)


class FakeAgent:
    def __init__(self, resident):
        self.resident = resident


class FakeWorld:
    def __init__(self, agents=None):
        self.current_tick = 10
        self.agents = agents or []
        self._mood_shifts = []

    def simulation_time(self):
        return "Day 1"

    def shift_resident_mood(self, agent, amount, cause):
        self._mood_shifts.append((agent.resident.id, amount, cause))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_dreams_list_has_eight_entries():
    assert len(DREAMS) == 8


def test_assign_initial_dream_sets_dream():
    resident = _make_resident()
    rng = random.Random(42)
    _assign_initial_dream(resident, rng)
    assert resident.dream in DREAMS
    assert resident.dream_progress == 0.0


def test_assign_initial_dream_does_not_overwrite_existing():
    resident = _make_resident(dream="成为富翁", dream_progress=0.5)
    rng = random.Random(42)
    _assign_initial_dream(resident, rng)
    assert resident.dream == "成为富翁"
    assert resident.dream_progress == 0.5


def test_compute_progress_delta_wealth():
    resident = _make_resident(dream="成为富翁", wallet=600.0)
    world = FakeWorld()
    delta = _compute_progress_delta(world, resident)
    # Should receive active progress (not just baseline)
    assert delta > 0.001


def test_compute_progress_delta_travel():
    completed_trip = TravelEntry(
        destination="邻镇集市",
        destination_type="neighboring_town",
        tick_departed=1,
        tick_returned=10,
        souvenirs=["香料"],
    )
    resident = _make_resident(dream="环游世界", travel_log=[completed_trip])
    world = FakeWorld()
    delta = _compute_progress_delta(world, resident)
    assert delta > 0.001


def test_compute_progress_delta_romance():
    resident = _make_resident(dream="找到真爱", relationship_status=RelationshipStatus.married)
    world = FakeWorld()
    delta = _compute_progress_delta(world, resident)
    assert delta > 0.001


def test_fulfill_dream_resets_progress_and_sets_new_dream():
    resident = _make_resident(dream="成为富翁", dream_progress=1.0)
    agent = FakeAgent(resident)
    world = FakeWorld()
    rng = random.Random(99)
    event = _fulfill_dream(world, agent, rng)

    assert resident.dream_progress == 0.0
    assert resident.dream != "成为富翁"
    assert resident.dream in DREAMS
    assert "成为富翁" in event.description
    assert len(world._mood_shifts) == 1
    assert world._mood_shifts[0] == (resident.id, 3, "dream_fulfilled")


def test_fulfill_dream_appends_diary_entry():
    resident = _make_resident(dream="留下传说", dream_progress=1.0)
    agent = FakeAgent(resident)
    world = FakeWorld()
    rng = random.Random(7)
    _fulfill_dream(world, agent, rng)
    assert any("dream" in e.tags for e in resident.diary)
    assert any(e.highlight for e in resident.diary)


def test_fulfill_dream_records_world_fulfillment():
    resident = _make_resident(dream="环游世界", dream_progress=1.0)
    agent = FakeAgent(resident)
    world = FakeWorld()
    rng = random.Random(1)
    _fulfill_dream(world, agent, rng)
    assert hasattr(world, "_dream_fulfillments")
    assert len(world._dream_fulfillments) == 1
    assert world._dream_fulfillments[0]["dream"] == "环游世界"


def test_process_dream_tick_skips_children():
    child = _make_resident("child1", age_stage="child", dream="", dream_progress=0.0)
    agent = FakeAgent(child)
    world = FakeWorld(agents=[agent])
    process_dream_tick(world)
    # Children should not get a dream assigned
    assert child.dream == ""


def test_process_dream_tick_assigns_dream_to_adult():
    adult = _make_resident("a1", age_stage="adult", dream="", dream_progress=0.0)
    agent = FakeAgent(adult)
    world = FakeWorld(agents=[agent])
    process_dream_tick(world, random.Random(42))
    assert adult.dream in DREAMS


def test_process_dream_tick_returns_event_on_fulfillment():
    # Set resident with dream nearly fulfilled and wealth condition met
    adult = _make_resident("a2", age_stage="adult", dream="成为富翁", dream_progress=0.999, wallet=600.0)
    agent = FakeAgent(adult)
    world = FakeWorld(agents=[agent])
    events = process_dream_tick(world, random.Random(5))
    assert len(events) == 1
    assert "成为富翁" in events[0].description


def test_get_dream_stats_empty():
    world = FakeWorld(agents=[])
    stats = get_dream_stats(world)
    assert stats["dreams_fulfilled_total"] == 0
    assert stats["top_dreams"] == []
    assert stats["avg_progress"] == 0.0
    assert stats["recent_fulfillments"] == []


def test_get_dream_stats_counts_dreams():
    a1 = _make_resident("a1", age_stage="adult", dream="成为富翁", dream_progress=0.3)
    a2 = _make_resident("a2", age_stage="adult", dream="成为富翁", dream_progress=0.6)
    a3 = _make_resident("a3", age_stage="adult", dream="找到真爱", dream_progress=0.1)
    world = FakeWorld(agents=[FakeAgent(a) for a in [a1, a2, a3]])
    stats = get_dream_stats(world)
    assert stats["top_dreams"][0]["dream"] == "成为富翁"
    assert stats["top_dreams"][0]["count"] == 2
    assert abs(stats["avg_progress"] - (0.3 + 0.6 + 0.1) / 3) < 0.01
