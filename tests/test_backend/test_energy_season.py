"""Tests for the energy system and season system."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Energy system — engine level
# ---------------------------------------------------------------------------

def test_resident_has_energy_field():
    """Resident.energy defaults to 1.0."""
    from engine.types import Resident
    r = Resident(id="e1", name="Alice", personality="active")
    assert r.energy == 1.0


def test_movement_drains_energy():
    """Moving one step decreases resident energy by 0.01."""
    from engine.types import Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent
    from engine.act import _step_random

    world = World(WorldConfig())
    resident = Resident(id="m1", name="Bob", personality="active", energy=1.0)
    agent = GenerativeAgent(resident)
    world.add_agent(agent)

    import random
    random.seed(42)
    initial_energy = resident.energy
    _step_random(agent, world)
    assert resident.energy < initial_energy or resident.energy == 0.0


def test_energy_clamped_to_zero_on_drain():
    """Energy cannot go below 0.0."""
    from engine.types import Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent
    from engine.act import _step_random

    world = World(WorldConfig())
    resident = Resident(id="m2", name="Dave", personality="active", energy=0.005)
    agent = GenerativeAgent(resident)
    world.add_agent(agent)

    import random
    random.seed(0)
    _step_random(agent, world)
    assert resident.energy >= 0.0


def test_home_recovery_increases_energy():
    """Being at home increases energy by 0.05 per tick."""
    from engine.types import Building, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    world = World(WorldConfig())
    home = Building(id="h1", type="home", name="Home", capacity=2, position=(1, 1))
    world.add_building(home)

    resident = Resident(id="r_home", name="Carol", personality="calm", energy=0.5,
                        home_building_id="h1")
    agent = GenerativeAgent(resident)
    world.add_agent(agent)
    world.enter_building(agent, home)

    world.apply_building_effects(agent)
    assert resident.energy == pytest.approx(0.55, abs=1e-6)


def test_energy_clamped_to_one_on_recovery():
    """Energy cannot exceed 1.0 during home recovery."""
    from engine.types import Building, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    world = World(WorldConfig())
    home = Building(id="h2", type="home", name="Home", capacity=2, position=(2, 2))
    world.add_building(home)

    resident = Resident(id="r_cap", name="Eve", personality="calm", energy=0.98)
    agent = GenerativeAgent(resident)
    world.add_agent(agent)
    world.enter_building(agent, home)

    world.apply_building_effects(agent)
    assert resident.energy <= 1.0


def test_work_drains_energy_during_work_hours():
    """Working during work hours drains energy by 0.03 per tick."""
    from engine.types import Building, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    cfg = WorldConfig(tick_per_day=48)
    world = World(cfg)
    world.current_tick = 16  # hour 8 = work phase

    cafe = Building(id="c1", type="cafe", name="Cafe", capacity=10, position=(5, 5))
    world.add_building(cafe)

    resident = Resident(id="r_work", name="Frank", personality="hardworking", energy=1.0)
    agent = GenerativeAgent(resident)
    world.add_agent(agent)
    world.enter_building(agent, cafe)

    world.apply_building_effects(agent)
    assert resident.energy == pytest.approx(0.97, abs=1e-6)


def test_energy_override_forces_home():
    """rule_plan forces home when energy < 0.2."""
    from engine.types import Building, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent
    from engine.schedule import DailySchedule

    world = World(WorldConfig(tick_per_day=48))
    world.current_tick = 16  # work hours

    home = Building(id="home_e", type="home", name="Home", capacity=2, position=(0, 0))
    cafe = Building(id="cafe_e", type="cafe", name="Cafe", capacity=5, position=(3, 3))
    world.add_building(home)
    world.add_building(cafe)

    resident = Resident(id="r_tired", name="Grace", personality="calm",
                        energy=0.1, home_building_id="home_e")
    agent = GenerativeAgent(resident)
    world.add_agent(agent)

    schedule = DailySchedule(resident.personality)
    plan = schedule.rule_plan(agent, world)
    # Should go home, not to work
    assert plan["action"] == "move"
    assert plan["target"] == [0, 0]


def test_tick_state_contains_energy_updates():
    """TickState returned by world.tick() contains energy_updates for all agents."""
    from engine.types import Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    world = World(WorldConfig())
    r = Resident(id="tu1", name="Helen", personality="calm")
    agent = GenerativeAgent(r)
    world.add_agent(agent)

    tick_state = world.tick()
    assert len(tick_state.energy_updates) == 1
    assert tick_state.energy_updates[0].id == "tu1"
    assert 0.0 <= tick_state.energy_updates[0].energy <= 1.0


# ---------------------------------------------------------------------------
# Season system — engine level
# ---------------------------------------------------------------------------

def test_world_has_season_attribute():
    """World.season defaults to 'spring'."""
    from engine.types import WorldConfig
    from engine.world import World

    world = World(WorldConfig())
    assert world.season == "spring"


def test_season_changes_at_240_ticks():
    """Season changes from spring to summer after 240 ticks."""
    from engine.types import WorldConfig
    from engine.world import World

    world = World(WorldConfig())
    # Advance to tick 240 by calling tick() directly on current_tick
    world.current_tick = 239
    tick_state = world.tick()  # tick becomes 240
    assert world.season == "summer"
    assert tick_state.season == "summer"


def test_season_cycles_correctly():
    """Season cycles: spring→summer→autumn→winter→spring."""
    from engine.types import WorldConfig
    from engine.world import World

    world = World(WorldConfig())
    seasons_expected = {0: "spring", 240: "summer", 480: "autumn", 720: "winter", 960: "spring"}

    for tick, expected_season in seasons_expected.items():
        world.current_tick = tick
        world.tick()
        assert world.season == expected_season, f"At tick {tick+1}, expected {expected_season}, got {world.season}"


def test_tick_state_contains_season():
    """TickState.season matches world.season."""
    from engine.types import WorldConfig
    from engine.world import World

    world = World(WorldConfig())
    world.current_tick = 239
    ts = world.tick()
    assert ts.season == "summer"


def test_season_affects_weather_probability():
    """Weather changes follow season: winter should eventually produce snow."""
    import random
    random.seed(42)
    from engine.types import WeatherType, WorldConfig
    from engine.world import World

    world = World(WorldConfig())
    world.season = "winter"

    weathers_seen: set[str] = set()
    for _ in range(500):
        world.current_tick = 720 + _  # Keep in winter range
        world.tick()
        weathers_seen.add(world.weather.value)

    assert "snowy" in weathers_seen, "Winter should produce snow"


def test_residents_endpoint_includes_energy(client: TestClient) -> None:
    """GET /api/residents returns residents with an energy field."""
    residents = client.get("/api/residents").json()
    if len(residents) > 0:
        for r in residents:
            assert "energy" in r
            assert isinstance(r["energy"], float)
            assert 0.0 <= r["energy"] <= 1.0
