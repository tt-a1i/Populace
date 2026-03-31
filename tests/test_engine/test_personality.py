"""Tests for the resident personality traits system."""
import random

from engine.personality import (
    TRAIT_NAMES,
    generate_personality_traits,
    get_trait,
    drift_traits,
    get_personality_stats,
    _drift_resident_traits,
)
from engine.types import Resident


def _make_resident(rid: str = "r1") -> Resident:
    return Resident(id=rid, name="Test", personality="test", age_days=500, age_stage="adult")


def test_generate_personality_traits_returns_all_four():
    rng = random.Random(42)
    traits = generate_personality_traits(rng)
    for name in TRAIT_NAMES:
        assert name in traits
        assert 0.1 <= traits[name] <= 0.9


def test_generate_personality_traits_no_rng():
    traits = generate_personality_traits()
    assert set(traits.keys()) == set(TRAIT_NAMES)


def test_get_trait_returns_value():
    r = _make_resident()
    r.personality_traits = {"extraversion": 0.8, "optimism": 0.3, "thrift": 0.6, "adventurousness": 0.2}
    assert get_trait(r, "extraversion") == 0.8
    assert get_trait(r, "thrift") == 0.6


def test_get_trait_falls_back_to_0_5():
    r = _make_resident()
    r.personality_traits = {}
    assert get_trait(r, "optimism") == 0.5


def test_get_trait_no_field():
    r = _make_resident()
    # Missing personality_traits entirely (e.g., old save data)
    del r.__dict__["personality_traits"]
    assert get_trait(r, "adventurousness") == 0.5


def test_drift_changes_traits_with_high_probability():
    r = _make_resident()
    r.personality_traits = {"extraversion": 0.5, "optimism": 0.5, "thrift": 0.5, "adventurousness": 0.5}
    original = dict(r.personality_traits)

    # Run many drift cycles to ensure at least one trait changes
    rng = random.Random(1)
    changed = False
    for _ in range(100):
        _drift_resident_traits(r, rng)
        if r.personality_traits != original:
            changed = True
            break

    assert changed, "Traits should drift after many iterations"


def test_drift_clamps_to_0_1():
    r = _make_resident()
    r.personality_traits = {"extraversion": 0.01, "optimism": 0.99, "thrift": 0.5, "adventurousness": 0.5}

    rng = random.Random(0)
    for _ in range(200):
        _drift_resident_traits(r, rng)

    for name in TRAIT_NAMES:
        assert 0.0 <= r.personality_traits[name] <= 1.0, f"{name} out of range"


def test_drift_traits_uses_world_rng(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    mock_world.current_tick = 20

    for agent in mock_world.agents:
        agent.resident.personality_traits = {
            "extraversion": 0.5, "optimism": 0.5, "thrift": 0.5, "adventurousness": 0.5
        }

    drift_traits(state)  # should not raise


def test_get_personality_stats_returns_averages(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world

    mock_world.agents[0].resident.personality_traits = {
        "extraversion": 0.8, "optimism": 0.6, "thrift": 0.4, "adventurousness": 0.2
    }
    mock_world.agents[1].resident.personality_traits = {
        "extraversion": 0.2, "optimism": 0.4, "thrift": 0.6, "adventurousness": 0.8
    }
    mock_world.agents[2].resident.personality_traits = {
        "extraversion": 0.5, "optimism": 0.5, "thrift": 0.5, "adventurousness": 0.5
    }

    stats = get_personality_stats(state)
    assert abs(stats["extraversion"] - 0.5) < 0.01
    assert abs(stats["optimism"] - 0.5) < 0.01
    assert "adventurousness" in stats


def test_get_personality_stats_empty_world():
    from engine.world import World

    class FakeState:
        world = World()

    stats = get_personality_stats(FakeState())
    for name in TRAIT_NAMES:
        assert stats[name] == 0.5
