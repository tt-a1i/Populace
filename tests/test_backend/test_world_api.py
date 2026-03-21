"""Tests for /api/world endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_inject_event(client):
    response = client.post(
        "/api/world/events",
        json={"description": "突然下雨了", "source": "user"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "突然下雨了"


def test_inject_event_missing_description(client):
    response = client.post("/api/world/events", json={})
    assert response.status_code == 422


def test_list_buildings(client):
    response = client.get("/api/world/buildings")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
