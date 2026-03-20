"""Tests for engine/schedule.py — DailySchedule and rule-path integration."""
from __future__ import annotations

import pytest

from engine.schedule import DailySchedule, SchedulePhase
from engine.types import Building, WorldConfig
from engine.world import World

from tests.conftest import make_agent


# ---------------------------------------------------------------------------
# Phase boundary tests
# ---------------------------------------------------------------------------

def test_sleep_phase_at_midnight():
    sched = DailySchedule("内向")
    phase = sched.current_phase(0.0)
    assert phase.name == "sleep"
    assert "home" in phase.target_types


def test_morning_phase_at_7():
    sched = DailySchedule("外向")
    phase = sched.current_phase(7.0)
    assert phase.name == "morning"


def test_work_phase_at_10():
    sched = DailySchedule("外向")
    phase = sched.current_phase(10.0)
    assert phase.name == "work"
    assert "shop" in phase.target_types or "school" in phase.target_types


def test_lunch_phase_at_12_30():
    sched = DailySchedule("外向")
    phase = sched.current_phase(12.5)
    assert phase.name == "lunch"
    assert "cafe" in phase.target_types


def test_afternoon_phase_at_15():
    sched = DailySchedule("外向")
    phase = sched.current_phase(15.0)
    assert phase.name == "afternoon"


def test_evening_phase_at_18_for_extrovert():
    sched = DailySchedule("外向、开朗")
    phase = sched.current_phase(18.0)
    assert phase.name == "evening"   # extrovert stays out until 21:00


def test_home_phase_earlier_for_introvert():
    sched = DailySchedule("内向、安静")
    phase = sched.current_phase(18.5)
    assert phase.name == "home"     # introvert goes home from 18:00


def test_neutral_still_evening_at_19():
    """Neutral personality should still be in evening phase at 19:00."""
    sched = DailySchedule("普通居民")   # no extrovert/introvert keyword
    phase = sched.current_phase(19.0)
    assert phase.name == "evening", (
        f"Neutral agent at 19:00 should be 'evening', got '{phase.name}'"
    )


def test_neutral_home_phase_at_20():
    """Neutral personality should enter home phase at 20:00."""
    sched = DailySchedule("普通居民")
    phase = sched.current_phase(20.0)
    assert phase.name == "home", (
        f"Neutral agent at 20:00 should be 'home', got '{phase.name}'"
    )


def test_sleep_phase_at_23():
    sched = DailySchedule("外向")
    phase = sched.current_phase(23.0)
    assert phase.name == "sleep"


# ---------------------------------------------------------------------------
# rule_plan integration
# ---------------------------------------------------------------------------

@pytest.fixture()
def world_with_buildings():
    cfg = WorldConfig(
        map_width_tiles=20, map_height_tiles=20,
        tick_per_day=48, interaction_distance=2,
        llm_call_probability=0.0,
    )
    world = World(config=cfg)
    world.add_building(Building(id="home1", type="home", name="小屋", capacity=4, position=(5, 5)))
    world.add_building(Building(id="cafe1", type="cafe", name="咖啡馆", capacity=4, position=(10, 10)))
    world.add_building(Building(id="shop1", type="shop", name="商店", capacity=4, position=(15, 5)))
    return world


def test_rule_plan_sleep_returns_home(world_with_buildings):
    """During sleep phase agent should target home building."""
    sched = DailySchedule("外向")
    agent = make_agent("a1", "小明", x=10, y=10)
    agent.resident.home_building_id = "home1"
    world_with_buildings.add_agent(agent)

    # Force tick to be during sleep (hour=1, tick=2 at 48 ticks/day)
    world_with_buildings.current_tick = 2   # hour ~1:00

    plan = sched.rule_plan(agent, world_with_buildings)
    assert plan["action"] == "move"
    assert plan.get("target") == [5, 5]   # home1 position


def test_rule_plan_work_targets_shop(world_with_buildings):
    """During work phase agent should target shop/school/cafe."""
    sched = DailySchedule("外向")
    agent = make_agent("a1", "小明", x=0, y=0)
    agent.resident.home_building_id = "home1"
    world_with_buildings.add_agent(agent)

    # Tick for hour=9: tick_per_day=48, ticks_per_hour=2, hour 9 = tick 18
    world_with_buildings.current_tick = 18   # 09:00

    plan = sched.rule_plan(agent, world_with_buildings)
    assert plan["action"] == "move"
    # Should head toward shop or cafe (not home)
    assert plan.get("target") != [5, 5]


def test_rule_plan_idle_when_already_at_destination(world_with_buildings):
    """Agent already inside the schedule-target building returns idle."""
    sched = DailySchedule("内向")
    agent = make_agent("a1", "阿默", x=5, y=5)
    agent.resident.home_building_id = "home1"
    agent.resident.location = "home1"        # already home
    world_with_buildings.add_agent(agent)

    world_with_buildings.current_tick = 2    # sleep phase

    plan = sched.rule_plan(agent, world_with_buildings)
    assert plan["action"] == "idle"


def test_generative_agent_plan_uses_schedule_on_rule_path(world_with_buildings):
    """GenerativeAgent.plan() with use_llm=False returns schedule-driven action."""
    import asyncio
    from engine.generative_agent import GenerativeAgent

    agent = GenerativeAgent(make_agent("a1").resident)
    agent.resident.home_building_id = "home1"
    world_with_buildings.add_agent(agent)
    world_with_buildings.current_tick = 18   # 09:00 work phase

    context = {
        "events": [], "memories": [], "reflections": [],
        "use_llm": False,
        "world": world_with_buildings,
    }
    result = asyncio.run(agent.plan(context))
    assert result["action"] in ("move", "idle")
    # Should NOT be a completely random move — target should exist
    if result["action"] == "move" and "target" in result:
        assert isinstance(result["target"], list)
        assert len(result["target"]) == 2
