from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_unhandled_api_errors_return_uniform_error_payload(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*_args, **_kwargs):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(client.app.state.simulation_state, "get_stats", boom)

    response = client.get("/api/simulation/stats")

    assert response.status_code == 500
    assert response.json() == {
        "detail": "Internal server error",
        "code": "internal_server_error",
    }


def test_rate_limiter_rejects_excess_requests_with_uniform_payload(client: TestClient) -> None:
    rate_limiter = client.app.state.rate_limiter
    rate_limiter.reset()
    rate_limiter.max_requests = 2
    rate_limiter.window_seconds = 60

    assert client.get("/api/simulation/status").status_code == 200
    assert client.get("/api/simulation/status").status_code == 200

    response = client.get("/api/simulation/status")

    assert response.status_code == 429
    assert response.json() == {
        "detail": "rate limit exceeded",
        "code": "rate_limit_exceeded",
    }


def test_ensure_runtime_templates_creates_defaults(tmp_path) -> None:
    from backend.core.runtime import ensure_runtime_assets

    templates_dir = tmp_path / "templates"

    ensure_runtime_assets(templates_dir)

    modern_template = templates_dir / "modern_community.json"
    seaside_template = templates_dir / "seaside_village.json"

    assert modern_template.exists()
    assert seaside_template.exists()

    modern_data = json.loads(modern_template.read_text(encoding="utf-8"))
    seaside_data = json.loads(seaside_template.read_text(encoding="utf-8"))

    assert modern_data["buildings"]
    assert modern_data["residents"]
    assert seaside_data["buildings"]
    assert seaside_data["residents"]
