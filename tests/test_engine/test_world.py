"""Tests for World state management."""
from types import SimpleNamespace

import pytest

from engine.types import Building, MovementUpdate, TickState, WorldConfig
from engine.world import World

from tests.conftest import make_agent


def test_world_tick_increments_counter(mock_world):
    assert mock_world.current_tick == 0
    state = mock_world.tick()
    assert mock_world.current_tick == 1
    assert isinstance(state, TickState)
    assert state.tick == 1


def test_world_tick_returns_movements_for_map_agents(mock_world):
    """Agents on the map (location=None) appear in movements."""
    for a in mock_world.agents:
        a.resident.location = None
    state = mock_world.tick()
    assert len(state.movements) == 3
    ids = {m.id for m in state.movements}
    assert "a1" in ids and "a2" in ids and "a3" in ids


def test_world_tick_excludes_building_agents(mock_world):
    """Agents inside buildings are excluded from movements."""
    mock_world.agents[0].resident.location = "cafe1"
    state = mock_world.tick()
    ids = {m.id for m in state.movements}
    assert "a1" not in ids


def test_add_agent(mock_world):
    initial = len(mock_world.agents)
    new_agent = make_agent("new1", "新来的", x=7, y=7)
    mock_world.add_agent(new_agent)
    assert len(mock_world.agents) == initial + 1
    # MemoryStream config should be synced
    assert new_agent.memory_stream._config is mock_world.config


def test_remove_agent(mock_world):
    initial = len(mock_world.agents)
    mock_world.remove_agent("a1")
    assert len(mock_world.agents) == initial - 1
    assert all(a.resident.id != "a1" for a in mock_world.agents)


def test_get_nearby_agents(mock_world):
    # a1 at (5,5), a2 at (6,5) → distance 1 ≤ radius 2
    nearby = mock_world.get_nearby_agents(5, 5)
    ids = {a.resident.id for a in nearby}
    assert "a2" in ids
    assert "a1" in ids       # same-tile agents are included (caller filters self)
    assert "a3" not in ids   # at (15,15), too far


def test_get_nearby_agents_custom_radius(mock_world):
    nearby = mock_world.get_nearby_agents(5, 5, radius=1)
    assert all(
        abs(a.resident.x - 5) + abs(a.resident.y - 5) <= 1
        for a in nearby
    )


def test_zone_preference_scores_reflect_personality(mock_world):
    social_zone = mock_world.zones[0]
    quiet_zone = mock_world.zones[1]

    extrovert_score = mock_world.score_zone_for_resident(mock_world.agents[0].resident, social_zone)
    introvert_score = mock_world.score_zone_for_resident(mock_world.agents[1].resident, quiet_zone)

    assert extrovert_score > mock_world.score_zone_for_resident(mock_world.agents[0].resident, quiet_zone)
    assert introvert_score > mock_world.score_zone_for_resident(mock_world.agents[1].resident, social_zone)


def test_zone_stats_include_residents_buildings_and_atmosphere(mock_world):
    stats = mock_world.get_zone_stats(mock_world.zones[0].id)

    assert stats is not None
    assert stats["building_count"] >= 1
    assert stats["resident_count"] >= 1
    assert stats["atmosphere"]["noise"] >= 0
    assert stats["atmosphere"]["safety"] >= 0
    assert stats["atmosphere"]["beauty"] >= 0


def test_get_nearby_agents_uses_grid_index_without_full_agent_scan(mock_world):
    mock_world.rebuild_grid_index()

    class PoisonResident:
        id = "poison"
        location = None

        @property
        def x(self):
            raise AssertionError("get_nearby_agents should read indexed buckets, not scan every agent")

        @property
        def y(self):
            raise AssertionError("get_nearby_agents should read indexed buckets, not scan every agent")

    mock_world.agents.append(SimpleNamespace(resident=PoisonResident()))

    nearby = mock_world.get_nearby_agents(5, 5)
    ids = {agent.resident.id for agent in nearby}

    assert "a2" in ids
    assert "poison" not in ids


