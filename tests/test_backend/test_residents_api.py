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


# ---------------------------------------------------------------------------
# POST /api/residents/create
# ---------------------------------------------------------------------------

def test_create_resident_success(client):
    response = client.post(
        "/api/residents/create",
        json={"name": "TestResident", "personality": "好奇心旺盛，爱探险"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "TestResident"
    assert data["personality"] == "好奇心旺盛，爱探险"
    assert data["mood"] == "neutral"
    assert "id" in data
    assert "x" in data
    assert "y" in data


def test_create_resident_appears_in_list(client):
    before = len(client.get("/api/residents").json())
    client.post(
        "/api/residents/create",
        json={"name": "NewcomerResident", "personality": "外向开朗"},
    )
    after = len(client.get("/api/residents").json())
    assert after == before + 1


def test_create_resident_custom_mood(client):
    response = client.post(
        "/api/residents/create",
        json={"name": "HappyResident", "personality": "乐观开朗", "mood": "happy"},
    )
    assert response.status_code == 200
    assert response.json()["mood"] == "happy"


def test_create_resident_empty_name_rejected(client):
    response = client.post(
        "/api/residents/create",
        json={"name": "   ", "personality": "内向安静"},
    )
    assert response.status_code == 400


def test_create_resident_invalid_building_rejected(client):
    response = client.post(
        "/api/residents/create",
        json={"name": "HomeResident", "personality": "安静", "home_building_id": "nonexistent_building_xyz"},
    )
    assert response.status_code == 400


def test_create_resident_with_initial_relationship(client):
    existing = client.get("/api/residents").json()
    target_id = existing[0]["id"]

    response = client.post(
        "/api/residents/create",
        json={
            "name": "FriendlyResident",
            "personality": "友善热情",
            "initial_relationships": [
                {"resident_id": target_id, "type": "friendship", "intensity": 0.7}
            ],
        },
    )
    assert response.status_code == 200
    new_id = response.json()["id"]

    # Verify relationship was created
    rels = client.get(f"/api/residents/{new_id}/relationships").json()
    assert any(r["to_id"] == target_id for r in rels)
