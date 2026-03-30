"""Tests for World state management."""
import uuid
from types import SimpleNamespace

import pytest

from engine.types import Building, Memory, MovementUpdate, Pet, Religion, RelationType, Relationship, TickState, WorldConfig
from engine.world import World

from tests.conftest import make_agent


def test_world_tick_increments_counter(mock_world):
    assert mock_world.current_tick == 0
    state = mock_world.tick()
    assert mock_world.current_tick == 1
    assert isinstance(state, TickState)
    assert state.tick == 1


def test_world_tick_returns_movements_for_map_agents(mock_world):
    """Agents on the map (location=None) appear in movements."""
    for a in mock_world.agents:
        a.resident.location = None
        mock_world._ensure_resident_job(a.resident)
        a.resident.job.title = "tester"
        a.resident.occupation = "tester"
    state = mock_world.tick()
    assert len(state.movements) == 3
    ids = {m.id for m in state.movements}
    assert "a1" in ids and "a2" in ids and "a3" in ids


def test_world_tick_excludes_building_agents(mock_world):
    """Agents inside buildings are excluded from movements."""
    mock_world.agents[0].resident.location = "cafe1"
    state = mock_world.tick()
    ids = {m.id for m in state.movements}
    assert "a1" not in ids


def test_add_agent(mock_world):
    initial = len(mock_world.agents)
    new_agent = make_agent("new1", "新来的", x=7, y=7)
    mock_world.add_agent(new_agent)
    assert len(mock_world.agents) == initial + 1
    # MemoryStream config should be synced
    assert new_agent.memory_stream._config is mock_world.config


def test_remove_agent(mock_world):
    initial = len(mock_world.agents)
    mock_world.remove_agent("a1")
    assert len(mock_world.agents) == initial - 1
    assert all(a.resident.id != "a1" for a in mock_world.agents)


def test_get_nearby_agents(mock_world):
    # a1 at (5,5), a2 at (6,5) → distance 1 ≤ radius 2
    nearby = mock_world.get_nearby_agents(5, 5)
    ids = {a.resident.id for a in nearby}
    assert "a2" in ids
    assert "a1" in ids       # same-tile agents are included (caller filters self)
    assert "a3" not in ids   # at (15,15), too far


def test_get_nearby_agents_custom_radius(mock_world):
    nearby = mock_world.get_nearby_agents(5, 5, radius=1)
    assert all(
        abs(a.resident.x - 5) + abs(a.resident.y - 5) <= 1
        for a in nearby
    )


def test_zone_preference_scores_reflect_personality(mock_world):
    social_zone = mock_world.zones[0]
    quiet_zone = mock_world.zones[1]

    extrovert_score = mock_world.score_zone_for_resident(mock_world.agents[0].resident, social_zone)
    introvert_score = mock_world.score_zone_for_resident(mock_world.agents[1].resident, quiet_zone)

    assert extrovert_score > mock_world.score_zone_for_resident(mock_world.agents[0].resident, quiet_zone)
    assert introvert_score > mock_world.score_zone_for_resident(mock_world.agents[1].resident, social_zone)


def test_zone_stats_include_residents_buildings_and_atmosphere(mock_world):
    stats = mock_world.get_zone_stats(mock_world.zones[0].id)

    assert stats is not None
    assert stats["building_count"] >= 1
    assert stats["resident_count"] >= 1
    assert stats["atmosphere"]["noise"] >= 0
    assert stats["atmosphere"]["safety"] >= 0
    assert stats["atmosphere"]["beauty"] >= 0


def test_building_upgrade_requires_vote_and_funds_and_unlocks_lv3_special(mock_world):
    school = Building(id="school-upgrade", type="school", name="进阶学校", capacity=8, position=(12, 4))
    mock_world.add_building(school)

    assert mock_world.upgrade_building("school-upgrade", town_funds=500, vote_passed=False) is False
    assert school.level == 1

    assert mock_world.upgrade_building("school-upgrade", town_funds=60, vote_passed=True) is False
    assert school.level == 1

    assert mock_world.upgrade_building("school-upgrade", town_funds=180, vote_passed=True) is True
    assert school.level == 2
    assert school.capacity == 12
    assert "expanded" in school.upgrades

    assert mock_world.upgrade_building("school-upgrade", town_funds=360, vote_passed=True) is True
    assert school.level == 3
    assert "luxury" in school.upgrades
    assert mock_world.get_building_special_feature(school) == "advanced_courses"


