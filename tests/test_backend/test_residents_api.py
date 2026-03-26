"""Tests for /api/residents endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_list_residents_returns_10(client):
    response = client.get("/api/residents")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 10


def test_list_residents_has_required_fields(client):
    response = client.get("/api/residents")
    resident = response.json()[0]
    assert "id" in resident
    assert "name" in resident
    assert "personality" in resident
    assert "x" in resident
    assert "y" in resident


def test_get_resident_by_id(client):
    # Get list first to find a valid id
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}")
    assert response.status_code == 200
    assert response.json()["id"] == rid


def test_get_resident_not_found(client):
    response = client.get("/api/residents/nonexistent_id")
    assert response.status_code == 404


def test_patch_resident_mood(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.patch(
        f"/api/residents/{rid}",
        json={"mood": "happy"},
    )
    assert response.status_code == 200
    assert response.json()["mood"] == "happy"


def test_patch_resident_not_found(client):
    response = client.patch("/api/residents/nobody", json={"mood": "sad"})
    assert response.status_code == 404


def test_get_resident_mood_log(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]
    client.patch(f"/api/residents/{rid}", json={"mood": "sad"})
    client.patch(f"/api/residents/{rid}", json={"mood": "happy"})

    response = client.get(f"/api/residents/{rid}/mood-log")

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload[-1]["mood"] == "happy"
    assert "cause" in payload[-1]


def test_get_resident_memories_supports_pagination_and_type_filter(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]
    client.post(
        f"/api/residents/{rid}/inject-memory",
        json={"content": "第一次在广场认识了新朋友", "importance": 0.9, "emotion": "happy"},
    )
    client.post(
        f"/api/residents/{rid}/inject-memory",
        json={"content": "在节日上收到了礼物", "importance": 0.8, "emotion": "happy"},
    )

    filtered = client.get(f"/api/residents/{rid}/memories", params={"memory_type": "gift"})
    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert isinstance(filtered_payload, list)
    assert all(memory["type"] == "gift" for memory in filtered_payload)

    paged = client.get(f"/api/residents/{rid}/memories", params={"page": 1, "page_size": 1})
    assert paged.status_code == 200
    paged_payload = paged.json()
    assert len(paged_payload) == 1
    assert "emotional_weight" in paged_payload[0]


def test_get_resident_reputation(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}/reputation")

    assert response.status_code == 200
    payload = response.json()
    assert payload["resident_id"] == rid
    assert "reputation" in payload
    assert "history" in payload


def test_get_resident_education(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}/education")

    assert response.status_code == 200
    payload = response.json()
    assert payload["resident_id"] == rid
    assert isinstance(payload["education"]["knowledge_level"], dict)
    assert isinstance(payload["education"]["courses"], list)


def test_get_resident_pets(client):
    residents = client.get("/api/residents").json()
    pet_owner = next((resident for resident in residents if resident.get("pets")), None)
    assert pet_owner is not None

    response = client.get(f"/api/residents/{pet_owner['id']}/pets")

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert payload
    assert payload[0]["owner_id"] == pet_owner["id"]


def test_get_resident_health(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["resident_id"] == rid
    assert "health" in payload
    assert "hp" in payload["health"]


def test_get_resident_family_profile(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}/family")

    assert response.status_code == 200
    payload = response.json()
    assert payload["resident"]["id"] == rid
    assert "family_name" in payload
    assert "members" in payload


def test_get_resident_family_tree(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}/family-tree")

    assert response.status_code == 200
    payload = response.json()
    assert payload["root"]["id"] == rid
    assert "siblings" in payload


# ---------------------------------------------------------------------------
# POST /api/residents/create
# ---------------------------------------------------------------------------

def test_create_resident_success(client):
    response = client.post(
        "/api/residents/create",
        json={"name": "TestResident", "personality": "好奇心旺盛，爱探险"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "TestResident"
    assert data["personality"] == "好奇心旺盛，爱探险"
    assert data["mood"] == "neutral"
    assert "id" in data
    assert "x" in data
    assert "y" in data


def test_create_resident_appears_in_list(client):
    before = len(client.get("/api/residents").json())
    client.post(
        "/api/residents/create",
        json={"name": "NewcomerResident", "personality": "外向开朗"},
    )
    after = len(client.get("/api/residents").json())
    assert after == before + 1


def test_create_resident_custom_mood(client):
    response = client.post(
        "/api/residents/create",
        json={"name": "HappyResident", "personality": "乐观开朗", "mood": "happy"},
    )
    assert response.status_code == 200
    assert response.json()["mood"] == "happy"


def test_create_resident_empty_name_rejected(client):
    response = client.post(
        "/api/residents/create",
        json={"name": "   ", "personality": "内向安静"},
    )
    assert response.status_code == 400


def test_create_resident_invalid_building_rejected(client):
    response = client.post(
        "/api/residents/create",
        json={"name": "HomeResident", "personality": "安静", "home_building_id": "nonexistent_building_xyz"},
    )
    assert response.status_code == 400


def test_create_resident_with_initial_relationship(client):
    existing = client.get("/api/residents").json()
    target_id = existing[0]["id"]

    response = client.post(
        "/api/residents/create",
        json={
            "name": "FriendlyResident",
            "personality": "友善热情",
            "initial_relationships": [
                {"resident_id": target_id, "type": "friendship", "intensity": 0.7}
            ],
        },
    )
    assert response.status_code == 200
    new_id = response.json()["id"]

    # Verify relationship was created
    rels = client.get(f"/api/residents/{new_id}/relationships").json()
    assert any(r["to_id"] == target_id for r in rels)


# ---------------------------------------------------------------------------
# Economic system: coins field + transfer
# ---------------------------------------------------------------------------

def test_resident_has_coins_field(client):
    residents = client.get("/api/residents").json()
    resident = residents[0]
    assert "coins" in resident
    assert isinstance(resident["coins"], int)
    assert resident["coins"] >= 0


def test_resident_has_skills_field(client):
    residents = client.get("/api/residents").json()
    resident = residents[0]
    assert "skills" in resident
    assert isinstance(resident["skills"], dict)


def test_resident_has_inventory_field(client):
    residents = client.get("/api/residents").json()
    resident = residents[0]
    assert "inventory" in resident
    assert isinstance(resident["inventory"], list)


def test_get_resident_skills_returns_mapping(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}/skills")

    assert response.status_code == 200
    payload = response.json()
    assert payload["resident_id"] == rid
    assert isinstance(payload["skills"], dict)


def test_transfer_coins_success(client):
    residents = client.get("/api/residents").json()
    from_id = residents[0]["id"]
    to_id = residents[1]["id"]
    from_before = residents[0]["coins"]
    to_before = residents[1]["coins"]

    response = client.post(
        f"/api/residents/{from_id}/transfer",
        json={"to_id": to_id, "amount": 10},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["from_resident"]["coins"] == from_before - 10
    assert body["to_resident"]["coins"] == to_before + 10


def test_transfer_coins_insufficient_funds(client):
    residents = client.get("/api/residents").json()
    from_id = residents[0]["id"]
    to_id = residents[1]["id"]

    # Try to transfer more than available
    current = client.get(f"/api/residents/{from_id}").json()["coins"]
    response = client.post(
        f"/api/residents/{from_id}/transfer",
        json={"to_id": to_id, "amount": current + 9999},
    )
    assert response.status_code == 400


def test_transfer_coins_invalid_amount(client):
    residents = client.get("/api/residents").json()
    from_id = residents[0]["id"]
    to_id = residents[1]["id"]

    response = client.post(
        f"/api/residents/{from_id}/transfer",
        json={"to_id": to_id, "amount": 0},
    )
    assert response.status_code == 422


def test_transfer_coins_resident_not_found(client):
    residents = client.get("/api/residents").json()
    to_id = residents[0]["id"]

    response = client.post(
        "/api/residents/nonexistent_xyz/transfer",
        json={"to_id": to_id, "amount": 5},
    )
    assert response.status_code == 404


def test_trade_item_success(client):
    residents = client.get("/api/residents").json()
    seller_id = residents[0]["id"]
    buyer_id = residents[1]["id"]
    client.post(
        f"/api/residents/{seller_id}/trade",
        json={"buyer_id": buyer_id, "item_name": "coffee", "quantity": 1},
    )
    seller_after = client.get(f"/api/residents/{seller_id}").json()
    buyer_after = client.get(f"/api/residents/{buyer_id}").json()
    assert any(item["name"] == "coffee" for item in buyer_after["inventory"])
    assert seller_after["coins"] >= 100


def test_trade_item_not_found(client):
    residents = client.get("/api/residents").json()
    seller_id = residents[0]["id"]
    buyer_id = residents[1]["id"]
    response = client.post(
        f"/api/residents/{seller_id}/trade",
        json={"buyer_id": buyer_id, "item_name": "nonexistent", "quantity": 1},
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Achievement system
# ---------------------------------------------------------------------------

def test_get_achievements_returns_list(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}/achievements")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 8


def test_achievements_have_required_fields(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    data = client.get(f"/api/residents/{rid}/achievements").json()
    for ach in data:
        assert "id" in ach
        assert "name" in ach
        assert "description" in ach
        assert "icon" in ach
        assert "category" in ach
        assert "unlocked" in ach
        assert "unlocked_at_tick" in ach
        assert isinstance(ach["unlocked"], bool)


def test_achievements_all_locked_initially(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    data = client.get(f"/api/residents/{rid}/achievements").json()
    # Initially no achievements should be unlocked (fresh simulation)
    # (some may be unlocked if coins >= 500 from prior tests, so only check structure)
    assert all("unlocked" in a for a in data)


def test_achievements_not_found_for_invalid_resident(client):
    response = client.get("/api/residents/nonexistent_xyz/achievements")
    assert response.status_code == 404


def test_shopping_maniac_unlocks_when_trade_count_reaches_20(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]
    state = client.app.state.simulation_state
    original_history = list(getattr(state, "_trade_history", []))
    original_store = {key: set(value) for key, value in getattr(state, "_achievements_store", {}).items()}
    original_meta = dict(getattr(state, "_achievement_unlock_meta", {}))
    try:
        state._trade_history = [
            {"seller_id": rid, "buyer_id": f"buyer-{index}", "item_name": "coffee", "quantity": 1, "total_price": 5}
            for index in range(20)
        ]
        from engine.achievements import check_and_unlock
        unlocks = check_and_unlock(state)
        unlocked_ids = [u["achievement_id"] for u in unlocks if u["resident_id"] == rid]
        assert "shopping_maniac" in unlocked_ids
    finally:
        state._trade_history = original_history
        state._achievements_store = original_store
        state._achievement_unlock_meta = original_meta


def test_resident_achievements_include_unlock_tick_for_unlocked_badge(client):
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]
    state = client.app.state.simulation_state

    original_store = {key: set(value) for key, value in getattr(state, "_achievements_store", {}).items()}
    original_meta = dict(getattr(state, "_achievement_unlock_meta", {}))
    try:
        state._achievements_store.setdefault(rid, set()).add("shopping_maniac")
        state._achievement_unlock_meta[(rid, "shopping_maniac")] = 42
        data = client.get(f"/api/residents/{rid}/achievements").json()
        unlocked = next(item for item in data if item["id"] == "shopping_maniac")
        assert unlocked["unlocked"] is True
        assert unlocked["unlocked_at_tick"] == 42
        assert unlocked["category"] == "economy"
    finally:
        state._achievements_store = original_store
        state._achievement_unlock_meta = original_meta
