"""Tests for /api/simulation endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.api.simulation import SimulationState
from backend.main import app
from engine.types import RelationType, Relationship
from tests.conftest import make_memory


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
    original_agents = list(state.world.agents)
    original_relationships = dict(state.world.relationships)
    original_tick = state.world.current_tick
    original_events = list(state._events)
    original_active_events = list(state._active_events)
    original_dialogue_count = getattr(state, "_total_dialogue_count", 0)
    original_relationship_change_count = getattr(state, "_total_relationship_change_count", 0)

    try:
        state.world.agents = list(original_agents[:4])
        for agent in state.world.agents:
            agent.resident.mood = "neutral"
            agent.memory_stream._memories = []

        resident_a, resident_b, resident_c, resident_d = [agent.resident for agent in state.world.agents]
        resident_a.name = "小明"
        resident_b.name = "小红"
        resident_c.name = "阿强"
        resident_d.name = "阿雅"
        resident_a.mood = "happy"
        resident_b.mood = "sad"
        resident_c.mood = "neutral"
        resident_d.mood = "happy"

        state.world.agents[0].memory_stream._memories = [make_memory("记忆 A1"), make_memory("记忆 A2")]
        state.world.agents[1].memory_stream._memories = [make_memory("记忆 B1")]
        state.world.agents[3].memory_stream._memories = [
            make_memory("记忆 D1"),
            make_memory("记忆 D2"),
            make_memory("记忆 D3"),
        ]

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
        state.world.relationships = {
            (resident_a.id, resident_b.id): Relationship(
                from_id=resident_a.id,
                to_id=resident_b.id,
                type=RelationType.friendship,
                intensity=0.9,
                since="Day 1, 08:00",
                familiarity=0.8,
                reason="一起吃早餐",
            ),
            (resident_a.id, resident_c.id): Relationship(
                from_id=resident_a.id,
                to_id=resident_c.id,
                type=RelationType.trust,
                intensity=0.1,
                since="Day 1, 10:00",
                familiarity=0.2,
                reason="短暂合作",
            ),
        }

        response = client.get("/api/simulation/stats")

        assert response.status_code == 200
        assert response.json() == {
            "total_ticks": 12,
            "total_dialogues": 5,
            "total_relationship_changes": 8,
            "active_events": 2,
            "average_mood_score": 0.25,
            "most_social_resident": {
                "id": resident_a.id,
                "name": "小明",
                "relationship_count": 2,
                "relationship_intensity": 1.0,
            },
            "loneliest_resident": {
                "id": resident_d.id,
                "name": "阿雅",
                "relationship_count": 0,
                "relationship_intensity": 0.0,
            },
            "strongest_relationship": {
                "from_id": resident_a.id,
                "from_name": "小明",
                "to_id": resident_b.id,
                "to_name": "小红",
                "type": "friendship",
                "intensity": 0.9,
            },
            "total_memories": 6,
        }
    finally:
        state.world.agents = original_agents
        state.world.relationships = original_relationships
        state.world.current_tick = original_tick
        state._events = original_events
        state._active_events = original_active_events
        state._total_dialogue_count = original_dialogue_count
        state._total_relationship_change_count = original_relationship_change_count


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


@pytest.mark.parametrize("speed", [2, 10, 50])
def test_set_speed_valid(client, speed):
    response = client.post("/api/simulation/speed", json={"speed": speed})
    assert response.status_code == 200
    assert response.json()["speed"] == speed


def test_set_speed_invalid(client):
    response = client.post("/api/simulation/speed", json={"speed": 3})
    assert response.status_code in (400, 422)  # Pydantic Literal validation returns 422


def test_snapshot_contains_residents(client):
    """Snapshot is served via WebSocket, not as a REST endpoint.
    This test validates the REST endpoint if/when it becomes available."""
    response = client.get("/api/simulation/snapshot")
    if response.status_code == 404:
        pytest.skip("snapshot is served via WebSocket only — no REST endpoint yet")
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
