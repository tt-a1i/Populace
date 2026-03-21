"""Tests for occupation system and gossip propagation."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# /api/simulation/economy-stats
# ---------------------------------------------------------------------------

def test_economy_stats_returns_correct_shape(client: TestClient) -> None:
    """GET /api/simulation/economy-stats returns expected fields."""
    resp = client.get("/api/simulation/economy-stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_coins" in data
    assert "avg_coins" in data
    assert "occupation_distribution" in data
    assert isinstance(data["occupation_distribution"], list)


def test_economy_stats_total_coins_non_negative(client: TestClient) -> None:
    """total_coins should be non-negative."""
    data = client.get("/api/simulation/economy-stats").json()
    assert data["total_coins"] >= 0


def test_economy_stats_occupation_dist_entries(client: TestClient) -> None:
    """Each entry in occupation_distribution has occupation and count fields."""
    data = client.get("/api/simulation/economy-stats").json()
    for entry in data["occupation_distribution"]:
        assert "occupation" in entry
        assert "count" in entry
        assert entry["count"] > 0


# ---------------------------------------------------------------------------
# Resident response includes occupation field
# ---------------------------------------------------------------------------

def test_resident_response_has_occupation(client: TestClient) -> None:
    """GET /api/residents returns residents with an occupation field."""
    residents = client.get("/api/residents").json()
    assert len(residents) > 0
    for r in residents:
        assert "occupation" in r
        assert isinstance(r["occupation"], str)


# ---------------------------------------------------------------------------
# Occupation assignment from world mechanics
# ---------------------------------------------------------------------------

def test_occupation_set_in_cafe():
    """Resident in a cafe during work hours gets occupation 'barista'."""
    from engine.types import Building, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    cfg = WorldConfig(tick_per_day=48)
    world = World(cfg)
    # Set tick to work phase: tick 16 = hour 8 (work phase start)
    world.current_tick = 16  # 16 * 24 / 48 = 8.0

    cafe = Building(id="cafe1", type="cafe", name="Cafe", capacity=10, position=(5, 5))
    world.add_building(cafe)

    resident = Resident(id="r1", name="Alice", personality="friendly")
    agent = GenerativeAgent(resident)
    world.add_agent(agent)
    world.enter_building(agent, cafe)

    world.apply_building_effects(agent)
    assert resident.occupation == "barista"


def test_occupation_set_in_school():
    """Resident in a school during work hours gets occupation 'teacher'."""
    from engine.types import Building, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    cfg = WorldConfig(tick_per_day=48)
    world = World(cfg)
    world.current_tick = 16  # hour 8 = work phase

    school = Building(id="sch1", type="school", name="School", capacity=10, position=(3, 3))
    world.add_building(school)

    resident = Resident(id="r2", name="Bob", personality="calm")
    agent = GenerativeAgent(resident)
    world.add_agent(agent)
    world.enter_building(agent, school)

    world.apply_building_effects(agent)
    assert resident.occupation == "teacher"


def test_occupation_reset_at_home():
    """Resident returning home has occupation reset to 'unemployed'."""
    from engine.types import Building, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    cfg = WorldConfig(tick_per_day=48)
    world = World(cfg)
    world.current_tick = 0  # sleep phase

    home = Building(id="home1", type="home", name="Home", capacity=2, position=(1, 1))
    world.add_building(home)

    resident = Resident(id="r3", name="Carol", personality="neutral", occupation="barista")
    agent = GenerativeAgent(resident)
    world.add_agent(agent)
    world.enter_building(agent, home)

    world.apply_building_effects(agent)
    assert resident.occupation == "unemployed"


def test_occupation_income_during_work_phase():
    """Resident in shop during work hours earns shopkeeper income (+5/tick)."""
    from engine.types import Building, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    cfg = WorldConfig(tick_per_day=48)
    world = World(cfg)
    world.current_tick = 16  # hour 8

    shop = Building(id="shop1", type="shop", name="Shop", capacity=10, position=(7, 7))
    world.add_building(shop)

    resident = Resident(id="r4", name="Dave", personality="hardworking", coins=100)
    agent = GenerativeAgent(resident)
    world.add_agent(agent)
    world.enter_building(agent, shop)

    world.apply_building_effects(agent)
    assert resident.occupation == "shopkeeper"
    # 100 - 10 (shop entry cost) + 5 (shopkeeper income) = 95
    assert resident.coins == 95


def test_no_income_outside_work_hours():
    """Resident in cafe during sleep hours gets occupation but no income."""
    from engine.types import Building, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    cfg = WorldConfig(tick_per_day=48)
    world = World(cfg)
    world.current_tick = 2  # hour 1 (sleep phase)

    cafe = Building(id="cafe2", type="cafe", name="Night Cafe", capacity=5, position=(9, 9))
    world.add_building(cafe)

    resident = Resident(id="r5", name="Eve", personality="night owl", coins=100)
    agent = GenerativeAgent(resident)
    world.add_agent(agent)
    world.enter_building(agent, cafe)

    world.apply_building_effects(agent)
    assert resident.occupation == "barista"
    # 100 - 5 (cafe entry cost) = 95; no work income outside work hours
    assert resident.coins == 95


# ---------------------------------------------------------------------------
# Gossip system
# ---------------------------------------------------------------------------

def test_generate_gossip_returns_none_without_relationships():
    """generate_gossip returns None when speaker has no relationships."""
    from engine.gossip import generate_gossip
    from engine.types import Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    world = World(WorldConfig())
    resident = Resident(id="g1", name="Ghost", personality="lonely")
    agent = GenerativeAgent(resident)
    world.add_agent(agent)

    # No relationships → should always return None
    for _ in range(20):
        result = generate_gossip(agent, world)
        assert result is None


def test_spread_gossip_nudges_relationship():
    """spread_gossip increases listener's relationship intensity for good gossip."""
    import random
    random.seed(0)
    from engine.gossip import spread_gossip
    from engine.types import Relationship, RelationType, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    world = World(WorldConfig())

    r_speaker = Resident(id="gs1", name="Speaker", personality="chatty")
    r_listener = Resident(id="gs2", name="Listener", personality="curious")
    r_target = Resident(id="gs3", name="Target", personality="popular")
    a_speaker = GenerativeAgent(r_speaker)
    a_listener = GenerativeAgent(r_listener)
    a_target = GenerativeAgent(r_target)
    world.add_agent(a_speaker)
    world.add_agent(a_listener)
    world.add_agent(a_target)

    gossip = {
        "target_id": "gs3",
        "target_name": "Target",
        "content": "Target is great!",
        "is_positive": True,
    }
    spread_gossip(a_listener, gossip, world)

    rel = world.get_relationship("gs2", "gs3")
    assert rel is not None
    assert rel.intensity > 0


