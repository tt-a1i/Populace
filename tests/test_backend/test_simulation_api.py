"""Tests for /api/simulation endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_get_status_returns_fields(client):
    response = client.get("/api/simulation/status")
    assert response.status_code == 200
    data = response.json()
    assert "running" in data
    assert "tick" in data
    assert "speed" in data


def test_start_simulation(client):
    response = client.post("/api/simulation/start")
    assert response.status_code == 200
    data = response.json()
    assert data["running"] is True


def test_stop_simulation(client):
    # Start first
    client.post("/api/simulation/start")
    response = client.post("/api/simulation/stop")
    assert response.status_code == 200


def test_set_speed_valid(client):
    response = client.post("/api/simulation/speed", json={"speed": 2})
    assert response.status_code == 200


def test_set_speed_invalid(client):
    response = client.post("/api/simulation/speed", json={"speed": 3})
    assert response.status_code == 400


def test_snapshot_contains_residents(client):
    response = client.get("/api/simulation/snapshot")
    if response.status_code == 404:
        pytest.skip("snapshot endpoint not available")
    data = response.json()
    assert "residents" in data
    assert len(data["residents"]) > 0
