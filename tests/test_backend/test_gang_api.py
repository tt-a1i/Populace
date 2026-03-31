"""Tests for /api/world/gangs endpoint."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_get_gangs_returns_structure(client):
    """GET /api/world/gangs should return proper structure."""
    response = client.get("/api/world/gangs")
    assert response.status_code == 200
    
    data = response.json()
    assert "gangs" in data
    assert "recent_events" in data
    assert isinstance(data["gangs"], list)
    assert isinstance(data["recent_events"], list)


def test_get_gangs_with_initialized_gangs(client):
    """GET /api/world/gangs should return gangs after initialization."""
    state = client.app.state.simulation_state
    world = state.world
    
    # Initialize gangs
    world.initialize_gangs()
    
    response = client.get("/api/world/gangs")
    assert response.status_code == 200
    
    data = response.json()
    assert len(data["gangs"]) >= 2
    
    for gang in data["gangs"]:
        assert "name" in gang
        assert "leader_id" in gang
        assert "leader_name" in gang
        assert "member_count" in gang
        assert "territory" in gang
        assert "influence" in gang
        assert "activity" in gang
        assert "color" in gang
        assert "created_tick" in gang
        assert "last_action_tick" in gang


def test_get_gangs_gang_schema_validation(client):
    """Each gang in the response should have required fields."""
    state = client.app.state.simulation_state
    world = state.world
    
    world.initialize_gangs()
    
    response = client.get("/api/world/gangs")
    assert response.status_code == 200
    
    data = response.json()
    
    for gang in data["gangs"]:
        # Validate field types
        assert isinstance(gang["name"], str)
        assert isinstance(gang["leader_id"], str)
        assert isinstance(gang["leader_name"], str)
        assert isinstance(gang["member_count"], int)
        assert isinstance(gang["territory"], str)
        assert isinstance(gang["influence"], (int, float))
        assert 0 <= gang["influence"] <= 1
        assert isinstance(gang["activity"], str)
        assert isinstance(gang["color"], str)
        assert gang["color"].startswith("#")
        assert isinstance(gang["created_tick"], int)
        assert isinstance(gang["last_action_tick"], int)


def test_get_gangs_recent_events_schema(client):
    """Recent events should have proper structure."""
    state = client.app.state.simulation_state
    world = state.world
    
    world.initialize_gangs()
    
    # Trigger some gang actions
    world.current_tick = 10
    world.gang_conflicts_and_expansion()
    
    response = client.get("/api/world/gangs")
    assert response.status_code == 200
    
    data = response.json()
    
    for event in data["recent_events"]:
        assert "tick" in event
        assert "type" in event
        assert "gang_name" in event
        assert "gang_color" in event
        assert "description" in event


def test_get_gangs_empty_when_not_initialized(client):
    """GET /api/world/gangs should return empty list if gangs not initialized."""
    state = client.app.state.simulation_state
    world = state.world
    
    # Ensure gangs are not initialized
    world.gangs = []
    world.gang_event_log = []
    
    response = client.get("/api/world/gangs")
    assert response.status_code == 200
    
    data = response.json()
    assert data["gangs"] == []
    assert data["recent_events"] == []


def test_get_gangs_member_count_accuracy(client):
    """Member count should accurately reflect gang membership."""
    state = client.app.state.simulation_state
    world = state.world
    
    world.initialize_gangs()
    
    # Manually add members
    if world.gangs:
        test_member_id = "test_member_1"
        world.gangs[0].member_ids.append(test_member_id)
        
        response = client.get("/api/world/gangs")
        assert response.status_code == 200
        
        data = response.json()
        first_gang = data["gangs"][0]
        assert first_gang["member_count"] >= 1


def test_get_gangs_influence_bounds(client):
    """Gang influence should always be between 0 and 1."""
    state = client.app.state.simulation_state
    world = state.world
    
    world.initialize_gangs()
    
    # Run many conflict/expansion cycles
    world.current_tick = 100
    for _ in range(50):
        world.gang_conflicts_and_expansion()
    
    response = client.get("/api/world/gangs")
    assert response.status_code == 200
    
    data = response.json()
    for gang in data["gangs"]:
        assert 0 <= gang["influence"] <= 1