def test_home_decoration_boosts_mood_and_visit_willingness(mock_world):
    home = mock_world.get_building("home1")
    resident = mock_world.agents[0].resident
    visitor = mock_world.agents[1].resident
    resident.home_building_id = home.id
    resident.location = home.id
    resident.mood = "neutral"

    before = mock_world.get_building_visit_willingness(visitor, home)

    assert mock_world.decorate_home(resident, effort=0.3) is True

    after = mock_world.get_building_visit_willingness(visitor, home)
    mock_world.apply_building_effects(mock_world.agents[0])

    assert home.decoration_score > 0
    assert after > before
    assert resident.mood in {"calm", "content", "happy", "excited", "ecstatic"}


def test_get_nearby_agents_uses_grid_index_without_full_agent_scan(mock_world):
    mock_world.rebuild_grid_index()

    class PoisonResident:
        id = "poison"
        location = None

        @property
        def x(self):
            raise AssertionError("get_nearby_agents should read indexed buckets, not scan every agent")

        @property
        def y(self):
            raise AssertionError("get_nearby_agents should read indexed buckets, not scan every agent")

    mock_world.agents.append(SimpleNamespace(resident=PoisonResident()))

    nearby = mock_world.get_nearby_agents(5, 5)
    ids = {agent.resident.id for agent in nearby}

    assert "a2" in ids
    assert "poison" not in ids


def test_tick_rebuilds_grid_index(mock_world):
    mock_world.grid_index.clear()

    mock_world.tick()

    indexed_ids = {
        agent.resident.id
        for bucket in mock_world.grid_index.values()
        for agent in bucket
    }

    assert {"a1", "a2", "a3"} <= indexed_ids


def test_simulation_time_format(mock_world):
    time_str = mock_world.simulation_time()
    assert "Day" in time_str


def test_simulation_time_advances_with_ticks(mock_world):
    t0 = mock_world.simulation_time()
    mock_world.tick()
    t1 = mock_world.simulation_time()
    assert t0 != t1


def test_enter_leave_building(mock_world):
    agent = mock_world.agents[0]
    building = mock_world.buildings[0]

    agent.resident.location = None
    result = mock_world.enter_building(agent, building)
    assert result is True
    assert agent.resident.location == building.id

    mock_world.leave_building(agent)
    assert agent.resident.location is None
    assert agent.resident.x == building.position[0]
    assert agent.resident.y == building.position[1]


def test_building_capacity_enforced(mock_world):
    home = mock_world.get_building("home1")
    for i in range(home.capacity):
        a = make_agent(f"cap_{i}", f"居民{i}", x=0, y=0)
        mock_world.add_agent(a)
        mock_world.enter_building(a, home)

    # Next agent should be rejected
    extra = make_agent("extra", "多余", x=0, y=0)
    mock_world.add_agent(extra)
    result = mock_world.enter_building(extra, home)
    assert result is False


def test_pending_events_attribute(mock_world):
    assert hasattr(mock_world, "pending_events")
    assert isinstance(mock_world.pending_events, list)


def test_relationship_graph_operations(mock_world):
    from engine.types import RelationType, Relationship
    rel = Relationship(
        from_id="a1", to_id="a2",
        type=RelationType.friendship,
        intensity=0.5, since="t",
    )
    mock_world.set_relationship(rel)
    assert mock_world.get_relationship("a1", "a2") is not None

    mock_world.remove_relationship("a1", "a2")
    assert mock_world.get_relationship("a1", "a2") is None


def test_work_building_improves_skill_and_income(mock_world):
    agent = mock_world.agents[0]
    cafe = mock_world.get_building("cafe1")
    agent.resident.location = cafe.id
    agent.resident.skills["cooking"] = 0.6
    agent.resident.coins = 100
    mock_world.current_tick = 18  # work hours

    mock_world.apply_building_effects(agent)

    assert agent.resident.occupation == "barista"
    assert agent.resident.skills["cooking"] > 0.6
    assert agent.resident.coins > 103
    assert any(item.name == "coffee" for item in agent.resident.inventory)


