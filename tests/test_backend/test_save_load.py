"""Regression tests: save_state → load_state round-trip preserves all fields."""
from __future__ import annotations

import asyncio
import pytest

from backend.api.simulation import SimulationState
from engine.types import DiaryEntry, RelationType, Relationship


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture()
def state():
    """Fresh SimulationState with a clean event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        s = SimulationState()
        yield s
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_save_load_tick(state):
    state.world.current_tick = 42
    saved = state.save_state()
    _run(state.load_state(saved))
    assert state.world.current_tick == 42


def test_save_load_season(state):
    state.world.season = "winter"
    saved = state.save_state()
    _run(state.load_state(saved))
    assert state.world.season == "winter"


def test_save_load_energy(state):
    agent = state.world.agents[0]
    agent.resident.energy = 0.37
    saved = state.save_state()
    _run(state.load_state(saved))
    r0 = state.world.agents[0].resident
    assert abs(r0.energy - 0.37) < 1e-6


def test_save_load_coins(state):
    agent = state.world.agents[0]
    agent.resident.coins = 999
    saved = state.save_state()
    _run(state.load_state(saved))
    assert state.world.agents[0].resident.coins == 999


def test_save_load_occupation(state):
    agent = state.world.agents[0]
    agent.resident.occupation = "baker"
    saved = state.save_state()
    _run(state.load_state(saved))
    assert state.world.agents[0].resident.occupation == "baker"


def test_save_load_diary(state):
    agent = state.world.agents[0]
    entry = DiaryEntry(id="d1", date="Day 1, 08:00", tick=1, summary="出门散步")
    agent.resident.diary.append(entry)
    saved = state.save_state()
    _run(state.load_state(saved))
    diary = state.world.agents[0].resident.diary
    assert len(diary) == 1
    assert diary[0].summary == "出门散步"
    assert diary[0].id == "d1"


def test_save_load_achievements(state):
    state._achievements_store = {"r1": {"first_friend", "social_butterfly"}}
    saved = state.save_state()
    _run(state.load_state(saved))
    assert "r1" in state._achievements_store
    assert state._achievements_store["r1"] == {"first_friend", "social_butterfly"}


def test_save_load_mood_history(state):
    state._mood_history = [
        {"tick": 1, "resident_id": "r1", "resident_name": "小明", "mood": "happy"},
        {"tick": 2, "resident_id": "r1", "resident_name": "小明", "mood": "sad"},
    ]
    saved = state.save_state()
    _run(state.load_state(saved))
    assert len(state._mood_history) == 2
    assert state._mood_history[0]["mood"] == "happy"


def test_save_load_active_events(state):
    state._active_events = [
        {"name": "festival", "description": "节日", "radius": 5, "remaining_ticks": 10, "source": "system"},
    ]
    saved = state.save_state()
    _run(state.load_state(saved))
    assert len(state._active_events) == 1
    assert state._active_events[0]["name"] == "festival"


def test_save_load_world_timeline(state):
    state._world_timeline = [
        {"id": "t1", "event_type": "weather_change", "description": "天气转晴", "tick": 5, "time": "Day 1", "metadata": {}},
    ]
    state._timeline_id_counter = 7
    saved = state.save_state()
    _run(state.load_state(saved))
    assert len(state._world_timeline) == 1
    assert state._world_timeline[0]["id"] == "t1"
    assert state._timeline_id_counter == 7


def test_save_load_rel_events_fired(state):
    state._rel_events_fired = {
        ("r1", "r2", "best_friends"),
        ("r3", "r4", "confession"),
    }
    saved = state.save_state()
    _run(state.load_state(saved))
    assert ("r1", "r2", "best_friends") in state._rel_events_fired
    assert ("r3", "r4", "confession") in state._rel_events_fired
    assert len(state._rel_events_fired) == 2


def test_save_load_buildings_visited(state):
    state._buildings_visited = {"r1": {"cafe1", "home1"}, "r2": {"park1"}}
    saved = state.save_state()
    _run(state.load_state(saved))
    assert state._buildings_visited["r1"] == {"cafe1", "home1"}
    assert state._buildings_visited["r2"] == {"park1"}


def test_save_load_dialogue_counts(state):
    state._total_dialogue_count = 17
    state._total_relationship_change_count = 8
    saved = state.save_state()
    _run(state.load_state(saved))
    assert state._total_dialogue_count == 17
    assert state._total_relationship_change_count == 8


def test_save_load_relationships(state):
    """Relationships round-trip with type and intensity."""
    from engine.types import Relationship, RelationType
    key = (state.world.agents[0].resident.id, state.world.agents[1].resident.id)
    state.world.relationships[key] = Relationship(
        from_id=key[0], to_id=key[1],
        type=RelationType.friendship, intensity=0.75, reason="老朋友",
    )
    saved = state.save_state()
    _run(state.load_state(saved))
    restored = state.world.relationships.get(key)
    assert restored is not None
    assert restored.type == RelationType.friendship
    assert abs(restored.intensity - 0.75) < 1e-6
    assert restored.reason == "老朋友"


def test_save_is_json_serialisable(state):
    """save_state() output must be JSON-serialisable (no sets/tuples)."""
    import json
    state._rel_events_fired = {("a", "b", "confession")}
    state._achievements_store = {"r1": {"badge1"}}
    state._buildings_visited = {"r1": {"cafe1"}}
    saved = state.save_state()
    # Should not raise
    dumped = json.dumps(saved)
    assert isinstance(dumped, str)
