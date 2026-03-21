"""Tests for /api/quests endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_list_quests(client):
    resp = client.get("/api/quests")
    assert resp.status_code == 200
    quests = resp.json()
    assert len(quests) == 5
    assert all("id" in q for q in quests)
    assert all("name" in q for q in quests)
    assert all("icon" in q for q in quests)
    assert all("status" in q for q in quests)
    ids = {q["id"] for q in quests}
    assert ids == {"matchmaker", "troublemaker", "gossip_master", "guardian", "social_butterfly"}


def test_start_quest(client):
    residents = client.get("/api/residents").json()
    a_id, b_id = residents[0]["id"], residents[1]["id"]
    resp = client.post("/api/quests/matchmaker/start", json={
        "params": {"resident_a": a_id, "resident_b": b_id}
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["quest_id"] == "matchmaker"


def test_get_active_quests(client):
    resp = client.get("/api/quests/active")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_start_invalid_quest(client):
    resp = client.post("/api/quests/nonexistent/start", json={"params": {}})
    assert resp.status_code == 404


def test_start_quest_missing_params(client):
    resp = client.post("/api/quests/social_butterfly/start", json={"params": {}})
    assert resp.status_code == 400


def test_abandon_quest(client):
    # Start troublemaker (no params required)
    resp = client.post("/api/quests/troublemaker/start", json={"params": {}})
    assert resp.status_code == 200
    # Abandon it
    resp = client.post("/api/quests/troublemaker/abandon")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True


def test_abandon_nonexistent_quest(client):
    resp = client.post("/api/quests/nonexistent/abandon")
    assert resp.status_code == 404


def test_quest_status_in_list(client):
    # After starting matchmaker earlier, it should appear as active
    resp = client.get("/api/quests")
    quests = resp.json()
    matchmaker = next(q for q in quests if q["id"] == "matchmaker")
    assert matchmaker["status"] in ("active", "completed", "failed")