def test_school_class_increases_knowledge_and_history(mock_world):
    school = Building(id="school1", type="school", name="学院", capacity=8, position=(8, 8))
    mock_world.add_building(school)
    agent = mock_world.agents[0]
    agent.resident.location = school.id

    mock_world.apply_building_effects(agent)

    assert agent.resident.education.courses
    subject = agent.resident.education.courses[0].subject
    assert agent.resident.education.knowledge_level[subject] >= 0.05
    assert agent.resident.education.course_history[-1].subject == subject


def test_child_in_school_studies_without_getting_assigned_a_job(mock_world):
    school = Building(id="school-child", type="school", name="少年学堂", capacity=8, position=(8, 8))
    mock_world.add_building(school)
    child = mock_world.agents[0]
    child.resident.age_days = 80
    child.resident.age_stage = "child"
    child.resident.location = school.id
    child.resident.occupation = "unemployed"
    child.resident.job.title = "unemployed"
    mock_world.current_tick = 18

    mock_world.apply_building_effects(child)

    assert child.resident.occupation == "student"
    assert child.resident.job.title == "student"
    assert child.resident.education.courses
    assert child.resident.wallet == 0.0


def test_nursing_home_improves_elder_health_recovery(mock_world):
    nursing_home = Building(id="nursing1", type="nursing_home", name="安宁养老院", capacity=6, position=(12, 12))
    mock_world.add_building(nursing_home)
    elder = mock_world.agents[0]
    elder.resident.age_days = 850
    elder.resident.age_stage = "elder"
    elder.resident.location = nursing_home.id
    elder.resident.health.hp = 0.45
    elder.resident.energy = 0.5

    mock_world.apply_building_effects(elder)

    assert elder.resident.health.hp > 0.45
    assert elder.resident.energy > 0.5


def test_demographics_overview_reports_age_distribution_and_timeline(mock_world):
    mock_world.agents[0].resident.age_days = 50
    mock_world.agents[0].resident.age_stage = "child"
    mock_world.agents[1].resident.age_days = 420
    mock_world.agents[1].resident.age_stage = "adult"
    mock_world.agents[2].resident.age_days = 860
    mock_world.agents[2].resident.age_stage = "elder"
    mock_world.agents[2].resident.retirement_tick = 144
    mock_world.generational_history = [
        {"tick": 96, "type": "birth", "resident_name": "新芽", "summary": "新居民诞生"},
        {"tick": 144, "type": "retirement", "resident_name": "大强", "summary": "大强退休"},
    ]

    overview = mock_world.get_demographics_overview()

    assert overview["age_distribution"] == {"child": 1, "adult": 1, "elder": 1}
    assert overview["retired_count"] == 1
    assert overview["aging_index"] == pytest.approx(1.0)
    assert overview["generational_timeline"][0]["type"] == "retirement"
    assert overview["generational_timeline"][1]["type"] == "birth"


def test_assign_initial_pets_creates_owned_and_stray_pets(mock_world):
    mock_world.assign_initial_pets()

    owned_count = sum(len(agent.resident.pets) for agent in mock_world.agents)
    assert owned_count >= 1
    assert mock_world.stray_pets
    assert len(mock_world.list_pets()) == owned_count + len(mock_world.stray_pets)


def test_update_pets_can_adopt_stray_and_sync_owned_pet(mock_world, monkeypatch):
    adopter = mock_world.agents[0]
    adopter.resident.personality = "友善热心"
    adopter.resident.x = 5
    adopter.resident.y = 5
    mock_world.stray_pets = [
        Pet(
            id="stray-1",
            name="流浪团团",
            species="rabbit",
            owner_id=None,
            x=5,
            y=5,
            hunger=0.6,
        )
    ]
    monkeypatch.setattr("engine.world.random.random", lambda: 0.0)
    monkeypatch.setattr("engine.world.random.choice", lambda values: 0)

    events = mock_world.update_pets()

    assert adopter.resident.pets
    assert adopter.resident.pets[0].owner_id == adopter.resident.id
    assert mock_world.stray_pets == []
    assert any("收养" in event.description for event in events)


def test_social_knowledge_boosts_social_probability(mock_world):
    agent_a = mock_world.agents[0]
    agent_b = mock_world.agents[1]

    baseline = mock_world.get_social_probability(agent_a, agent_b)
    agent_a.resident.education.knowledge_level["social"] = 0.9
    agent_b.resident.education.knowledge_level["social"] = 0.9

    boosted = mock_world.get_social_probability(agent_a, agent_b)

    assert boosted > baseline


