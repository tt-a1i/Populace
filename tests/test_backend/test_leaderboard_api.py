"""Tests for leaderboard and badge system."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_leaderboards_endpoint_structure(client):
    """Test that leaderboards endpoint returns correct structure."""
    response = client.get("/api/world/leaderboards")
    assert response.status_code == 200
    data = response.json()

    # Check all 5 leaderboards exist
    assert "richest" in data
    assert "happiest" in data
    assert "most_social" in data
    assert "most_traveled" in data
    assert "most_influential" in data

    # Each leaderboard should be a list
    for board_name in ["richest", "happiest", "most_social", "most_traveled", "most_influential"]:
        assert isinstance(data[board_name], list)


def test_leaderboard_entry_structure(client):
    """Test that leaderboard entries have correct fields."""
    response = client.get("/api/world/leaderboards")
    assert response.status_code == 200
    data = response.json()

    # Check structure of entries (may be empty if no residents)
    for board_name in ["richest", "happiest", "most_social", "most_traveled", "most_influential"]:
        for entry in data[board_name]:
            assert "resident_id" in entry
            assert "name" in entry
            assert "value" in entry
            assert "rank" in entry
            assert isinstance(entry["rank"], int)
            assert isinstance(entry["value"], (int, float))


def test_badges_endpoint_structure(client):
    """Test that badges endpoint returns correct structure."""
    response = client.get("/api/world/badges")
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data, list)
    # Should have 10 predefined badges
    assert len(data) == 10

    # Check structure of each badge
    for badge in data:
        assert "badge_id" in badge
        assert "name" in badge
        assert "emoji" in badge
        assert "condition_desc" in badge


def test_badges_stats_endpoint(client):
    """Test that badges_stats endpoint returns correct structure."""
    response = client.get("/api/world/badges_stats")
    assert response.status_code == 200
    data = response.json()

    assert "total_awarded" in data
    assert "rarest_badge" in data
    assert "badge_distribution" in data

    assert isinstance(data["total_awarded"], int)
    assert isinstance(data["badge_distribution"], dict)


def test_badges_award_endpoint(client):
    """Test that badges/award endpoint works."""
    response = client.post("/api/world/badges/award")
    assert response.status_code == 200
    data = response.json()

    # Should return a list (may be empty if no badges awarded)
    assert isinstance(data, list)


def test_leaderboards_ranking_order(client):
    """Test that leaderboard rankings are in correct order."""
    response = client.get("/api/world/leaderboards")
    assert response.status_code == 200
    data = response.json()

    # Check that ranks are sequential and values are in descending order
    for board_name in ["richest", "happiest", "most_social", "most_traveled", "most_influential"]:
        board = data[board_name]
        prev_value = float('inf')
        expected_rank = 1
        for entry in board:
            assert entry["rank"] == expected_rank
            assert entry["value"] <= prev_value
            prev_value = entry["value"]
            expected_rank += 1
