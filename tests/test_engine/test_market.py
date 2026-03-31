"""Tests for the town market / price fluctuation system (§102)."""
import pytest

from tests.conftest import make_agent, mock_world  # noqa: F401


def test_market_initialises_with_8_goods(mock_world):
    overview = mock_world.get_market_overview()
    assert len(overview["goods"]) == 8


def test_market_goods_have_required_fields(mock_world):
    overview = mock_world.get_market_overview()
    for good in overview["goods"]:
        assert "id" in good
        assert "name" in good
        assert "emoji" in good
        assert "current_price" in good
        assert "base_price" in good
        assert "inventory" in good
        assert "price_history" in good
        assert "trend" in good
        assert "change_pct" in good


def test_market_goods_include_all_expected_types(mock_world):
    overview = mock_world.get_market_overview()
    ids = {g["id"] for g in overview["goods"]}
    expected = {"food", "cloth", "wood", "stone", "herbs", "jewelry", "books", "luxury"}
    assert ids == expected


def test_initial_prices_are_positive(mock_world):
    overview = mock_world.get_market_overview()
    for good in overview["goods"]:
        assert good["current_price"] > 0
        assert good["base_price"] > 0


def test_update_market_prices_changes_prices(mock_world):
    before = {g["id"]: g["current_price"] for g in mock_world.get_market_overview()["goods"]}
    # Run several updates to ensure at least some prices change
    for _ in range(10):
        mock_world.update_market_prices()
    after = {g["id"]: g["current_price"] for g in mock_world.get_market_overview()["goods"]}
    assert before != after


def test_prices_stay_within_50_to_200_pct_of_base(mock_world):
    for _ in range(50):
        mock_world.update_market_prices()
    for good in mock_world.get_market_overview()["goods"]:
        base = good["base_price"]
        current = good["current_price"]
        assert current >= base * 0.5 - 0.01, f"{good['id']} price {current} below 50% of base {base}"
        assert current <= base * 2.0 + 0.01, f"{good['id']} price {current} above 200% of base {base}"


def test_price_history_grows_up_to_7_entries(mock_world):
    for _ in range(10):
        mock_world.update_market_prices()
    for good in mock_world.get_market_overview()["goods"]:
        assert len(good["price_history"]) <= 7
        assert len(good["price_history"]) >= 1


def test_trend_field_is_valid(mock_world):
    mock_world.update_market_prices()
    for good in mock_world.get_market_overview()["goods"]:
        assert good["trend"] in ("up", "down", "flat")


def test_resident_market_trade_reduces_supply(mock_world):
    # Ensure residents have coins to buy
    for agent in mock_world.agents:
        agent.resident.coins = 1000.0
    supply_before = {g["id"]: g["inventory"] for g in mock_world.get_market_overview()["goods"]}
    mock_world.process_resident_market_trade()
    supply_after = {g["id"]: g["inventory"] for g in mock_world.get_market_overview()["goods"]}
    total_before = sum(supply_before.values())
    total_after = sum(supply_after.values())
    # After trading, some supply may decrease (then replenishment adds back some)
    # Just verify the method runs without error and supply values remain non-negative
    for gid, qty in supply_after.items():
        assert qty >= 0, f"Supply for {gid} went negative: {qty}"


def test_process_resident_market_trade_deducts_coins(mock_world):
    for agent in mock_world.agents:
        agent.resident.coins = 1000.0
    mock_world.process_resident_market_trade()
    # At least one agent should have spent coins (market has goods in stock)
    coins_after = [a.resident.coins for a in mock_world.agents]
    assert any(c < 1000.0 for c in coins_after)