def test_add_agent_seeds_religious_relationship_bias():
    world = World(config=WorldConfig(llm_call_probability=0.0))
    alpha = make_agent("faith-1", "阿木", x=1, y=1)
    beta = make_agent("faith-2", "阿石", x=2, y=1)
    gamma = make_agent("faith-3", "阿禾", x=3, y=1)

    alpha.resident.religion = Religion.naturalism
    beta.resident.religion = Religion.naturalism
    gamma.resident.religion = Religion.solarsm

    world.add_agent(alpha)
    world.add_agent(beta)
    world.add_agent(gamma)

    same_faith = world.get_relationship(alpha.resident.id, beta.resident.id)
    different_faith = world.get_relationship(alpha.resident.id, gamma.resident.id)

    assert same_faith is not None
    assert same_faith.type is RelationType.friendship
    assert same_faith.intensity == pytest.approx(0.1)
    assert different_faith is not None
    assert different_faith.type is RelationType.dislike
    assert different_faith.intensity == pytest.approx(0.1)


def test_holy_site_worship_raises_piety_morality_and_mood(mock_world):
    shrine = Building(id="shrine1", type="shrine", name="林间祭坛", capacity=8, position=(7, 4))
    mock_world.add_building(shrine)
    devotee = mock_world.agents[0]
    devotee.resident.religion = Religion.naturalism
    devotee.resident.location = shrine.id
    devotee.resident.mood = "neutral"

    before_piety = devotee.resident.piety
    before_morality = devotee.resident.morality_score

    mock_world.apply_building_effects(devotee)

    assert devotee.resident.piety > before_piety
    assert devotee.resident.morality_score > before_morality
    assert devotee.resident.mood in {"calm", "content", "happy", "excited", "ecstatic"}


def test_world_religion_system_creates_events_and_updates_morality(mock_world):
    chapel = Building(id="chapel1", type="chapel", name="日轮礼拜堂", capacity=12, position=(8, 8))
    mock_world.add_building(chapel)
    leader = mock_world.agents[0]
    leader.resident.religion = Religion.solarsm
    leader.resident.piety = 0.92
    leader.resident.reputation = 0.74
    leader.resident.morality_score = 0.8

    created = mock_world.maybe_create_religious_event()

    assert created is not None
    assert created.religion == Religion.solarsm.value
    assert created.leader_id == leader.resident.id
    assert mock_world.morality_index() > 0.5
    assert mock_world.get_religion_overview()["events"]


def test_low_morality_increases_fraud_risk(mock_world, monkeypatch):
    perpetrator = mock_world.agents[0]
    perpetrator.resident.location = None
    perpetrator.resident.x = 0
    perpetrator.resident.y = 0
    perpetrator.resident.mood = "sad"
    perpetrator.resident.energy = 0.05
    perpetrator.resident.coins = 0
    perpetrator.resident.morality_score = 0.0
    for other in mock_world.agents[1:]:
        other.resident.x = 15
        other.resident.y = 15
        other.resident.location = None

    monkeypatch.setattr("engine.world.random.random", lambda: 0.0)
    events = mock_world.process_crime_tick()

    assert events
    assert events[-1].type == "fraud"


def test_set_resident_mood_records_history(mock_world):
    agent = mock_world.agents[0]

    changed = mock_world.set_resident_mood(agent, "sad", "event")

    assert changed is True
    assert agent.resident.mood == "sad"
    assert agent.resident.mood_history[-1].cause == "event"
    assert agent.resident.mood_history[-1].mood == "sad"


def test_depression_triggers_after_20_low_mood_ticks(mock_world, monkeypatch):
    for agent in mock_world.agents:
        agent.resident.location = None
        agent.resident.x = 0
        agent.resident.y = 0
        agent.resident.energy = 1.0
        mock_world.set_resident_mood(agent, "sad", "event")

    monkeypatch.setattr("engine.world.random.random", lambda: 0.99)
    monkeypatch.setattr("engine.act.random.random", lambda: 0.99)

    for _ in range(20):
        mock_world.tick()

    assert mock_world.agents[0].resident.mental_state == "depressed"
    assert mock_world.agents[0].resident.low_mood_ticks >= 20


