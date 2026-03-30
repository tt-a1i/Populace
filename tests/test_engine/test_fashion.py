import random

from engine.types import Building

from tests.conftest import make_agent


def test_add_agent_initializes_fashion_defaults(mock_world):
    newcomer = make_agent("fashion-new", "时髦新人", x=4, y=4)

    mock_world.add_agent(newcomer)

    resident = newcomer.resident
    categories = {item.category for item in resident.wardrobe}

    assert resident.appearance.clothing in {"casual", "work", "formal", "festive"}
    assert resident.appearance.style_score > 0
    assert {"casual", "work", "formal", "festive"} <= categories


def test_social_probability_increases_for_stylish_first_impression(mock_world):
    agent_a = mock_world.agents[0]
    agent_b = mock_world.agents[1]

    agent_a.resident.personality = "普通"
    agent_b.resident.personality = "普通"
    agent_a.resident.reputation = 0.0
    agent_b.resident.reputation = 0.0

    baseline = mock_world.get_social_probability(agent_a, agent_b)

    agent_b.resident.personality = "时尚、精致"
    agent_b.resident.appearance.style_score = 0.95
    agent_b.resident.appearance.clothing = "formal"
    agent_b.resident.occupation = "tailor"

    boosted = mock_world.get_social_probability(agent_a, agent_b)

    assert boosted >= baseline + 0.10


def test_shop_assigns_tailor_to_artisan_resident(mock_world):
    shop = Building(id="fashion-shop", type="shop", name="裁缝铺", capacity=6, position=(7, 7))
    resident = mock_world.agents[0].resident
    resident.skills["art"] = 0.82
    resident.skills["crafting"] = 0.88

    mock_world._assign_job_for_building(resident, shop)

    assert resident.job.title == "tailor"


def test_shop_purchase_can_add_clothing_and_record_spending(mock_world):
    shop = Building(id="market-fashion", type="shop", name="市集服装店", capacity=6, position=(8, 8))
    resident = mock_world.agents[0].resident
    resident.wallet = 80.0
    resident.location = shop.id
    resident.outfit_color = None

    mock_world.add_building(shop)
    mock_world.rng = random.Random(2)
    mock_world.rng.random = lambda: 0.0  # type: ignore[method-assign]

    before_items = len(resident.wardrobe)
    mock_world._purchase_for_resident(resident)

    assert len(resident.wardrobe) == before_items + 1
    assert mock_world.fashion_purchase_history
    assert mock_world.economic_output > 0


def test_tick_emits_trend_event_and_movement_appearance(mock_world):
    mock_world.current_tick = 199
    for agent in mock_world.agents:
        agent.resident.location = None

    tick_state = mock_world.tick()

    assert any("新潮流" in event.description for event in tick_state.events)
    movement = next(item for item in tick_state.movements if item.id == mock_world.agents[0].resident.id)
    assert movement.outfit_color
    assert movement.appearance is not None
    assert movement.appearance.style_score > 0


def test_world_fashion_overview_returns_trend_rankings_and_consumption(mock_world):
    overview = mock_world.get_fashion_overview()

    assert overview["current_trend"]["color"]
    assert isinstance(overview["trend_history"], list)
    assert isinstance(overview["rankings"], list)
    assert "consumption" in overview
