"""Tests for GET /health endpoint."""
import logging

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_returns_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "redis" in body
    assert "neo4j" in body


def test_health_content_type(client):
    response = client.get("/health")
    assert "application/json" in response.headers["content-type"]


def test_health_request_is_logged(client, caplog):
    with caplog.at_level(logging.INFO):
        response = client.get("/health")

    assert response.status_code == 200
    assert any(
        record.levelno == logging.INFO
        and getattr(record, "request_log", {}).get("method") == "GET"
        and getattr(record, "request_log", {}).get("path") == "/health"
        and getattr(record, "request_log", {}).get("status") == 200
        and isinstance(getattr(record, "request_log", {}).get("duration_ms"), float)
        for record in caplog.records
    )