def test_depressed_resident_has_lower_social_probability(mock_world):
    agent_a = mock_world.agents[0]
    agent_b = mock_world.agents[1]

    baseline = mock_world.get_social_probability(agent_a, agent_b)
    agent_a.resident.mental_state = "depressed"
    reduced = mock_world.get_social_probability(agent_a, agent_b)

    assert reduced < baseline


def test_stormy_weather_sends_residents_home(mock_world):
    home = mock_world.get_building("home1")
    agent = mock_world.agents[0]
    agent.resident.home_building_id = home.id
    agent.resident.location = None
    agent.resident.x = 1
    agent.resident.y = 1
    mock_world.weather = __import__("engine.types", fromlist=["WeatherType"]).WeatherType.stormy

    tick_state = mock_world.tick()

    assert tick_state.events
    assert any("暴风雨" in event.description or "回家" in event.description for event in tick_state.events)
    assert agent.resident.location == home.id or (agent.resident.x, agent.resident.y) == home.position


def test_stormy_outdoor_weather_can_trigger_cold(mock_world, monkeypatch):
    agent = mock_world.agents[0]
    agent.resident.location = None
    agent.resident.x = 4
    agent.resident.y = 4
    agent.resident.health.illness = None
    mock_world.weather = __import__("engine.types", fromlist=["WeatherType"]).WeatherType.stormy

    import random as _random
    mock_world.rng = _random.Random(0)
    mock_world.rng.random = lambda: 0.0

    mock_world.tick()

    assert agent.resident.health.illness is not None
    assert agent.resident.health.illness.type in ("cold", "injury")


def test_decay_resident_memories_reduces_negative_weight(mock_world):
    resident = mock_world.agents[0].resident
    resident.memories.append(
        Memory(
            id=str(uuid.uuid4()),
            content="和小红大吵了一架",
            timestamp=mock_world.simulation_time(),
            importance=0.8,
            emotion="sad",
            tick=0,
            type="argument",
            emotional_weight=-1.0,
            related_resident_ids=["a2"],
        )
    )

    mock_world.current_tick = 100
    mock_world.decay_resident_memories()

    assert resident.memories[0].emotional_weight == pytest.approx(-0.9)


def test_recall_positive_memory_improves_low_mood(mock_world):
    agent = mock_world.agents[0]
    agent.resident.mood = "sad"
    agent.resident.memories.append(
        Memory(
            id=str(uuid.uuid4()),
            content="去年节日里和朋友一起看烟火",
            timestamp=mock_world.simulation_time(),
            importance=0.7,
            emotion="happy",
            tick=0,
            type="festival",
            emotional_weight=0.8,
            related_resident_ids=["a2"],
        )
    )

    recalled = mock_world.recall_comforting_memory(agent)

    assert recalled is not None
    assert recalled.type == "festival"
    assert agent.resident.mood in {"tired", "neutral", "calm", "content", "happy"}


def test_process_crime_tick_reduces_victim_mood_and_town_safety(mock_world, monkeypatch):
    perpetrator = mock_world.agents[0]
    victim = mock_world.agents[1]
    perpetrator.resident.mood = "sad"
    perpetrator.resident.energy = 0.05
    perpetrator.resident.coins = 0
    victim.resident.mood = "happy"

    mock_world.set_relationship(
        Relationship(
            from_id=perpetrator.resident.id,
            to_id=victim.resident.id,
            type=RelationType.dislike,
            intensity=0.95,
            familiarity=0.0,
        )
    )

    monkeypatch.setattr("engine.world.random.random", lambda: 0.0)
    events = mock_world.process_crime_tick()

    assert events
    latest = events[-1]
    assert latest.perpetrator == perpetrator.resident.id
    assert latest.victim == victim.resident.id
    assert latest.type in {"theft", "vandalism", "conflict"}
    assert perpetrator.resident.flagged_for_crime is True
    assert perpetrator.resident.reputation == pytest.approx(-0.3)
    assert mock_world.mood_score(victim.resident.mood) < mock_world.mood_score("happy")
    assert all(agent.resident.safety_feeling < 1.0 for agent in mock_world.agents)
    assert victim.resident.health.illness is not None
    assert victim.resident.health.illness.type == "injury"


