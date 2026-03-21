"""Regression tests for Task 57: mood-history and network-analysis endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.simulation import SimulationState
from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# /api/simulation/mood-history
# ---------------------------------------------------------------------------

def test_mood_history_returns_list(client: TestClient) -> None:
    """GET /api/simulation/mood-history returns a JSON list."""
    resp = client.get("/api/simulation/mood-history")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_mood_history_has_correct_fields_after_tick(client: TestClient) -> None:
    """After running a tick mood-history entries contain expected fields."""
    state = client.app.state.simulation_state
    # Force a tick to populate history
    await state._tick()

    resp = client.get("/api/simulation/mood-history")
    assert resp.status_code == 200
    history = resp.json()
    if history:
        entry = history[0]
        assert "tick" in entry
        assert "resident_id" in entry
        assert "resident_name" in entry
        assert "mood" in entry


async def test_mood_history_cleared_on_scene_switch(client: TestClient) -> None:
    """Switching scene clears mood history so stale data doesn't bleed across sessions.

    Specifically: modern_community residents (e.g. '小明') must not appear in
    mood history after switching to seaside_village.  New ticks from the new
    scene are allowed.
    """
    state = client.app.state.simulation_state
    # Populate history with modern_community entries
    await state._tick()
    modern_names = {entry["resident_name"] for entry in getattr(state, "_mood_history", [])}
    assert modern_names, "Expected modern_community history to be non-empty"

    # Switch to seaside_village (clears history, then may run a new tick)
    resp = client.post("/api/simulation/start", json={"scene": "seaside_village"})
    assert resp.status_code == 200

    new_state = client.app.state.simulation_state
    history_after = getattr(new_state, "_mood_history", [])
    new_names = {entry["resident_name"] for entry in history_after}

    # Old modern_community residents must not appear in new history
    stale = modern_names & new_names
    assert not stale, f"Stale residents from previous scene found: {stale}"

    # Reset back for other tests
    client.post("/api/simulation/start", json={"scene": "modern_community"})


async def test_mood_history_max_100_ticks(client: TestClient) -> None:
    """Mood history is bounded to the last 100 ticks worth of entries."""
    state = client.app.state.simulation_state
    n_agents = len(state.world.agents)
    # Add many entries directly
    state._mood_history = [
        {"tick": i, "resident_id": "x", "resident_name": "X", "mood": "neutral"}
        for i in range(200 * n_agents)
    ]
    # Run one more tick to trigger trim
    await state._tick()

    assert len(state._mood_history) <= 100 * max(1, n_agents) + n_agents


# ---------------------------------------------------------------------------
# /api/simulation/network-analysis
# ---------------------------------------------------------------------------

def test_network_analysis_returns_list(client: TestClient) -> None:
    """GET /api/simulation/network-analysis returns a sorted JSON list."""
    resp = client.get("/api/simulation/network-analysis")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_network_analysis_entry_fields(client: TestClient) -> None:
    """Network analysis entries have expected fields."""
    resp = client.get("/api/simulation/network-analysis")
    data = resp.json()
    if data:
        entry = data[0]
        for field in ("resident_id", "name", "relationship_count", "avg_intensity", "influence_score"):
            assert field in entry, f"Missing field: {field}"


def test_network_analysis_sorted_by_influence(client: TestClient) -> None:
    """Results should be sorted by influence_score descending."""
    resp = client.get("/api/simulation/network-analysis")
    data = resp.json()
    if len(data) >= 2:
        scores = [e["influence_score"] for e in data]
        assert scores == sorted(scores, reverse=True), "Not sorted by influence_score desc"


def test_network_analysis_has_all_residents(client: TestClient) -> None:
    """Every agent in the world appears in network analysis."""
    state = client.app.state.simulation_state
    resident_count = len(state.world.agents)
    resp = client.get("/api/simulation/network-analysis")
    data = resp.json()
    assert len(data) == resident_count
