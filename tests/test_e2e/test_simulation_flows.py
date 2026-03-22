from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.api.saves import SAVES_DIR


def _wait_until(predicate, timeout: float = 5.0, interval: float = 0.05) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(interval)
    raise AssertionError("condition not reached before timeout")


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        state = test_client.app.state.simulation_state
        state.loop.clock.set_speed(1.0)
        state._events.clear()
        state._active_events.clear()
        test_client.app.state.rate_limiter.reset()
        test_client.post("/api/simulation/start", json={"scene": "modern_community"})
        test_client.post("/api/simulation/stop")
        for save_file in Path(SAVES_DIR).glob("*.json"):
            save_file.unlink()
        yield test_client
        test_client.post("/api/simulation/stop")


def test_start_run_five_ticks_detects_resident_movement_and_stop(client: TestClient) -> None:
    initial_residents = client.get("/api/residents").json()
    initial_positions = {
        resident["id"]: (resident["x"], resident["y"], resident["location"])
        for resident in initial_residents
    }

    start_response = client.post("/api/simulation/start", json={"scene": "modern_community"})
    assert start_response.status_code == 200
    speed_response = client.post("/api/simulation/speed", json={"speed": 50})
    assert speed_response.status_code == 200
    start_tick = start_response.json()["tick"]

    _wait_until(lambda: client.get("/api/simulation/status").json()["tick"] >= start_tick + 5)

    moved_residents = client.get("/api/residents").json()
    moved = any(
        (resident["x"], resident["y"], resident["location"]) != initial_positions[resident["id"]]
        for resident in moved_residents
    )
    assert moved

    stop_response = client.post("/api/simulation/stop")
    assert stop_response.status_code == 200
    assert stop_response.json()["running"] is False


def test_switch_scene_changes_resident_count(client: TestClient) -> None:
    modern_response = client.post("/api/simulation/start", json={"scene": "modern_community"})
    assert modern_response.status_code == 200
    modern_residents = client.get("/api/residents").json()

    seaside_response = client.post("/api/simulation/start", json={"scene": "seaside_village"})
    assert seaside_response.status_code == 200
    seaside_residents = client.get("/api/residents").json()

    assert len(modern_residents) == 10
    assert len(seaside_residents) == 6
    assert len(modern_residents) != len(seaside_residents)


def test_save_then_load_restores_state(client: TestClient) -> None:
    client.post("/api/simulation/start", json={"scene": "modern_community"})
    residents = client.get("/api/residents").json()
    resident_id = residents[0]["id"]

    patched = client.patch(
        f"/api/residents/{resident_id}",
        json={"mood": "happy", "x": 7, "y": 9},
    )
    assert patched.status_code == 200
    assert client.post("/api/simulation/stop").status_code == 200

    save_response = client.post("/api/saves", json={"name": "e2e-save"})
    assert save_response.status_code == 201
    save_id = save_response.json()["id"]

    mutate_response = client.patch(
        f"/api/residents/{resident_id}",
        json={"mood": "sad", "x": 1, "y": 1},
    )
    assert mutate_response.status_code == 200

    load_response = client.post(f"/api/saves/{save_id}/load")
    assert load_response.status_code == 200

    restored = client.get(f"/api/residents/{resident_id}").json()
    assert restored["mood"] == "happy"
    assert restored["x"] == 7
    assert restored["y"] == 9


def test_inject_event_applies_to_simulation_state(client: TestClient) -> None:
    client.post("/api/simulation/start", json={"scene": "modern_community"})
    client.post("/api/simulation/speed", json={"speed": 50})
    resident_id = client.get("/api/residents").json()[0]["id"]

    event_response = client.post(
        "/api/world/events",
        json={"description": "中央广场突然开始免费发放热汤", "source": "user"},
    )
    assert event_response.status_code == 200

    _wait_until(
        lambda: any(
            memory["content"] == "中央广场突然开始免费发放热汤"
            for memory in client.get(f"/api/residents/{resident_id}/memories").json()
        )
    )

    timeline = client.get("/api/simulation/timeline")
    assert timeline.status_code == 200
    assert any(item["event_type"] == "custom_event" for item in timeline.json())
