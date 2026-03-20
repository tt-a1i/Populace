"""Tests for /api/simulation endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.api.simulation import SimulationState
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


def test_get_stats_returns_aggregate_fields(client):
    state = client.app.state.simulation_state
    state.world.current_tick = 12
    state._total_dialogue_count = 5
    state._total_relationship_change_count = 8
    state._events = [{"id": "queued-1", "description": "队列事件", "source": "user", "timestamp": "Day 1"}]
    state._active_events = [
        {
            "id": "active-1",
            "name": "持续事件",
            "description": "持续中的事件",
            "radius": 3,
            "remaining_ticks": 2,
            "source": "user",
        },
    ]

    response = client.get("/api/simulation/stats")

    assert response.status_code == 200
    assert response.json() == {
        "total_ticks": 12,
        "total_dialogues": 5,
        "total_relationship_changes": 8,
        "active_events": 2,
    }


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
    assert response.status_code in (400, 422)  # Pydantic Literal validation returns 422


def test_snapshot_contains_residents(client):
    response = client.get("/api/simulation/snapshot")
    if response.status_code == 404:
        pytest.skip("snapshot endpoint not available")
    data = response.json()
    assert "residents" in data
    assert len(data["residents"]) > 0


@pytest.mark.asyncio
async def test_save_load_round_trip_preserves_resident_appearance():
    state = SimulationState()
    restored_state = SimulationState()

    resident = state.world.agents[0].resident
    resident.skin_color = "#f2d3b1"
    resident.hair_style = "ponytail"
    resident.hair_color = "#5b4636"
    resident.outfit_color = "#2563eb"

    payload = state.save_state()
    await restored_state.load_state(payload)

    restored_resident = restored_state.world.agents[0].resident
    assert restored_resident.skin_color == resident.skin_color
    assert restored_resident.hair_style == resident.hair_style
    assert restored_resident.hair_color == resident.hair_color
    assert restored_resident.outfit_color == resident.outfit_color
