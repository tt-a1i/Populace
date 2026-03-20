"""Regression tests for scene switching via POST /api/simulation/start.

Covers the bug where switching back to modern_community after seaside_village
did not reload the template because of a special-case `!= "modern_community"` guard.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_switch_to_seaside_village_then_back_to_modern_community(client: TestClient) -> None:
    """Switching scenes reloads the correct template each time."""
    # 1. Start seaside_village — expect 6 residents, 6 buildings
    resp = client.post("/api/simulation/start", json={"scene": "seaside_village"})
    assert resp.status_code == 200

    residents_resp = client.get("/api/residents")
    assert residents_resp.status_code == 200
    residents = residents_resp.json()
    assert len(residents) == 6, f"Expected 6 residents for seaside_village, got {len(residents)}"

    buildings_resp = client.get("/api/world/buildings")
    assert buildings_resp.status_code == 200
    buildings = buildings_resp.json()
    assert len(buildings) == 6, f"Expected 6 buildings for seaside_village, got {len(buildings)}"

    # 2. Stop simulation
    stop_resp = client.post("/api/simulation/stop")
    assert stop_resp.status_code == 200

    # 3. Switch back to modern_community — expect 10 residents, 8 buildings
    resp2 = client.post("/api/simulation/start", json={"scene": "modern_community"})
    assert resp2.status_code == 200

    residents_resp2 = client.get("/api/residents")
    assert residents_resp2.status_code == 200
    residents2 = residents_resp2.json()
    assert len(residents2) == 10, (
        f"Expected 10 residents after switching back to modern_community, got {len(residents2)}"
    )

    buildings_resp2 = client.get("/api/world/buildings")
    buildings2 = buildings_resp2.json()
    assert len(buildings2) == 8, (
        f"Expected 8 buildings after switching back to modern_community, got {len(buildings2)}"
    )


def test_start_default_scene_loads_modern_community(client: TestClient) -> None:
    """POST /api/simulation/start with no body loads modern_community."""
    resp = client.post("/api/simulation/start")
    assert resp.status_code == 200

    residents = client.get("/api/residents").json()
    assert len(residents) == 10


def test_start_unknown_scene_falls_back_to_default(client: TestClient) -> None:
    """Unknown scene slug falls back to modern_community gracefully."""
    resp = client.post("/api/simulation/start", json={"scene": "nonexistent_scene"})
    assert resp.status_code == 200

    residents = client.get("/api/residents").json()
    assert len(residents) == 10, "Unknown scene should fall back to 10-resident modern_community"


def test_active_events_cleared_on_scene_switch(client: TestClient) -> None:
    """Active events from a previous scene must not leak into the new scene."""
    # Inject a multi-tick preset event
    resp = client.post("/api/world/events", json={"preset_id": "storm"})
    assert resp.status_code == 200

    # Verify event is active
    active = client.get("/api/world/events/active").json()
    assert len(active) >= 1, "storm event should appear in active events"

    # Switch scene — active events must be cleared
    resp2 = client.post("/api/simulation/start", json={"scene": "seaside_village"})
    assert resp2.status_code == 200

    active_after = client.get("/api/world/events/active").json()
    assert len(active_after) == 0, (
        f"Active events should be cleared after scene switch, got {active_after}"
    )
