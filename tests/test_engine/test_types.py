"""Tests for engine/types.py — dataclass creation and basic validation."""
from dataclasses import asdict

import pytest

from engine.types import (
    Building,
    BulletinPost,
    DiaryEntry,
    Education,
    Event,
    ExternalTown,
    Health,
    Illness,
    Item,
    Mayor,
    Memory,
    MoodEntry,
    Party,
    Pet,
    Policy,
    Season,
    Reflection,
    RelationType,
    Relationship,
    Resident,
    TradeRoute,
    TickState,
    Weather,
    WeatherType,
    WorldConfig,
)


def test_resident_defaults():
    r = Resident(id="r1", name="小明", personality="外向")
    assert r.mood == "neutral"
    assert r.location is None
    assert r.goals == []
    assert r.skills == {}
    assert r.inventory == []
    assert r.x == 0 and r.y == 0
    assert r.skin_color is None
    assert r.hair_style is None
    assert r.hair_color is None
    assert r.outfit_color is None
    assert r.age_days == 0
    assert r.age_stage == "child"
    assert r.retirement_tick is None
    assert r.inheritance == {}
    assert r.mood_history == []
    assert r.mental_state == "stable"
    assert r.low_mood_ticks == 0
    assert r.memories == []
    assert r.health.hp == 1.0
    assert r.health.illness is None
    assert r.party == Party.neutral
    assert isinstance(r.education, Education)
    assert r.education.courses == []
    assert r.education.knowledge_level == {}


def test_resident_serialisation():
    r = Resident(id="r1", name="小明", personality="外向", goals=["交朋友"], mood="happy")
    d = asdict(r)
    assert d["id"] == "r1"
    assert d["goals"] == ["交朋友"]


def test_diary_entry_fields_round_trip():
    entry = DiaryEntry(
        id="d1",
        date="Day 2",
        day=2,
        tick=96,
        content="今天和朋友在咖啡馆聊了很久。",
        tags=["social", "weather:sunny"],
        mood_snapshot="happy",
        highlight=True,
    )

    assert entry.day == 2
    assert entry.content.startswith("今天")
    assert entry.tags == ["social", "weather:sunny"]
    assert entry.mood_snapshot == "happy"
    assert entry.summary == entry.content


def test_bulletin_post_defaults_and_topic_fallback():
    post = BulletinPost(
        id="post-1",
        author_id="r1",
        content="今天在春日祭认识了不少朋友。",
        tick=48,
        likes=["r2"],
        category="festival",
    )

    assert post.author_id == "r1"
    assert post.category == "festival"
    assert post.topic == "festival"
    assert post.subject_id == "r1"
    assert post.tone == "positive"


def test_external_town_and_trade_route_defaults():
    town = ExternalTown(name="海雾港")
    route = TradeRoute(
        from_town="Populace",
        to_town="海雾港",
        goods=["coffee", "tea"],
        profit_per_tick=12.5,
    )

    assert town.name == "海雾港"
    assert town.relation_score == 0.0
    assert town.trade_balance == 0.0
    assert town.ambassador_id is None
    assert route.from_town == "Populace"
    assert route.to_town == "海雾港"
    assert route.goods == ["coffee", "tea"]
    assert route.profit_per_tick == 12.5


def test_building_creation():
    b = Building(id="b1", type="cafe", name="咖啡馆", capacity=4, position=(5, 5))
    assert b.capacity == 4
    assert b.position == (5, 5)


def test_item_creation():
    item = Item(name="coffee", quantity=2, value=6)
    assert item.name == "coffee"
    assert item.quantity == 2


def test_pet_creation():
    pet = Pet(id="pet-1", name="旺财", species="dog", owner_id="r1", hunger=0.7, x=3, y=4)
    assert pet.species == "dog"
    assert pet.owner_id == "r1"
    assert pet.hunger == 0.7
    assert pet.x == 3 and pet.y == 4


def test_health_creation():
    health = Health(hp=0.8, illness=Illness(type="cold", contagious=True, severity=0.35), recovery_tick=12)
    assert health.hp == 0.8
    assert health.illness is not None
    assert health.illness.type == "cold"
    assert health.recovery_tick == 12


def test_policy_and_mayor_creation():
    policy = Policy(type="welfare", effect={"mood_delta": 0.12, "reserve_delta": -18.0}, duration=80)
    mayor = Mayor(resident_id="r1", term_start=100, term_end=600, policies=[policy])

    assert mayor.resident_id == "r1"
    assert mayor.policies[0].type == "welfare"
    assert mayor.policies[0].effect["mood_delta"] == pytest.approx(0.12)
    assert mayor.policies[0].duration == 80


def test_party_enum_values():
    assert Party.progressive.value == "progressive"
    assert Party.conservative.value == "conservative"
    assert Party.neutral.value == "neutral"


def test_memory_creation():
    m = Memory(
        id="m1",
        content="遇见小红",
        timestamp="Day 1, 08:00",
        importance=0.8,
        emotion="happy",
        tick=12,
        type="first_meeting",
        emotional_weight=0.9,
        related_resident_ids=["r2"],
    )
    assert m.importance == 0.8
    assert m.type == "first_meeting"
    assert m.emotional_weight == 0.9
    assert m.related_resident_ids == ["r2"]


def test_mood_entry_creation():
    entry = MoodEntry(tick=12, mood="sad", cause="weather")
    assert entry.tick == 12
    assert entry.mood == "sad"
    assert entry.cause == "weather"


def test_weather_model_creation():
    weather = Weather(current=WeatherType.rainy, season=Season.autumn, forecast=["cloudy", "rainy", "stormy"])
    assert weather.current == WeatherType.rainy
    assert weather.season == Season.autumn
    assert weather.forecast[-1] == "stormy"


def test_season_enum_values():
    assert Season.spring.value == "spring"
    assert Season.summer.value == "summer"
    assert Season.autumn.value == "autumn"
    assert Season.winter.value == "winter"


def test_event_creation():
    e = Event(id="e1", description="下雨了", timestamp="Day 1, 10:00", source="user")
    assert e.source == "user"


def test_reflection_creation():
    rf = Reflection(id="rf1", summary="感觉今天不错", timestamp="Day 1, 12:00", derived_from=["m1", "m2"])
    assert len(rf.derived_from) == 2


def test_relation_type_enum():
    assert RelationType.friendship.value == "friendship"
    assert RelationType.love.value == "love"
    assert RelationType("rivalry") == RelationType.rivalry


def test_relationship_creation():
    rel = Relationship(
        from_id="r1", to_id="r2",
        type=RelationType.friendship,
        intensity=0.7,
        since="Day 1, 00:00",
        familiarity=0.3,
    )
    assert rel.intensity == 0.7


def test_world_config_defaults():
    cfg = WorldConfig()
    assert cfg.tick_per_day == 48
    assert cfg.map_width_tiles == 40
    assert cfg.llm_call_probability == 0.2


def test_tick_state_empty():
    ts = TickState(tick=1, time="Day 1, 00:30")
    assert ts.movements == []
    assert ts.dialogues == []
    assert ts.relationships == []
    assert ts.population_events == []