def test_hospital_treatment_recovers_resident_faster_with_doctor(mock_world):
    patient = mock_world.agents[0]
    doctor = mock_world.agents[1]
    hospital = Building(id="hospital1", type="hospital", name="镇医院", capacity=8, position=(6, 6))
    mock_world.add_building(hospital)

    patient.resident.health.illness = __import__("engine.types", fromlist=["Illness"]).Illness(type="flu", contagious=True, severity=0.65)
    patient.resident.health.recovery_tick = 3
    patient.resident.health.hp = 0.55
    patient.resident.location = hospital.id
    doctor.resident.location = hospital.id
    doctor.resident.job.title = "doctor"
    doctor.resident.occupation = "doctor"

    for _ in range(2):
        mock_world.apply_building_effects(patient)

    assert patient.resident.health.recovery_tick <= 0
    assert patient.resident.health.illness is None
    assert patient.resident.health.hp > 0.55


def test_police_station_patrol_halves_crime_probability(mock_world, monkeypatch):
    perpetrator = mock_world.agents[0]
    perpetrator.resident.location = None
    perpetrator.resident.x = 3
    perpetrator.resident.y = 3
    perpetrator.resident.mood = "sad"
    perpetrator.resident.energy = 0.1
    perpetrator.resident.coins = 0
    mock_world.add_building(Building(id="police1", type="police_station", name="治安站", capacity=4, position=(3, 3)))

    monkeypatch.setattr(mock_world, "_crime_pressure", lambda _agent: 0.4)
    monkeypatch.setattr("engine.world.random.random", lambda: 0.3)

    events = mock_world.process_crime_tick()

    assert events == []


def test_adjust_reputation_clamps_and_tracks_history(mock_world):
    agent = mock_world.agents[0]

    mock_world.adjust_resident_reputation(agent.resident.id, 0.9, "helped_other")
    mock_world.adjust_resident_reputation(agent.resident.id, 0.3, "social_active")

    assert agent.resident.reputation == 1.0
    assert agent.resident.reputation_history[-1].source == "social_active"
    assert agent.resident.reputation_history[-1].after == 1.0
    assert mock_world.is_town_celebrity(agent.resident) is True


def test_social_probability_prefers_high_reputation_and_avoids_low_reputation(mock_world):
    initiator = mock_world.agents[0]
    respected = mock_world.agents[1]
    avoided = mock_world.agents[2]

    respected.resident.reputation = 0.9
    avoided.resident.reputation = -0.8

    high_probability = mock_world.get_social_probability(initiator, respected)
    low_probability = mock_world.get_social_probability(initiator, avoided)

    assert high_probability > low_probability


def test_generate_road_network_connects_buildings_and_records_distance(mock_world):
    mock_world.add_building(Building(id="shop1", type="shop", name="杂货铺", capacity=4, position=(15, 5)))
    mock_world.add_building(Building(id="park1", type="park", name="公园", capacity=10, position=(12, 12)))

    roads = mock_world.get_road_network()

    assert roads
    assert all(road.distance > 0 for road in roads)
    connected_buildings = {road.from_building for road in roads} | {road.to_building for road in roads}
    assert {"cafe1", "home1", "shop1", "park1"} <= connected_buildings


def test_transport_stats_reports_modes_and_hotspots(mock_world):
    mock_world.add_building(Building(id="shop1", type="shop", name="杂货铺", capacity=4, position=(15, 5)))
    traveler = mock_world.agents[0]
    traveler.resident.inventory.append(__import__("engine.types", fromlist=["Item"]).Item(name="bicycle"))

    overview = mock_world.get_transport_overview(traveler.resident, "cafe1", "shop1")

    assert overview["roads"]
    assert overview["stats"]["mode_share"]["bicycle"] >= 1
    assert "congestion_hotspots" in overview["stats"]


def test_congestion_slows_travel_on_busy_road(mock_world):
    mock_world.add_building(Building(id="shop1", type="shop", name="杂货铺", capacity=4, position=(15, 5)))
    road = mock_world.find_road_between("cafe1", "shop1")
    assert road is not None

    quiet_steps = mock_world.compute_travel_steps(mock_world.agents[0].resident, road)
    for _ in range(5):
        mock_world.record_road_usage(road, mock_world.agents[0].resident.id)
    congested_steps = mock_world.compute_travel_steps(mock_world.agents[0].resident, road)

    assert congested_steps < quiet_steps
