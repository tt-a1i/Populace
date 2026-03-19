"""Tests for /api/residents endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_list_residents_returns_10(client):
    response = client.get("/api/residents")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 10


def test_list_residents_has_required_fields(client):
    response = client.get("/api/residents")
    resident = response.json()[0]
    assert "id" in resident
    assert "name" in resident
    assert "personality" in resident
    assert "x" in resident
    assert "y" in resident


def test_get_resident_by_id(client):
    # Get list first to find a valid id
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}")
    assert response.status_code == 200
    assert response.json()["id"] == rid


def test_get_resident_not_found(client):
    response = client.get("/api/residents/nonexistent_id")
    assert response.status_code == 404


def test_patch_resident_mood(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.patch(
        f"/api/residents/{rid}",
        json={"mood": "happy"},
    )
    assert response.status_code == 200
    assert response.json()["mood"] == "happy"


def test_patch_resident_not_found(client):
    response = client.patch("/api/residents/nobody", json={"mood": "sad"})
    assert response.status_code == 404
