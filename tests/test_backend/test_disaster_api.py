"""Tests for disaster world APIs and runtime tick updates."""

import asyncio
import copy

import pytest
from fastapi.testclient import TestClient

from backend.api.simulation import SimulationState
from backend.main import app
from engine.types import WeatherType


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_list_disasters_exposes_current_history_and_summary(client):
    state = client.app.state.simulation_state
    original_active = copy.deepcopy(getattr(state, "_active_disasters", []))
    original_history = copy.deepcopy(getattr(state, "_disaster_history", []))

    try:
        state._active_disasters = [
            {
                "type": "fire",
                "severity": 0.72,
                "affected_buildings": ["home1", "cafe1"],
                "tick_start": 120,
                "duration": 10,
                "casualties": 1,
                "status": "active",
                "reserve_spent": 28.0,
                "evacuations": 3,
            }
        ]
        state._disaster_history = [
            {
                "type": "flood",
                "severity": 0.65,
                "affected_buildings": ["school1"],
                "tick_start": 60,
                "duration": 12,
                "casualties": 0,
                "status": "completed",
                "end_tick": 72,
                "reserve_spent": 42.0,
                "evacuations": 2,
                "memorial": "洪水退去后，镇民一起清理了街道。",
            }
        ]

        response = client.get("/api/world/disasters")
        assert response.status_code == 200
        payload = response.json()

        assert payload["current"][0]["type"] == "fire"
        assert payload["history"][0]["type"] == "flood"
        assert payload["summary"]["active_count"] == 1
        assert payload["summary"]["history_count"] == 1
        assert payload["summary"]["affected_buildings"] == 3
        assert payload["summary"]["total_casualties"] == 1
        assert payload["summary"]["reserve_spent"] == pytest.approx(70.0)
    finally:
        state._active_disasters = original_active
        state._disaster_history = original_history


def test_tick_can_start_flood_and_emit_disaster_update():
    state = SimulationState()
    state.world.config.llm_call_probability = 0.0
    state._active_disasters = []
    state._disaster_history = []
    state._consecutive_rainy_ticks = state.world.config.tick_per_day * 5
    state.world.weather = WeatherType.rainy
    state.world.current_tick = 17

    import random

    original_random = random.random
    try:
        random.random = lambda: 0.0
        tick_state = asyncio.run(state._tick())
        assert tick_state.disaster_updates
        assert tick_state.disaster_updates[0].status == "started"
        assert tick_state.disaster_updates[0].disaster.type == "flood"
        assert state._active_disasters
        assert state._active_disasters[0]["type"] == "flood"
    finally:
        random.random = original_random
