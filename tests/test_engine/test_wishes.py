"""Tests for the resident wishlist system."""
import random

from engine.types import Wish, RelationType, Relationship
from engine.wishes import (
    generate_wishes,
    check_wish_fulfillment,
    process_wishes,
    fulfill_wish_by_god,
    get_resident_wishes,
)


def test_generate_wish_for_poor_resident(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._zones_visited = {}

    resident = mock_world.agents[0].resident
    resident.coins = 10
    resident.wallet = 0.0
    resident.wishlist = []

    rng = random.Random(42)
    wishes = generate_wishes(state, resident, rng)

    assert any(w.type == "want_item" for w in wishes)


def test_generate_wish_for_lonely_resident(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._zones_visited = {}

    resident = mock_world.agents[0].resident
    resident.wishlist = []

    rng = random.Random(42)
    wishes = generate_wishes(state, resident, rng)

    assert any(w.type == "want_friend" for w in wishes)


def test_check_wish_fulfillment_want_item(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    mock_world.current_tick = 10

    resident = mock_world.agents[0].resident
    resident.wishlist = [Wish(type="want_item", description="想要食物", priority=0.6)]
    resident.coins = 100
    resident.wallet = 0.0

    fulfilled = check_wish_fulfillment(state, resident)
    assert len(fulfilled) == 1
    assert resident.wishlist[0].fulfilled is True


def test_check_wish_fulfillment_skips_already_fulfilled(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world

    resident = mock_world.agents[0].resident
    resident.wishlist = [Wish(type="want_item", description="已实现", priority=0.5, fulfilled=True, fulfilled_tick=5)]
    resident.coins = 200

    fulfilled = check_wish_fulfillment(state, resident)
    assert fulfilled == []


def test_fulfill_wish_by_god(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    mock_world.current_tick = 50

    resident = mock_world.agents[0].resident
    resident.wishlist = [
        Wish(type="want_job", description="想找工作", priority=0.7),
    ]

    result = fulfill_wish_by_god(state, resident.id, 0)
    assert result is not None
    assert result["fulfilled"] is True
    assert resident.wishlist[0].fulfilled is True


def test_fulfill_already_fulfilled_wish(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world

    resident = mock_world.agents[0].resident
    resident.wishlist = [
        Wish(type="want_job", description="想找工作", priority=0.7, fulfilled=True, fulfilled_tick=10),
    ]

    result = fulfill_wish_by_god(state, resident.id, 0)
    assert result is not None
    assert result["already_fulfilled"] is True


def test_fulfill_invalid_index(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world

    resident = mock_world.agents[0].resident
    resident.wishlist = []

    result = fulfill_wish_by_god(state, resident.id, 99)
    assert result is None


def test_get_resident_wishes_empty(mock_world):
    resident = mock_world.agents[0].resident
    resident.wishlist = []

    result = get_resident_wishes(resident)
    assert result == []


def test_get_resident_wishes_serialization(mock_world):
    resident = mock_world.agents[0].resident
    resident.wishlist = [
        Wish(type="want_friend", description="想交朋友", priority=0.6, target_id="a2"),
        Wish(type="want_item", description="想要书", priority=0.5, fulfilled=True, fulfilled_tick=20),
    ]

    result = get_resident_wishes(resident)
    assert len(result) == 2
    assert result[0]["type"] == "want_friend"
    assert result[0]["target_id"] == "a2"
    assert result[1]["fulfilled"] is True
    assert result[1]["fulfilled_tick"] == 20


def test_process_wishes_generates_and_checks(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._zones_visited = {}
    mock_world.current_tick = 50

    for agent in mock_world.agents:
        agent.resident.wishlist = []
        agent.resident.coins = 10

    process_wishes(state)

    any_has_wishes = any(len(a.resident.wishlist) > 0 for a in mock_world.agents)
    assert any_has_wishes
