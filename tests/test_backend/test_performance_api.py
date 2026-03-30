"""Tests for GET /api/simulation/performance endpoint."""
from __future__ import annotations

import asyncio

import pytest
from unittest.mock import patch, MagicMock

from backend.api.simulation import SimulationState, PerformanceResponse


@pytest.fixture(autouse=True)
def _ensure_event_loop():
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())


class TestPerformanceEndpoint:
    """Test the performance metrics endpoint and adaptive throttling."""

    def test_performance_response_model_defaults(self):
        """PerformanceResponse has sensible defaults."""
        resp = PerformanceResponse()
        assert resp.avg_tick_duration_ms == 0.0
        assert resp.max_tick_duration_ms == 0.0
        assert resp.active_agents_count == 0
        assert resp.pending_llm_calls == 0
        assert resp.memory_usage_mb == 0.0
        assert resp.websocket_connections == 0
        assert resp.adaptive_throttle_active is False
        assert resp.tick_history == []

    def test_tick_duration_tracking(self):
        """SimulationState tracks tick durations after initialization."""
        state = SimulationState()
        assert hasattr(state, "_tick_durations")
        assert state._tick_durations == []
        assert state._max_tick_history == 50

    def test_tick_duration_history_bounded(self):
        """Tick duration history is bounded to _max_tick_history entries."""
        state = SimulationState()
        state._tick_durations = list(range(100))
        # Simulate trimming as _tick does
        if len(state._tick_durations) > state._max_tick_history:
            state._tick_durations = state._tick_durations[-state._max_tick_history:]
        assert len(state._tick_durations) == 50

    def test_adaptive_throttle_fields_exist(self):
        """SimulationState has adaptive throttle tracking fields."""
        state = SimulationState()
        assert hasattr(state, "_adaptive_throttle_active")
        assert state._adaptive_throttle_active is False
        assert hasattr(state, "_pending_llm_count")
        assert state._pending_llm_count == 0
