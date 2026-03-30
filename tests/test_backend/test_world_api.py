"""Tests for /api/world endpoints."""
import asyncio
import copy

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from engine.types import CrimeEvent, ExternalTown, Party, TradeRoute


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_inject_event(client):
    response = client.post(
        "/api/world/events",
        json={"description": "突然下雨了", "source": "user"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "突然下雨了"


def test_inject_event_missing_description(client):
    response = client.post("/api/world/events", json={})
    assert response.status_code == 422


def test_list_buildings(client):
    response = client.get("/api/world/buildings")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_building_upgrade_endpoints_expose_level_and_detail_metadata(client):
    state = client.app.state.simulation_state
    building = state.world.buildings[0]
    original_level = getattr(building, "level", 1)
    original_upgrades = list(getattr(building, "upgrades", []))
    original_decoration = getattr(building, "decoration_score", 0.0)

    try:
        building.level = 2
        building.upgrades = ["expanded"]
        building.decoration_score = 0.72

        upgrades_response = client.get("/api/world/buildings/upgrades")
        assert upgrades_response.status_code == 200
        upgrades = upgrades_response.json()
        row = next(item for item in upgrades if item["id"] == building.id)
        assert row["level"] == 2
        assert row["upgrades"] == ["expanded"]
        assert row["next_level"] == 3
        assert "required_reserve" in row

        details_response = client.get(f"/api/buildings/{building.id}/details")
        assert details_response.status_code == 200
        detail = details_response.json()
        assert detail["id"] == building.id
        assert detail["level"] == 2
        assert detail["decoration_score"] == pytest.approx(0.72)
        assert detail["upgrades"] == ["expanded"]
        assert "special_feature" in detail
        assert "visit_willingness" in detail
    finally:
        building.level = original_level
        building.upgrades = original_upgrades
        building.decoration_score = original_decoration


def test_vote_lifecycle_and_history_applies_world_effect(client):
    state = client.app.state.simulation_state
    original_tick = state.world.current_tick
    original_active_votes = list(getattr(state, "_active_votes", []))
    original_vote_history = list(getattr(state, "_vote_history", []))
    original_buildings = list(state.world.buildings)
    original_random = __import__("random").random

    try:
        state.world.current_tick = 0
        state._active_votes = []
        state._vote_history = []
        for agent in state.world.agents:
            agent.resident.personality = "外向，热心社区建设"
            agent.resident.mood = "happy"

        response = client.post(
            "/api/world/vote",
            json={
                "issue": "社区是否建新公园",
                "options": ["建新公园", "维持现状"],
                "duration_ticks": 2,
            },
        )
        assert response.status_code == 200
        created = response.json()
        assert created["issue"] == "社区是否建新公园"
        assert created["status"] == "active"
        assert created["counts"] == {"建新公园": 0, "维持现状": 0}

        import random

        random.random = lambda: 0.0
        asyncio.run(state._tick())
        asyncio.run(state._tick())

        history_response = client.get("/api/world/votes/history")
        assert history_response.status_code == 200
        history = history_response.json()
        assert history
        latest = history[0]
        assert latest["issue"] == "社区是否建新公园"
        assert latest["status"] == "completed"
        assert latest["winning_option"] == "建新公园"
        assert latest["result_announced"] is True
        assert latest["counts"]["建新公园"] >= latest["counts"]["维持现状"]
        assert any(building.type == "park" and building.name.startswith("社区公园") for building in state.world.buildings)
    finally:
        import random

        random.random = original_random
        state.world.current_tick = original_tick
        state._active_votes = original_active_votes
        state._vote_history = original_vote_history
        state.world.buildings = original_buildings


def test_vote_requires_at_least_two_options(client):
    response = client.post(
        "/api/world/vote",
        json={"issue": "是否举办市集", "options": ["举办"], "duration_ticks": 3},
    )
    assert response.status_code == 422


def test_list_zones(client):
    response = client.get("/api/world/zones")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 4
    assert {item["type"] for item in data} >= {"residential", "commercial", "leisure", "education"}

    residential_zone = next(item for item in data if item["type"] == "residential")
    assert residential_zone["resident_count"] >= 1
    assert residential_zone["building_count"] >= 1
    assert set(residential_zone["atmosphere"]) == {"noise", "safety", "beauty"}


def test_world_education_lists_courses_and_registration_counts(client):
    response = client.get("/api/world/education")

    assert response.status_code == 200
    data = response.json()
    assert {item["subject"] for item in data} >= {"cooking", "farming", "crafting", "social", "art"}
    assert all("registration_count" in item for item in data)


def test_world_pets_lists_owned_and_stray_pets(client):
    response = client.get("/api/world/pets")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data
    assert all("species" in item for item in data)
    assert any(item.get("owner_id") for item in data)


def test_get_weather_returns_current_weather_season_and_forecast(client):
    state = client.app.state.simulation_state
    state.world.weather = __import__("engine.types", fromlist=["WeatherType"]).WeatherType.cloudy
    state.world.season = "autumn"

    response = client.get("/api/world/weather")

    assert response.status_code == 200
    payload = response.json()
    assert payload["weather"] == "cloudy"
    assert payload["season"] == "autumn"
    assert isinstance(payload["forecast"], list)
    assert len(payload["forecast"]) >= 3
    assert set(payload["forecast"]).issubset({"sunny", "cloudy", "rainy", "stormy", "snowy"})


def test_get_world_health_returns_epidemic_stats(client):
    state = client.app.state.simulation_state
    residents = state.world.agents[:2]
    from engine.types import Illness

    residents[0].resident.health.illness = Illness(type="cold", contagious=True, severity=0.35)
    residents[0].resident.health.hp = 0.7
    residents[0].resident.location = "hospital1"
    residents[1].resident.health.illness = Illness(type="flu", contagious=True, severity=0.65)
    residents[1].resident.health.hp = 0.5

    response = client.get("/api/world/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["active_cases"] >= 2
    assert payload["illness_counts"]["cold"] >= 1
    assert payload["illness_counts"]["flu"] >= 1
    assert "treatment_rate" in payload


def test_world_politics_returns_mayor_policies_and_party_distribution(client):
    state = client.app.state.simulation_state
    world = state.world
    original_mayor = copy.deepcopy(getattr(state, "_current_mayor", None))
    original_satisfaction = getattr(state, "_political_satisfaction", 0.5)
    original_low_satisfaction = getattr(state, "_low_satisfaction_ticks", 0)
    original_last_policy_tick = getattr(state, "_last_policy_tick", 0)
    original_votes = copy.deepcopy(getattr(state, "_active_votes", []))
    original_parties = [getattr(agent.resident, "party", Party.neutral) for agent in world.agents]

    try:
        world.agents[0].resident.party = Party.progressive
        world.agents[1].resident.party = Party.progressive
        world.agents[2].resident.party = Party.conservative
        state._current_mayor = {
            "resident_id": world.agents[0].resident.id,
            "term_start": 120,
            "term_end": 620,
            "party": "progressive",
            "policies": [
                {
                    "type": "welfare",
                    "effect": {"mood_delta": 0.15, "reserve_delta": -20.0},
                    "duration": 72,
                    "issued_tick": 200,
                }
            ],
        }
        state._political_satisfaction = 0.58
        state._low_satisfaction_ticks = 0
        state._last_policy_tick = 200
        state._active_votes = []

        response = client.get("/api/world/politics")
        assert response.status_code == 200
        payload = response.json()
        assert payload["mayor"]["resident_id"] == world.agents[0].resident.id
        assert payload["mayor"]["resident_name"] == world.agents[0].resident.name
        assert payload["mayor"]["party"] == "progressive"
        assert payload["active_policies"][0]["type"] == "welfare"
        assert payload["party_distribution"]["progressive"] >= 2
        assert payload["party_distribution"]["conservative"] >= 1
        assert payload["public_satisfaction"] == pytest.approx(0.58)
        assert "election_countdown" in payload
    finally:
        for agent, party in zip(world.agents, original_parties):
            agent.resident.party = party
        state._current_mayor = original_mayor
        state._political_satisfaction = original_satisfaction
        state._low_satisfaction_ticks = original_low_satisfaction
        state._last_policy_tick = original_last_policy_tick
        state._active_votes = original_votes


def test_politics_tick_can_start_election_issue_policy_and_trigger_impeachment(client):
    state = client.app.state.simulation_state
    world = state.world
    original_tick = world.current_tick
    original_probability = world.config.llm_call_probability
    original_votes = copy.deepcopy(getattr(state, "_active_votes", []))
    original_history = copy.deepcopy(getattr(state, "_vote_history", []))
    original_mayor = copy.deepcopy(getattr(state, "_current_mayor", None))
    original_satisfaction = getattr(state, "_political_satisfaction", 0.5)
    original_low_satisfaction = getattr(state, "_low_satisfaction_ticks", 0)
    original_last_policy_tick = getattr(state, "_last_policy_tick", 0)
    original_output = world.economic_output

    try:
        world.config.llm_call_probability = 0.0
        state._active_votes = []
        state._vote_history = []
        state._current_mayor = {
            "resident_id": world.agents[0].resident.id,
            "term_start": 0,
            "term_end": 500,
            "party": "progressive",
            "policies": [],
        }
        state._last_policy_tick = 0
        state._political_satisfaction = 0.62
        state._low_satisfaction_ticks = 0

        world.current_tick = 499
        asyncio.run(state._tick())
        assert any("镇长选举" in vote["issue"] for vote in state._active_votes)

        state._active_votes = []
        state._current_mayor = {
            "resident_id": world.agents[1].resident.id,
            "term_start": 200,
            "term_end": 900,
            "party": "conservative",
            "policies": [],
        }
        state._last_policy_tick = 400
        state._political_satisfaction = 0.61
        world.economic_output = 10.0

        world.current_tick = 599
        asyncio.run(state._tick())
        assert state._current_mayor is not None
        assert state._current_mayor["policies"]
        assert state._last_policy_tick >= 600

        state._active_votes = []
        state._current_mayor = {
            "resident_id": world.agents[2].resident.id,
            "term_start": 100,
            "term_end": 900,
            "party": "neutral",
            "policies": [],
        }
        state._political_satisfaction = 0.2
        state._low_satisfaction_ticks = 119

        world.current_tick = 719
        asyncio.run(state._tick())
        assert any("弹劾" in vote["issue"] for vote in state._active_votes)
    finally:
        world.current_tick = original_tick
        world.config.llm_call_probability = original_probability
        state._active_votes = original_votes
        state._vote_history = original_history
        state._current_mayor = original_mayor
        state._political_satisfaction = original_satisfaction
        state._low_satisfaction_ticks = original_low_satisfaction
        state._last_policy_tick = original_last_policy_tick
        world.economic_output = original_output


def test_transport_endpoint_returns_road_network_and_stats(client):
    response = client.get("/api/world/transport")

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["roads"], list)
    assert payload["roads"]
    assert "stats" in payload
    assert "mode_share" in payload["stats"]
    assert "congestion_hotspots" in payload["stats"]


def test_demographics_endpoint_returns_age_distribution_and_timeline(client):
    state = client.app.state.simulation_state
    original_history = list(getattr(state.world, "generational_history", []))
    original_ages = [
        (agent.resident.age_days, getattr(agent.resident, "age_stage", "child"), getattr(agent.resident, "retirement_tick", None))
        for agent in state.world.agents
    ]

    try:
        for agent in state.world.agents:
            agent.resident.age_days = 360
            agent.resident.age_stage = "adult"
            agent.resident.retirement_tick = None

        state.world.agents[0].resident.age_days = 80
        state.world.agents[0].resident.age_stage = "child"
        state.world.agents[1].resident.age_days = 340
        state.world.agents[1].resident.age_stage = "adult"
        state.world.agents[2].resident.age_days = 860
        state.world.agents[2].resident.age_stage = "elder"
        state.world.agents[2].resident.retirement_tick = 222
        state.world.generational_history = [
            {"tick": 128, "type": "birth", "resident_name": "新芽", "summary": "新芽出生"},
            {"tick": 222, "type": "retirement", "resident_name": "大强", "summary": "大强退休"},
        ]

        response = client.get("/api/world/demographics")

        assert response.status_code == 200
        payload = response.json()
        assert payload["age_distribution"]["child"] >= 1
        assert payload["age_distribution"]["adult"] >= 1
        assert payload["age_distribution"]["elder"] >= 1
        assert payload["retired_count"] >= 1
        assert payload["aging_index"] >= 0
        assert payload["generational_timeline"][0]["type"] == "retirement"
    finally:
        for agent, (age_days, age_stage, retirement_tick) in zip(state.world.agents, original_ages):
            agent.resident.age_days = age_days
            agent.resident.age_stage = age_stage
            agent.resident.retirement_tick = retirement_tick
        state.world.generational_history = original_history


def test_list_families(client):
    response = client.get("/api/world/families")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 3
    assert all("family_name" in item for item in data)
    assert all("members" in item for item in data)


def test_list_festivals_exposes_current_and_history(client):
    state = client.app.state.simulation_state
    original_active = list(getattr(state, "_active_festivals", []))
    original_history = list(getattr(state, "_festival_history", []))

    try:
        state._active_festivals = [
            {
                "name": "春日祭",
                "type": "spring",
                "start_tick": 0,
                "duration": 12,
                "location": "plaza",
                "participants": ["a1", "a2"],
                "status": "active",
                "end_tick": 12,
            }
        ]
        state._festival_history = [
            {
                "name": "冬日篝火",
                "type": "winter",
                "start_tick": 100,
                "duration": 8,
                "location": "square",
                "participants": ["a1", "a2", "a3"],
                "status": "completed",
                "end_tick": 108,
                "memorial": "冬日篝火落幕，居民把余温写进了夜晚的记忆里。",
            }
        ]

        response = client.get("/api/world/festivals")
        assert response.status_code == 200
        payload = response.json()
        assert payload["current"][0]["name"] == "春日祭"
        assert payload["current"][0]["status"] == "active"
        assert payload["history"][0]["name"] == "冬日篝火"
        assert payload["history"][0]["memorial"].startswith("冬日篝火落幕")
    finally:
        state._active_festivals = original_active
        state._festival_history = original_history


def test_world_bulletin_returns_posts_and_hot_topics(client):
    state = client.app.state.simulation_state
    original_posts = list(getattr(state, "_bulletin_posts", []))
    original_topics = list(getattr(state, "_bulletin_hot_topics", []))

    try:
        state._bulletin_posts = [
            {
                "id": "post-1",
                "author_id": "a1",
                "author_name": "小明",
                "content": "春日祭太棒了，今晚广场全是笑声。",
                "tick": 96,
                "likes": ["a2", "a3"],
                "category": "festival",
                "topic": "spring_festival",
                "subject_id": "a1",
                "tone": "positive",
            }
        ]
        state._bulletin_hot_topics = [
            {
                "topic": "spring_festival",
                "label": "春日祭",
                "category": "festival",
                "post_count": 3,
                "heat": 1.0,
                "sentiment": "positive",
            }
        ]

        response = client.get("/api/world/bulletin")
        assert response.status_code == 200
        payload = response.json()
        assert payload["posts"][0]["author_name"] == "小明"
        assert payload["posts"][0]["likes"] == ["a2", "a3"]
        assert payload["posts"][0]["topic"] == "spring_festival"
        assert payload["hot_topics"][0]["label"] == "春日祭"
        assert payload["hot_topics"][0]["heat"] == 1.0
    finally:
        state._bulletin_posts = original_posts
        state._bulletin_hot_topics = original_topics


def test_world_diplomacy_returns_towns_routes_and_balance(client):
    state = client.app.state.simulation_state
    original_towns = list(getattr(state.world, "external_towns", []))
    original_routes = list(getattr(state.world, "trade_routes", []))
    original_ledger = list(getattr(state, "_diplomacy_ledger", []))

    try:
        state.world.external_towns = [
            ExternalTown(
                name="海雾港",
                relation_score=0.62,
                trade_balance=41.5,
                ambassador_id=state.world.agents[0].resident.id,
                specialties=["海盐", "珍珠"],
            )
        ]
        state.world.trade_routes = [
            TradeRoute(
                from_town="Populace",
                to_town="海雾港",
                goods=["coffee", "silk"],
                profit_per_tick=13.5,
                merchant_id=state.world.agents[1].resident.id,
                rare_goods=["珍珠"],
            )
        ]
        state._diplomacy_ledger = [
            {
                "tick": 24,
                "type": "profit",
                "town_name": "海雾港",
                "route_id": "Populace->海雾港",
                "amount": 16.2,
                "description": "海雾港 本轮送来了高利润海盐订单。",
            }
        ]

        response = client.get("/api/world/diplomacy")
        assert response.status_code == 200
        payload = response.json()
        assert payload["towns"][0]["name"] == "海雾港"
        assert payload["towns"][0]["relation_status"] == "friendly"
        assert payload["trade_routes"][0]["to_town"] == "海雾港"
        assert payload["trade_routes"][0]["goods"] == ["coffee", "silk"]
        assert payload["summary"]["active_routes"] == 1
        assert payload["summary"]["total_profit"] == pytest.approx(16.2)
        assert payload["ledger"][0]["town_name"] == "海雾港"
    finally:
        state.world.external_towns = original_towns
        state.world.trade_routes = original_routes
        state._diplomacy_ledger = original_ledger


def test_family_dinner_event_triggers_every_50_ticks(client):
    import asyncio

    state = client.app.state.simulation_state
    original_tick = state.world.current_tick
    original_probability = state.world.config.llm_call_probability

    try:
        state.world.current_tick = 49
        state.world.config.llm_call_probability = 0.0
        tick_state = asyncio.run(state._tick())
        assert any("家庭聚餐" in event.description for event in tick_state.events)
    finally:
        state.world.current_tick = original_tick
        state.world.config.llm_call_probability = original_probability


def test_spring_festival_start_switches_goals_and_emits_update(client):
    state = client.app.state.simulation_state
    original_tick = state.world.current_tick
    original_probability = state.world.config.llm_call_probability
    original_active = list(getattr(state, "_active_festivals", []))
    original_history = list(getattr(state, "_festival_history", []))

    try:
        state.world.current_tick = 0
        state.world.season = "spring"
        state.world.config.llm_call_probability = 0.0
        state._active_festivals = []
        state._festival_history = []

        tick_state = asyncio.run(state._tick())

        assert tick_state.festival_updates
        assert tick_state.festival_updates[0].status == "started"
        assert tick_state.festival_updates[0].festival.name == "春日祭"
        assert any("春日祭" in event.description for event in tick_state.events)
        assert any(agent.resident.current_goal == "参加春日祭" for agent in state.world.agents)
    finally:
        state.world.current_tick = original_tick
        state.world.config.llm_call_probability = original_probability
        state._active_festivals = original_active
        state._festival_history = original_history


def test_achievement_leaderboard_returns_sorted_rows(client):
    state = client.app.state.simulation_state
    residents = client.get("/api/residents").json()
    resident_a = residents[0]["id"]
    resident_b = residents[1]["id"]

    original_store = {key: set(value) for key, value in getattr(state, "_achievements_store", {}).items()}
    original_meta = dict(getattr(state, "_achievement_unlock_meta", {}))
    try:
        state._achievements_store = {
            resident_a: {"social_star", "mood_master", "shopping_maniac"},
            resident_b: {"social_star"},
        }
        state._achievement_unlock_meta = {
            (resident_a, "social_star"): 5,
            (resident_a, "mood_master"): 9,
            (resident_a, "shopping_maniac"): 12,
            (resident_b, "social_star"): 7,
        }

        response = client.get("/api/world/achievements/leaderboard")
        assert response.status_code == 200
        payload = response.json()
        assert payload[0]["resident_id"] == resident_a
        assert payload[0]["unlocked_count"] == 3
        assert payload[1]["resident_id"] == resident_b
        assert len(payload[0]["achievements"]) == 3
    finally:
        state._achievements_store = original_store
        state._achievement_unlock_meta = original_meta


def test_list_crimes_returns_logged_events(client):
    state = client.app.state.simulation_state
    original_log = list(getattr(state.world, "crime_log", []))

    try:
        state.world.crime_log = [
            CrimeEvent(
                type="theft",
                perpetrator="a1",
                victim="a2",
                location="商业区",
                tick=12,
                resolved=False,
            )
        ]
        response = client.get("/api/world/crimes")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 1
        assert payload[0]["type"] == "theft"
        assert payload[0]["perpetrator"] == "a1"
        assert payload[0]["victim"] == "a2"
        assert payload[0]["location"] == "商业区"
    finally:
        state.world.crime_log = original_log


def test_safety_stats_reports_index_and_hotspots(client):
    state = client.app.state.simulation_state
    world = state.world
    original_log = list(getattr(world, "crime_log", []))
    original_flagged = set(getattr(world, "flagged_residents", set()))
    original_safety = [agent.resident.safety_feeling for agent in world.agents]

    try:
        world.crime_log = [
            CrimeEvent(type="theft", perpetrator="a1", victim="a2", location="商业区", tick=10, resolved=False),
            CrimeEvent(type="conflict", perpetrator="a3", victim="a2", location="商业区", tick=11, resolved=True),
            CrimeEvent(type="vandalism", perpetrator="a1", victim=None, location="住宅区", tick=12, resolved=False),
        ]
        world.flagged_residents = {"a1", "a3"}
        for index, agent in enumerate(world.agents):
            agent.resident.safety_feeling = 0.9 - index * 0.1

        response = client.get("/api/world/safety")
        assert response.status_code == 200
        payload = response.json()
        assert payload["total_crimes"] == 3
        assert payload["unresolved_crimes"] == 2
        assert payload["crimes_by_type"] == {"theft": 1, "conflict": 1, "vandalism": 1}
        assert payload["flagged_residents"] == ["a1", "a3"]
        assert payload["hotspots"][0]["location"] == "商业区"
        assert payload["hotspots"][0]["count"] == 2
        assert 0 <= payload["safety_index"] <= 1
    finally:
        world.crime_log = original_log
        world.flagged_residents = original_flagged
        for agent, safety in zip(world.agents, original_safety):
            agent.resident.safety_feeling = safety


def test_reputation_rankings_returns_sorted_residents(client):
    state = client.app.state.simulation_state
    world = state.world
    original_values = [agent.resident.reputation for agent in world.agents]

    try:
        for index, agent in enumerate(world.agents[:3]):
            agent.resident.reputation = [0.92, 0.4, -0.3][index]
        response = client.get("/api/world/reputation/rankings")
        assert response.status_code == 200
        payload = response.json()
        assert payload[0]["reputation"] >= payload[1]["reputation"]
        assert payload[0]["title"] == "镇上名人"
        assert "recent_events" in payload[0]
    finally:
        for agent, reputation in zip(world.agents, original_values):
            agent.resident.reputation = reputation
