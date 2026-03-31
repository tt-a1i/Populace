"""Tests for GET /api/world/market endpoint (§102)."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_get_world_market_returns_200(client):
    response = client.get("/api/world/market")
    assert response.status_code == 200


def test_get_world_market_has_goods_list(client):
    data = client.get("/api/world/market").json()
    assert "goods" in data
    assert isinstance(data["goods"], list)


def test_get_world_market_has_8_goods(client):
    data = client.get("/api/world/market").json()
    assert len(data["goods"]) == 8


def test_get_world_market_goods_have_required_fields(client):
    data = client.get("/api/world/market").json()
    for good in data["goods"]:
        assert "id" in good
        assert "name" in good
        assert "emoji" in good
        assert "current_price" in good
        assert "base_price" in good
        assert "inventory" in good
        assert "price_history" in good
        assert "trend" in good
        assert "change_pct" in good


def test_get_world_market_prices_are_positive(client):
    data = client.get("/api/world/market").json()
    for good in data["goods"]:
        assert good["current_price"] > 0
        assert good["base_price"] > 0


def test_get_world_market_includes_all_good_ids(client):
    data = client.get("/api/world/market").json()
    ids = {g["id"] for g in data["goods"]}
    expected = {"food", "cloth", "wood", "stone", "herbs", "jewelry", "books", "luxury"}
    assert ids == expected


def test_get_world_market_trend_values_are_valid(client):
    data = client.get("/api/world/market").json()
    for good in data["goods"]:
        assert good["trend"] in ("up", "down", "flat")


def test_get_world_market_price_history_is_list(client):
    data = client.get("/api/world/market").json()
    for good in data["goods"]:
        assert isinstance(good["price_history"], list)
        assert len(good["price_history"]) >= 1
