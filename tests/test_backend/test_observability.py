from __future__ import annotations

import json
import logging

import pytest
from fastapi.testclient import TestClient

from backend.main import JsonRequestFormatter, app


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_rate_limit_returns_429_after_120_requests(client: TestClient) -> None:
    for _ in range(120):
        response = client.get("/api/simulation/status", headers={"x-forwarded-for": "198.51.100.77"})
        assert response.status_code == 200

    limited_response = client.get("/api/simulation/status", headers={"x-forwarded-for": "198.51.100.77"})

    assert limited_response.status_code == 429
    assert limited_response.json() == {
        "detail": "rate limit exceeded",
        "code": "rate_limit_exceeded",
    }


def test_metrics_endpoint_returns_prometheus_payload(client: TestClient) -> None:
    state = client.app.state.simulation_state
    state.world.current_tick = 7

    client.get("/api/simulation/status", headers={"x-forwarded-for": "198.51.100.88"})
    metrics_response = client.get("/api/metrics", headers={"x-forwarded-for": "198.51.100.89"})

    assert metrics_response.status_code == 200
    assert metrics_response.headers["content-type"].startswith("text/plain")

    body = metrics_response.text
    assert "# HELP request_count Total HTTP requests processed." in body
    assert 'request_count{method="GET",path="/api/simulation/status",status="200"} 1' in body
    assert "# HELP request_duration HTTP request duration in milliseconds." in body
    assert 'request_duration_count{method="GET",path="/api/simulation/status"} 1' in body
    assert "active_connections 0" in body
    assert "simulation_ticks_total 7" in body


def test_json_request_formatter_outputs_expected_fields() -> None:
    formatter = JsonRequestFormatter()
    record = logging.LogRecord(
        name="backend.main",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="HTTP request completed",
        args=(),
        exc_info=None,
    )
    record.request_log = {
        "timestamp": "2026-03-22T12:00:00+00:00",
        "level": "INFO",
        "method": "GET",
        "path": "/health",
        "status": 200,
        "duration_ms": 12.34,
    }

    payload = json.loads(formatter.format(record))

    assert payload == {
        "timestamp": "2026-03-22T12:00:00+00:00",
        "level": "INFO",
        "method": "GET",
        "path": "/health",
        "status": 200,
        "duration_ms": 12.34,
    }