def test_spread_gossip_bad_nudges_down():
    """spread_gossip decreases relationship intensity for bad gossip."""
    from engine.gossip import spread_gossip
    from engine.types import Relationship, RelationType, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    world = World(WorldConfig())

    r_listener = Resident(id="bg1", name="Listener", personality="skeptic")
    r_target = Resident(id="bg2", name="Target", personality="controversial")
    a_listener = GenerativeAgent(r_listener)
    a_target = GenerativeAgent(r_target)
    world.add_agent(a_listener)
    world.add_agent(a_target)

    # Pre-seed a positive relationship
    world.set_relationship(Relationship(
        from_id="bg1", to_id="bg2", type=RelationType.friendship, intensity=0.5, since="Day 1"
    ))

    gossip = {
        "target_id": "bg2",
        "target_name": "Target",
        "content": "Target did something bad.",
        "is_positive": False,
    }
    spread_gossip(a_listener, gossip, world)

    rel = world.get_relationship("bg1", "bg2")
    assert rel is not None
    assert rel.intensity < 0.5  # decreased


def test_spread_gossip_stores_memory():
    """spread_gossip adds a [八卦] memory to the listener."""
    from engine.gossip import spread_gossip
    from engine.types import Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    world = World(WorldConfig())

    r_listener = Resident(id="mg1", name="Listener", personality="curious")
    r_target = Resident(id="mg2", name="Target", personality="famous")
    a_listener = GenerativeAgent(r_listener)
    a_target = GenerativeAgent(r_target)
    world.add_agent(a_listener)
    world.add_agent(a_target)

    gossip = {
        "target_id": "mg2",
        "target_name": "Target",
        "content": "Target is very kind.",
        "is_positive": True,
    }
    spread_gossip(a_listener, gossip, world)

    memories = a_listener.memory_stream.all
    assert any("[八卦]" in m.content for m in memories)


def test_gossip_does_not_affect_self():
    """spread_gossip does nothing when listener is the gossip target."""
    from engine.gossip import spread_gossip
    from engine.types import Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    world = World(WorldConfig())

    r = Resident(id="self1", name="Self", personality="vain")
    agent = GenerativeAgent(r)
    world.add_agent(agent)

    gossip = {
        "target_id": "self1",
        "target_name": "Self",
        "content": "Self is great.",
        "is_positive": True,
    }
    initial_memories = len(agent.memory_stream.all)
    spread_gossip(agent, gossip, world)
    assert len(agent.memory_stream.all) == initial_memories
