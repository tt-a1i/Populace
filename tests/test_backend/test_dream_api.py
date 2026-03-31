"""Tests for GET /api/world/dream_stats endpoint."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_dream_stats_returns_200(client):
    """Returns 200 with a running simulation."""
    resp = client.get("/api/world/dream_stats")
    assert resp.status_code == 200


def test_dream_stats_returns_structure(client):
    """Returns expected keys with correct types."""
    resp = client.get("/api/world/dream_stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "dreams_fulfilled_total" in data
    assert "top_dreams" in data
    assert "avg_progress" in data
    assert "recent_fulfillments" in data
    assert isinstance(data["dreams_fulfilled_total"], int)
    assert isinstance(data["top_dreams"], list)
    assert isinstance(data["avg_progress"], float)
    assert isinstance(data["recent_fulfillments"], list)


def test_dream_stats_top_dreams_structure(client):
    """top_dreams entries have dream and count fields."""
    resp = client.get("/api/world/dream_stats")
    assert resp.status_code == 200
    data = resp.json()
    for entry in data["top_dreams"]:
        assert "dream" in entry
        assert "count" in entry
        assert isinstance(entry["count"], int)


def test_dream_stats_avg_progress_range(client):
    """avg_progress is in [0.0, 1.0]."""
    resp = client.get("/api/world/dream_stats")
    assert resp.status_code == 200
    avg = resp.json()["avg_progress"]
    assert 0.0 <= avg <= 1.0


def test_dream_stats_recent_fulfillments_structure(client):
    """recent_fulfillments entries have required fields."""
    resp = client.get("/api/world/dream_stats")
    assert resp.status_code == 200
    data = resp.json()
    for entry in data["recent_fulfillments"]:
        assert "resident_id" in entry
        assert "resident_name" in entry
        assert "dream" in entry
        assert "tick" in entry


def test_dream_stats_fulfilled_count_nonnegative(client):
    """dreams_fulfilled_total is non-negative."""
    resp = client.get("/api/world/dream_stats")
    assert resp.status_code == 200
    assert resp.json()["dreams_fulfilled_total"] >= 0
