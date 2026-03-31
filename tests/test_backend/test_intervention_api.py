"""Tests for /api/world/intervene and /api/world/intervention_log endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_intervene_bless_resident(client):
    """Test blessing a resident increases happiness."""
    state = client.app.state.simulation_state
    if not state.world.agents:
        pytest.skip("No agents available")

    resident = state.world.agents[0].resident
    original_mood = resident.mood

    response = client.post(
        "/api/world/intervene",
        json={"action": "bless_resident", "target_id": resident.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["action"] == "bless_resident"
    assert data["target_id"] == resident.id
    assert "祝福" in data["effect_description"] or "bless" in data["message"].lower()


def test_intervene_curse_resident(client):
    """Test cursing a resident decreases happiness."""
    state = client.app.state.simulation_state
    if not state.world.agents:
        pytest.skip("No agents available")

    resident = state.world.agents[0].resident

    response = client.post(
        "/api/world/intervene",
        json={"action": "curse_resident", "target_id": resident.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["action"] == "curse_resident"
    assert data["target_id"] == resident.id
    assert "诅咒" in data["effect_description"] or "curse" in data["message"].lower()


def test_intervene_give_money(client):
    """Test giving money to a resident."""
    state = client.app.state.simulation_state
    if not state.world.agents:
        pytest.skip("No agents available")

    resident = state.world.agents[0].resident
    original_wallet = resident.wallet

    response = client.post(
        "/api/world/intervene",
        json={"action": "give_money", "target_id": resident.id, "value": 50},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["action"] == "give_money"
    assert data["target_id"] == resident.id
    assert resident.wallet > original_wallet


def test_intervene_give_money_default_amount(client):
    """Test giving money with default amount (50)."""
    state = client.app.state.simulation_state
    if not state.world.agents:
        pytest.skip("No agents available")

    resident = state.world.agents[0].resident
    original_wallet = resident.wallet

    response = client.post(
        "/api/world/intervene",
        json={"action": "give_money", "target_id": resident.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # Default amount is 50
    assert resident.wallet == original_wallet + 50.0


def test_intervene_trigger_festival(client):
    """Test triggering a festival."""
    response = client.post(
        "/api/world/intervene",
        json={"action": "trigger_festival"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["action"] == "trigger_festival"
    assert "节庆" in data["effect_description"] or "festival" in data["message"].lower()

    # Festival effect should be active
    state = client.app.state.simulation_state
    assert state.world.active_festival_effect is not None
    assert state.world.active_festival_effect.duration == 10


def test_intervene_trigger_disaster(client):
    """Test triggering a disaster."""
    response = client.post(
        "/api/world/intervene",
        json={"action": "trigger_disaster"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["action"] == "trigger_disaster"
    assert "灾难" in data["effect_description"] or "disaster" in data["message"].lower()

    # Disaster effect should be active
    state = client.app.state.simulation_state
    assert state.world.active_disaster_effect is not None
    assert state.world.active_disaster_effect.duration == 5


def test_intervene_inspire_resident(client):
    """Test inspiring a resident's life goal."""
    state = client.app.state.simulation_state
    if not state.world.agents:
        pytest.skip("No agents available")

    resident = state.world.agents[0].resident
    original_progress = resident.life_goal.progress if resident.life_goal else 0.0

    response = client.post(
        "/api/world/intervene",
        json={"action": "inspire_resident", "target_id": resident.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["action"] == "inspire_resident"
    assert data["target_id"] == resident.id
    assert "激励" in data["effect_description"] or "inspire" in data["message"].lower() or "进度" in data["effect_description"]


def test_intervene_invalid_action(client):
    """Test invalid intervention action."""
    response = client.post(
        "/api/world/intervene",
        json={"action": "invalid_action", "target_id": "r1"},
    )
    assert response.status_code == 400
    data = response.json()
    # Error response may be a string or dict
    detail = data.get("detail", data) if isinstance(data, dict) else data
    assert isinstance(detail, (str, dict))
    detail_str = str(detail).lower()
    assert "invalid" in detail_str


def test_intervene_missing_target_for_resident_action(client):
    """Test resident-targeted action without target_id."""
    response = client.post(
        "/api/world/intervene",
        json={"action": "bless_resident"},
    )
    assert response.status_code == 400
    data = response.json()
    # Error response may be a string or dict
    detail = data.get("detail", data) if isinstance(data, dict) else data
    assert isinstance(detail, (str, dict))
    detail_str = str(detail).lower()
    assert "target" in detail_str


def test_intervene_nonexistent_resident(client):
    """Test intervention on non-existent resident."""
    response = client.post(
        "/api/world/intervene",
        json={"action": "bless_resident", "target_id": "nonexistent_resident_id"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "不存在" in data["effect_description"] or "not found" in data["message"].lower()


def test_intervention_log(client):
    """Test retrieving intervention log."""
    state = client.app.state.simulation_state
    if not state.world.agents:
        pytest.skip("No agents available")

    resident = state.world.agents[0].resident

    # Perform an intervention
    client.post(
        "/api/world/intervene",
        json={"action": "bless_resident", "target_id": resident.id},
    )

    # Get intervention log
    response = client.get("/api/world/intervention_log")
    assert response.status_code == 200
    data = response.json()
    assert "interventions" in data
    assert isinstance(data["interventions"], list)
    assert len(data["interventions"]) >= 1

    # Check log entry structure
    last_entry = data["interventions"][-1]
    assert "id" in last_entry
    assert "tick" in last_entry
    assert "action" in last_entry
    assert "target_id" in last_entry
    assert "target_name" in last_entry
    assert "effect_description" in last_entry
    assert "timestamp" in last_entry


def test_intervention_log_returns_last_20(client):
    """Test that intervention log returns at most 20 entries."""
    state = client.app.state.simulation_state
    if len(state.world.agents) < 1:
        pytest.skip("Not enough agents available")

    resident = state.world.agents[0].resident

    # Perform 25 interventions
    for _ in range(25):
        client.post(
            "/api/world/intervene",
            json={"action": "bless_resident", "target_id": resident.id},
        )

    response = client.get("/api/world/intervention_log")
    assert response.status_code == 200
    data = response.json()
    # Should return at most 20 entries
    assert len(data["interventions"]) <= 20