def test_tick_rebuilds_grid_index(mock_world):
    mock_world.grid_index.clear()

    mock_world.tick()

    indexed_ids = {
        agent.resident.id
        for bucket in mock_world.grid_index.values()
        for agent in bucket
    }

    assert {"a1", "a2", "a3"} <= indexed_ids


def test_simulation_time_format(mock_world):
    time_str = mock_world.simulation_time()
    assert "Day" in time_str


def test_simulation_time_advances_with_ticks(mock_world):
    t0 = mock_world.simulation_time()
    mock_world.tick()
    t1 = mock_world.simulation_time()
    assert t0 != t1


def test_enter_leave_building(mock_world):
    agent = mock_world.agents[0]
    building = mock_world.buildings[0]

    agent.resident.location = None
    result = mock_world.enter_building(agent, building)
    assert result is True
    assert agent.resident.location == building.id

    mock_world.leave_building(agent)
    assert agent.resident.location is None
    assert agent.resident.x == building.position[0]
    assert agent.resident.y == building.position[1]


def test_building_capacity_enforced(mock_world):
    home = mock_world.get_building("home1")
    for i in range(home.capacity):
        a = make_agent(f"cap_{i}", f"居民{i}", x=0, y=0)
        mock_world.add_agent(a)
        mock_world.enter_building(a, home)

    # Next agent should be rejected
    extra = make_agent("extra", "多余", x=0, y=0)
    mock_world.add_agent(extra)
    result = mock_world.enter_building(extra, home)
    assert result is False


def test_pending_events_attribute(mock_world):
    assert hasattr(mock_world, "pending_events")
    assert isinstance(mock_world.pending_events, list)


def test_relationship_graph_operations(mock_world):
    from engine.types import RelationType, Relationship
    rel = Relationship(
        from_id="a1", to_id="a2",
        type=RelationType.friendship,
        intensity=0.5, since="t",
    )
    mock_world.set_relationship(rel)
    assert mock_world.get_relationship("a1", "a2") is not None

    mock_world.remove_relationship("a1", "a2")
    assert mock_world.get_relationship("a1", "a2") is None


def test_work_building_improves_skill_and_income(mock_world):
    agent = mock_world.agents[0]
    cafe = mock_world.get_building("cafe1")
    agent.resident.location = cafe.id
    agent.resident.skills["cooking"] = 0.6
    agent.resident.coins = 100
    mock_world.current_tick = 18  # work hours

    mock_world.apply_building_effects(agent)

    assert agent.resident.occupation == "barista"
    assert agent.resident.skills["cooking"] > 0.6
    assert agent.resident.coins > 103
    assert any(item.name == "coffee" for item in agent.resident.inventory)


def test_set_resident_mood_records_history(mock_world):
    agent = mock_world.agents[0]

    changed = mock_world.set_resident_mood(agent, "sad", "event")

    assert changed is True
    assert agent.resident.mood == "sad"
    assert agent.resident.mood_history[-1].cause == "event"
    assert agent.resident.mood_history[-1].mood == "sad"


def test_depression_triggers_after_20_low_mood_ticks(mock_world, monkeypatch):
    for agent in mock_world.agents:
        agent.resident.location = None
        agent.resident.x = 0
        agent.resident.y = 0
        agent.resident.energy = 1.0
        mock_world.set_resident_mood(agent, "sad", "event")

    monkeypatch.setattr("engine.world.random.random", lambda: 0.99)
    monkeypatch.setattr("engine.act.random.random", lambda: 0.99)

    for _ in range(20):
        mock_world.tick()

    assert mock_world.agents[0].resident.mental_state == "depressed"
    assert mock_world.agents[0].resident.low_mood_ticks >= 20


def test_depressed_resident_has_lower_social_probability(mock_world):
    agent_a = mock_world.agents[0]
    agent_b = mock_world.agents[1]

    baseline = mock_world.get_social_probability(agent_a, agent_b)
    agent_a.resident.mental_state = "depressed"
    reduced = mock_world.get_social_probability(agent_a, agent_b)

    assert reduced < baseline
