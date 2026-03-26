import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_get_world_culture_returns_events_prosperity_and_rankings(client):
    response = client.get("/api/world/culture")

    assert response.status_code == 200
    payload = response.json()
    assert "events" in payload
    assert "prosperity_index" in payload
    assert "prosperity_history" in payload
    assert "talent_rankings" in payload

