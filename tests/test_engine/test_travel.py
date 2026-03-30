"""Tests for travel & exploration system."""
from __future__ import annotations

import random

import pytest

from engine.types import Building, Resident, TravelEntry, WorldConfig
from engine.world import World
from engine.generative_agent import GenerativeAgent
from engine.travel import (
    DESTINATIONS,
    _is_adventurous,
    _complete_travel,
    get_resident_travels,
    process_travel_tick,
)


def _make_world() -> tuple[World, "GenerativeAgent"]:
    cfg = WorldConfig(tick_per_day=48, llm_call_probability=0.0)
    world = World(cfg)
    world.current_tick = 100
    home = Building(id="home1", type="home", name="Home", capacity=4, position=(1, 1))
    world.add_building(home)
    r = Resident(id="t1", name="旅行者", personality="冒险好奇", age_days=300, home_building_id="home1")
    agent = GenerativeAgent(r)
    world.add_agent(agent)
    return world, agent


def test_travel_entry_defaults():
    entry = TravelEntry()
    assert entry.destination == ""
    assert entry.destination_type == "neighboring_town"
    assert entry.tick_departed == 0
    assert entry.tick_returned == 0
    assert entry.souvenirs == []
    assert entry.story == ""


def test_is_adventurous():
    assert _is_adventurous("冒险热情") is True
    assert _is_adventurous("curious and brave") is True
    assert _is_adventurous("安静内向") is False


def test_process_travel_departs():
    world, agent = _make_world()
    rng = random.Random(42)
    rng.random = lambda: 0.0  # type: ignore[method-assign]

    events = process_travel_tick(world, rng)

    assert agent.resident.traveling is True
    assert len(agent.resident.travel_log) == 1
    assert any("出发" in e.description for e in events)


def test_process_travel_returns():
    world, agent = _make_world()
    rng = random.Random(42)

    # Manually start a trip
    entry = TravelEntry(
        destination="云雾山脉",
        destination_type="mountain",
        tick_departed=80,
    )
    agent.resident.travel_log.append(entry)
    agent.resident.traveling = True
    world.current_tick = 100  # 20 ticks elapsed > 12 duration

    events = process_travel_tick(world, rng)

    assert agent.resident.traveling is False
    assert entry.tick_returned == 100
    assert len(entry.souvenirs) > 0
    assert entry.story != ""
    assert any("归来" in e.description for e in events)


def test_travel_boosts_skills():
    world, agent = _make_world()
    rng = random.Random(42)

    entry = TravelEntry(
        destination="云雾山脉",
        destination_type="mountain",
        tick_departed=80,
    )
    agent.resident.travel_log.append(entry)
    agent.resident.traveling = True
    world.current_tick = 100

    process_travel_tick(world, rng)

    assert agent.resident.skills.get("courage", 0) > 0


def test_travel_writes_diary():
    world, agent = _make_world()
    rng = random.Random(42)

    entry = TravelEntry(
        destination="碧波海岸",
        destination_type="seaside",
        tick_departed=85,
    )
    agent.resident.travel_log.append(entry)
    agent.resident.traveling = True
    world.current_tick = 100

    initial_diary = len(agent.resident.diary)
    process_travel_tick(world, rng)

    assert len(agent.resident.diary) > initial_diary
    assert any("旅行归来" in d.content for d in agent.resident.diary)


def test_child_cannot_travel():
    world, agent = _make_world()
    agent.resident.age_days = 50
    agent.resident.age_stage = "child"
    rng = random.Random(42)
    rng.random = lambda: 0.0  # type: ignore[method-assign]

    events = process_travel_tick(world, rng)

    assert agent.resident.traveling is False
    assert len(events) == 0


def test_get_resident_travels():
    world, agent = _make_world()
    agent.resident.travel_log.append(TravelEntry(
        destination="邻镇集市",
        destination_type="neighboring_town",
        tick_departed=50,
        tick_returned=58,
        souvenirs=["异国香料"],
        story="学到了不少新东西。",
    ))

    result = get_resident_travels(world, "t1")
    assert len(result) == 1
    assert result[0]["destination"] == "邻镇集市"
    assert result[0]["souvenirs"] == ["异国香料"]


def test_get_resident_travels_not_found():
    world, _ = _make_world()
    result = get_resident_travels(world, "nonexistent")
    assert result == []
