"""Tests for /api/director endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _get_two_resident_ids(client):
    residents = client.get("/api/residents").json()
    assert len(residents) >= 2
    return residents[0]["id"], residents[1]["id"]


# ---------------------------------------------------------------------------
# POST /api/director/inject-emotion
# ---------------------------------------------------------------------------


def test_inject_emotion_success(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.post(
        "/api/director/inject-emotion",
        json={"resident_id": rid, "emotion": "happy", "reason": "Someone gave them flowers"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["mood"] == "happy"
    assert data["id"] == rid


def test_inject_emotion_changes_mood(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    client.post(
        "/api/director/inject-emotion",
        json={"resident_id": rid, "emotion": "sad"},
    )
    resident = client.get(f"/api/residents/{rid}").json()
    assert resident["mood"] == "sad"


def test_inject_emotion_not_found(client):
    response = client.post(
        "/api/director/inject-emotion",
        json={"resident_id": "nonexistent_id", "emotion": "happy"},
    )
    assert response.status_code == 404


def test_inject_emotion_invalid_emotion(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.post(
        "/api/director/inject-emotion",
        json={"resident_id": rid, "emotion": "confused"},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/director/force-encounter
# ---------------------------------------------------------------------------


def test_force_encounter_success(client):
    rid_a, rid_b = _get_two_resident_ids(client)

    response = client.post(
        "/api/director/force-encounter",
        json={"resident_a_id": rid_a, "resident_b_id": rid_b},
    )
    assert response.status_code == 200
    data = response.json()
    assert "event_description" in data
    assert "location" in data
    assert "不期而遇" in data["event_description"]


def test_force_encounter_creates_event(client):
    rid_a, rid_b = _get_two_resident_ids(client)

    response = client.post(
        "/api/director/force-encounter",
        json={"resident_a_id": rid_a, "resident_b_id": rid_b},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["event_description"]) > 0
    assert len(data["location"]) > 0


def test_force_encounter_resident_a_not_found(client):
    residents = client.get("/api/residents").json()
    rid_b = residents[0]["id"]

    response = client.post(
        "/api/director/force-encounter",
        json={"resident_a_id": "nonexistent_a", "resident_b_id": rid_b},
    )
    assert response.status_code == 404


def test_force_encounter_resident_b_not_found(client):
    residents = client.get("/api/residents").json()
    rid_a = residents[0]["id"]

    response = client.post(
        "/api/director/force-encounter",
        json={"resident_a_id": rid_a, "resident_b_id": "nonexistent_b"},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/director/spread-rumor
# ---------------------------------------------------------------------------


def test_spread_rumor_positive(client):
    rid_a, rid_b = _get_two_resident_ids(client)

    response = client.post(
        "/api/director/spread-rumor",
        json={
            "target_id": rid_a,
            "listener_id": rid_b,
            "content": "heard something nice about them",
            "is_positive": True,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["effect"] == "positive"


def test_spread_rumor_negative(client):
    rid_a, rid_b = _get_two_resident_ids(client)

    response = client.post(
        "/api/director/spread-rumor",
        json={
            "target_id": rid_a,
            "listener_id": rid_b,
            "content": "heard something bad about them",
            "is_positive": False,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["effect"] == "negative"


def test_spread_rumor_not_found_target(client):
    residents = client.get("/api/residents").json()
    listener_id = residents[0]["id"]

    response = client.post(
        "/api/director/spread-rumor",
        json={
            "target_id": "nonexistent_target",
            "listener_id": listener_id,
            "content": "some rumor",
        },
    )
    assert response.status_code == 404


def test_spread_rumor_not_found_listener(client):
    residents = client.get("/api/residents").json()
    target_id = residents[0]["id"]

    response = client.post(
        "/api/director/spread-rumor",
        json={
            "target_id": target_id,
            "listener_id": "nonexistent_listener",
            "content": "some rumor",
        },
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/director/trigger-jealousy
# ---------------------------------------------------------------------------


def test_trigger_jealousy_success(client):
    rid_a, rid_b = _get_two_resident_ids(client)

    response = client.post(
        "/api/director/trigger-jealousy",
        json={"resident_id": rid_a, "rival_id": rid_b},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["mood"] == "angry"
    assert data["id"] == rid_a


def test_trigger_jealousy_not_found_resident(client):
    residents = client.get("/api/residents").json()
    rival_id = residents[0]["id"]

    response = client.post(
        "/api/director/trigger-jealousy",
        json={"resident_id": "nonexistent_id", "rival_id": rival_id},
    )
    assert response.status_code == 404


def test_trigger_jealousy_not_found_rival(client):
    residents = client.get("/api/residents").json()
    resident_id = residents[0]["id"]

    response = client.post(
        "/api/director/trigger-jealousy",
        json={"resident_id": resident_id, "rival_id": "nonexistent_rival"},
    )
    assert response.status_code == 404
