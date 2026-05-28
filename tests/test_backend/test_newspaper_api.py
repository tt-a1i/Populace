"""Tests for V9 newspaper API endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_newspaper_latest_endpoint_exists(client):
    """GET /api/world/newspaper returns 200."""
    resp = client.get("/api/world/newspaper")
    assert resp.status_code == 200


def test_newspaper_latest_response_structure(client):
    """Response has 'issue' key (may be null if no ticks run)."""
    resp = client.get("/api/world/newspaper")
    data = resp.json()
    assert "issue" in data


def test_newspaper_archive_endpoint_exists(client):
    """GET /api/world/newspaper/archive returns 200."""
    resp = client.get("/api/world/newspaper/archive")
    assert resp.status_code == 200


def test_newspaper_archive_response_structure(client):
    """Archive response has 'issues' list."""
    resp = client.get("/api/world/newspaper/archive")
    data = resp.json()
    assert "issues" in data
    assert isinstance(data["issues"], list)


def test_newspaper_issue_fields_when_present(client):
    """If issue is present, it has required fields."""
    resp = client.get("/api/world/newspaper")
    data = resp.json()
    if data["issue"] is not None:
        issue = data["issue"]
        assert "issue_id" in issue
        assert "tick" in issue
        assert "headlines" in issue
        assert "sections" in issue
        assert isinstance(issue["headlines"], list)
        assert isinstance(issue["sections"], dict)


def test_newspaper_archive_items_have_fields(client):
    """Each archive item has required fields."""
    resp = client.get("/api/world/newspaper/archive")
    data = resp.json()
    for issue in data["issues"]:
        assert "issue_id" in issue
        assert "tick" in issue
        assert "headlines" in issue
