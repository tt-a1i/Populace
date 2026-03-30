from backend.api.simulation import SimulationState
from engine.types import ExternalTown, TradeRoute


def test_generate_external_towns_have_distinct_resource_advantages():
    from engine.diplomacy import generate_external_towns

    towns = generate_external_towns(seed=7)

    assert 2 <= len(towns) <= 3
    assert len({town.name for town in towns}) == len(towns)
    assert all(town.specialties for town in towns)
    assert len({tuple(town.specialties) for town in towns}) == len(towns)


def test_trade_profit_changes_with_relation_and_skill():
    from engine.diplomacy import calculate_trade_profit

    route = TradeRoute(
        from_town="Populace",
        to_town="海雾港",
        goods=["coffee", "spices"],
        profit_per_tick=10,
    )
    friendly = ExternalTown(name="海雾港", relation_score=0.65, trade_balance=0.0)
    tense = ExternalTown(name="石岭镇", relation_score=-0.45, trade_balance=0.0)

    friendly_profit = calculate_trade_profit(route, friendly, trading_skill=0.8, safety_index=0.9)
    tense_profit = calculate_trade_profit(route, tense, trading_skill=0.2, safety_index=0.4)

    assert friendly_profit > tense_profit
    assert friendly_profit > route.profit_per_tick


def test_simulation_diplomacy_tick_opens_route_and_records_profit(mock_world):
    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._world_timeline = []
    state._timeline_id_counter = 0
    state._diplomacy_ledger = []
    state._diplomacy_last_route_tick = {}
    state._diplomacy_event_log = []

    merchant = mock_world.agents[0].resident
    merchant.occupation = "merchant"
    merchant.job.title = "merchant"
    merchant.skills["trading"] = 0.82

    diplomat = mock_world.agents[1].resident
    diplomat.skills["social"] = 0.76
    diplomat.reputation = 0.4

    mock_world.external_towns = [
        ExternalTown(name="海雾港", relation_score=0.25, trade_balance=0.0, specialties=["海盐", "珍珠"]),
        ExternalTown(name="松风镇", relation_score=0.1, trade_balance=0.0, specialties=["木材", "草药"]),
    ]
    mock_world.trade_routes = []
    mock_world.current_tick = 12

    state._update_diplomacy()

    assert mock_world.trade_routes
    assert state._diplomacy_ledger
    assert mock_world.economic_output > 0
    assert any(town.ambassador_id for town in mock_world.external_towns)
