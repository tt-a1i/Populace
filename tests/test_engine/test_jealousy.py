"""Tests for the resident jealousy and rivalry system."""
from engine.types import JealousyEntry, RelationType, Relationship
from engine.jealousy import (
    _find_jealousy_triggers,
    _decay_jealousy,
    resolve_jealousy_from_interaction,
    process_jealousy,
    get_rivalries_overview,
)


def test_wealth_jealousy_triggered(mock_world):
    rich = mock_world.agents[0].resident
    poor = mock_world.agents[1].resident
    rich.coins = 500
    rich.wallet = 500.0
    poor.coins = 20
    poor.wallet = 0.0

    triggers = _find_jealousy_triggers(mock_world, poor)
    assert any(t.target_id == rich.id and t.reason == "wealth" for t in triggers)


def test_reputation_jealousy_triggered(mock_world):
    famous = mock_world.agents[0].resident
    unknown = mock_world.agents[1].resident
    famous.reputation = 0.8
    unknown.reputation = 0.1

    triggers = _find_jealousy_triggers(mock_world, unknown)
    assert any(t.target_id == famous.id and t.reason == "reputation" for t in triggers)


def test_no_self_jealousy(mock_world):
    resident = mock_world.agents[0].resident
    resident.coins = 10
    resident.wallet = 0.0

    triggers = _find_jealousy_triggers(mock_world, resident)
    assert all(t.target_id != resident.id for t in triggers)


def test_intensity_clamped(mock_world):
    rich = mock_world.agents[0].resident
    poor = mock_world.agents[1].resident
    rich.coins = 999999
    poor.coins = 1
    poor.wallet = 0.0

    triggers = _find_jealousy_triggers(mock_world, poor)
    for t in triggers:
        assert 0.0 <= t.intensity <= 1.0


def test_decay_reduces_intensity():
    from engine.types import Resident
    resident = Resident(id="r1", name="Test", personality="test")
    resident.jealousy_targets = [
        JealousyEntry(target_id="t1", reason="wealth", intensity=0.5),
        JealousyEntry(target_id="t2", reason="reputation", intensity=0.02),
    ]

    _decay_jealousy(resident)

    assert resident.jealousy_targets[0].intensity < 0.5
    assert len(resident.jealousy_targets) == 1  # t2 removed (below 0.01 after decay)


def test_resolve_jealousy_from_interaction():
    from engine.types import Resident
    resident = Resident(id="r1", name="Test", personality="test")
    resident.jealousy_targets = [
        JealousyEntry(target_id="t1", reason="wealth", intensity=0.4),
    ]

    result = resolve_jealousy_from_interaction(resident, "t1", 0.15)
    assert result is True
    assert resident.jealousy_targets[0].intensity == 0.25


def test_resolve_nonexistent_target():
    from engine.types import Resident
    resident = Resident(id="r1", name="Test", personality="test")
    resident.jealousy_targets = []

    result = resolve_jealousy_from_interaction(resident, "t99", 0.15)
    assert result is False


def test_process_jealousy_creates_entries(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._bulletin_posts = []
    state._bulletin_last_post_tick = {}
    mock_world.current_tick = 30

    # Set up wealth disparity
    mock_world.agents[0].resident.coins = 1000
    mock_world.agents[0].resident.wallet = 0.0
    mock_world.agents[1].resident.coins = 10
    mock_world.agents[1].resident.wallet = 0.0
    for a in mock_world.agents:
        a.resident.jealousy_targets = []

    process_jealousy(state)

    all_targets = [j for a in mock_world.agents for j in a.resident.jealousy_targets]
    assert len(all_targets) > 0


def test_get_rivalries_overview_empty(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world

    for a in mock_world.agents:
        a.resident.jealousy_targets = []

    overview = get_rivalries_overview(state)
    assert overview["total_rivalries"] == 0
    assert overview["rivalries"] == []


def test_get_rivalries_overview_with_data(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world

    mock_world.agents[0].resident.jealousy_targets = [
        JealousyEntry(target_id="a2", reason="wealth", intensity=0.6),
    ]
    mock_world.agents[1].resident.jealousy_targets = []
    mock_world.agents[2].resident.jealousy_targets = []

    overview = get_rivalries_overview(state)
    assert overview["total_rivalries"] == 1
    assert overview["rivalries"][0]["from_id"] == "a1"
    assert overview["rivalries"][0]["target_id"] == "a2"
    assert len(overview["hotspots"]) == 1
    assert overview["hotspots"][0]["resident_id"] == "a2"
