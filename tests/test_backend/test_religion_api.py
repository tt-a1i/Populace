import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_world_religion_returns_distribution_morality_and_events(client):
    state = client.app.state.simulation_state
    world = state.world
    from engine.types import Building, Religion

    chapel = Building(id="chapel-api", type="chapel", name="晨辉礼拜堂", capacity=10, position=(11, 6))
    original_event_count = len(getattr(world, "religious_events", []))
    original_history = list(getattr(world, "morality_history", []))
    original_religions = [agent.resident.religion for agent in world.agents[:3]]
    original_piety = [agent.resident.piety for agent in world.agents[:3]]
    original_reputation = [agent.resident.reputation for agent in world.agents[:3]]

    try:
        world.add_building(chapel)
        for index, agent in enumerate(world.agents[:3]):
            agent.resident.religion = [Religion.solarsm, Religion.solarsm, Religion.naturalism][index]
            agent.resident.piety = [0.9, 0.8, 0.4][index]
            agent.resident.reputation = [0.7, 0.45, 0.1][index]
        world.maybe_create_religious_event()

        response = client.get("/api/world/religion")

        assert response.status_code == 200
        payload = response.json()
        assert "distribution" in payload
        assert "morality_index" in payload
        assert "morality_history" in payload
        assert "events" in payload
        assert "leaders" in payload
        assert any(item["religion"] == "solarsm" for item in payload["distribution"])
    finally:
        world.remove_building(chapel.id)
        world.religious_events = world.religious_events[:original_event_count]
        world.morality_history = original_history
        for agent, religion, piety, reputation in zip(world.agents[:3], original_religions, original_piety, original_reputation):
            agent.resident.religion = religion
            agent.resident.piety = piety
            agent.resident.reputation = reputation
