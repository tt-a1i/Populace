"""Tests for /api/world/emotion_heatmap and /api/world/emotion_history endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_emotion_heatmap_structure(client):
    """Test that emotion_heatmap endpoint returns correct structure."""
    response = client.get("/api/world/emotion_heatmap")
    assert response.status_code == 200
    data = response.json()

    assert "grid" in data
    assert "hotspots" in data
    assert "mood_distribution" in data
    assert "avg_happiness" in data

    # Grid should be a 2D array
    assert isinstance(data["grid"], list)
    assert len(data["grid"]) > 0
    assert isinstance(data["grid"][0], list)


def test_emotion_heatmap_grid_dimensions(client):
    """Test that grid dimensions match world config."""
    state = client.app.state.simulation_state
    expected_width = state.world.config.map_width_tiles
    expected_height = state.world.config.map_height_tiles

    response = client.get("/api/world/emotion_heatmap")
    assert response.status_code == 200
    data = response.json()

    assert len(data["grid"]) == expected_height
    assert len(data["grid"][0]) == expected_width


def test_emotion_heatmap_hotspot_structure(client):
    """Test that hotspots have correct fields."""
    response = client.get("/api/world/emotion_heatmap")
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data["hotspots"], list)
    # Max 5 hotspots
    assert len(data["hotspots"]) <= 5

    for hotspot in data["hotspots"]:
        assert "x" in hotspot
        assert "y" in hotspot
        assert "mood" in hotspot
        assert "avg_emotion" in hotspot
        assert "resident_count" in hotspot
        assert hotspot["resident_count"] >= 3


def test_emotion_heatmap_avg_happiness_range(client):
    """Test that avg_happiness is in valid range (-1 to 1)."""
    response = client.get("/api/world/emotion_heatmap")
    assert response.status_code == 200
    data = response.json()

    avg_happiness = data["avg_happiness"]
    assert -1.0 <= avg_happiness <= 1.0


def test_emotion_heatmap_mood_distribution(client):
    """Test that mood_distribution contains mood counts."""
    response = client.get("/api/world/emotion_heatmap")
    assert response.status_code == 200
    data = response.json()

    assert isinstance(data["mood_distribution"], dict)
    # Should have at least one mood if there are residents
    state = client.app.state.simulation_state
    if state.world.agents:
        assert len(data["mood_distribution"]) > 0
        total = sum(data["mood_distribution"].values())
        assert total == len(state.world.agents)


def test_emotion_history_structure(client):
    """Test that emotion_history endpoint returns correct structure."""
    response = client.get("/api/world/emotion_history")
    assert response.status_code == 200
    data = response.json()

    assert "history" in data
    assert isinstance(data["history"], list)
    assert len(data["history"]) == 20  # Last 20 ticks


def test_emotion_history_entry_structure(client):
    """Test that history entries have correct fields."""
    response = client.get("/api/world/emotion_history")
    assert response.status_code == 200
    data = response.json()

    for entry in data["history"]:
        assert "tick" in entry
        assert "avg_happiness" in entry
        assert isinstance(entry["tick"], int)
        assert isinstance(entry["avg_happiness"], float)


def test_emotion_history_chronological_order(client):
    """Test that history is in chronological order (oldest first)."""
    response = client.get("/api/world/emotion_history")
    assert response.status_code == 200
    data = response.json()

    ticks = [entry["tick"] for entry in data["history"]]
    assert ticks == sorted(ticks)


def test_emotion_grid_values_range(client):
    """Test that grid values are in valid range (-1 to 1)."""
    response = client.get("/api/world/emotion_heatmap")
    assert response.status_code == 200
    data = response.json()

    for row in data["grid"]:
        for value in row:
            assert -1.0 <= value <= 1.0, f"Grid value {value} out of range"
