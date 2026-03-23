from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.simulation import SimulationState
from backend.main import app


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_get_simulation_snapshots_returns_recent_items(client: TestClient) -> None:
    state = client.app.state.simulation_state
    state._replay_snapshots = [
        {
            "tick": tick,
            "time": f"Day 1, {tick:02d}:00",
            "weather": "sunny",
            "season": "spring",
            "residents": [],
            "relationships": [],
        }
        for tick in range(100, 6100, 100)
    ]

    response = client.get("/api/simulation/snapshots")

    assert response.status_code == 200
    snapshots = response.json()
    assert len(snapshots) == 50
    assert snapshots[0]["tick"] == 1100
    assert snapshots[-1]["tick"] == 6000


def test_replay_tick_returns_snapshot_payload(client: TestClient) -> None:
    state = client.app.state.simulation_state
    state._replay_snapshots = [
        {
            "tick": 300,
            "time": "Day 7, 06:00",
            "weather": "rainy",
            "season": "autumn",
            "residents": [
                {
                    "id": "r1",
                    "name": "小明",
                    "x": 4,
                    "y": 9,
                    "mood": "happy",
                    "coins": 123,
                    "energy": 0.75,
                },
            ],
            "relationships": [
                {
                    "from_id": "r1",
                    "to_id": "r2",
                    "type": "friendship",
                    "intensity": 0.8,
                    "reason": "一起晨跑",
                },
            ],
        },
    ]

    response = client.post("/api/simulation/replay/300")

    assert response.status_code == 200
    payload = response.json()
    assert payload["tick"] == 300
    assert payload["weather"] == "rainy"
    assert payload["season"] == "autumn"
    assert payload["residents"][0]["coins"] == 123
    assert payload["relationships"][0]["type"] == "friendship"


@pytest.mark.asyncio
async def test_simulation_state_records_replay_snapshot_every_100_ticks() -> None:
    state = SimulationState()
    state.world.current_tick = 100

    snapshot = state._maybe_record_replay_snapshot()

    assert snapshot is not None
    assert snapshot["tick"] == 100
    assert snapshot["residents"]
    assert "weather" in snapshot
    assert "season" in snapshot


@pytest.mark.asyncio
async def test_simulation_state_limits_snapshot_history_to_50_entries() -> None:
    state = SimulationState()

    for tick in range(100, 5300, 100):
        state.world.current_tick = tick
        state._maybe_record_replay_snapshot()

    assert len(state._replay_snapshots) == 50
    assert state._replay_snapshots[0]["tick"] == 300
    assert state._replay_snapshots[-1]["tick"] == 5200
