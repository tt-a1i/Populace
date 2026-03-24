"""Tests for /api/residents/{id}/diary endpoint and diary generation."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_get_diary_empty_on_start(client):
    """New residents have no diary entries initially."""
    residents = client.get("/api/residents").json()
    rid = residents[0]["id"]

    response = client.get(f"/api/residents/{rid}/diary")
    assert response.status_code == 200
    assert response.json() == []


def test_get_diary_not_found(client):
    response = client.get("/api/residents/nonexistent/diary")
    assert response.status_code == 404


def test_diary_generated_by_world_tick():
    """generate_diary_entry produces a DiaryEntry appended to the resident."""
    from engine.agent import Agent
    from engine.diary import generate_diary_entry
    from engine.memory import MemoryStream
    from engine.types import Resident, WorldConfig
    from engine.world import World

    world = World(WorldConfig(tick_per_day=48))

    class _SimpleAgent(Agent):
        def perceive(self, w): return []
        def retrieve(self, q): return []
        async def reflect(self, m): return None
        async def plan(self, ctx): return {"action": "idle"}
        def act(self, plan, w): pass
        def memorize(self, e): pass

    resident = Resident(id="test-diary", name="TestResident", personality="calm")
    agent = _SimpleAgent(resident)
    world.add_agent(agent)

    assert len(resident.diary) == 0
    entry = generate_diary_entry(agent, world)

    assert len(resident.diary) == 1
    assert entry.id == resident.diary[0].id
    assert entry.date == "Day 1"
    assert entry.day == 1
    assert entry.tick == 0
    assert "TestResident" in entry.content
    assert entry.summary == entry.content
    assert isinstance(entry.tags, list)
    assert entry.mood_snapshot == resident.mood


def test_diary_entry_at_eod_tick():
    """world.tick() writes diary entries when the tick corresponds to 22:00."""
    from engine.types import Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    cfg = WorldConfig(tick_per_day=48)
    world = World(cfg)

    resident = Resident(id="eod-test", name="EODResident", personality="neutral")
    agent = GenerativeAgent(resident)
    world.add_agent(agent)

    # Advance to tick 44 (22:00 in a 48-tick day) — diary should be generated
    world.current_tick = 43  # will be incremented to 44 inside tick()
    world.tick()
    assert len(resident.diary) == 1
    assert resident.diary[0].date == "Day 1"
    assert resident.diary[0].day == 1

    # A second tick at 43+2=45 should NOT generate another entry
    world.tick()
    assert len(resident.diary) == 1


def test_get_diary_supports_day_filter_and_pagination(client):
    from engine.types import DiaryEntry

    state = client.app.state.simulation_state
    resident = state.world.agents[0].resident
    original_diary = list(resident.diary)
    try:
        resident.diary = [
            DiaryEntry(
                id="d1",
                date="Day 1",
                day=1,
                tick=44,
                content="Day1 entry",
                tags=["weather:sunny"],
                mood_snapshot="calm",
            ),
            DiaryEntry(
                id="d2",
                date="Day 2",
                day=2,
                tick=92,
                content="Day2 older entry",
                tags=["work"],
                mood_snapshot="tired",
            ),
            DiaryEntry(
                id="d3",
                date="Day 2",
                day=2,
                tick=93,
                content="Day2 newer entry",
                tags=["social", "highlight"],
                mood_snapshot="happy",
                highlight=True,
            ),
        ]

        response = client.get(f"/api/residents/{resident.id}/diary?day=2&limit=1&offset=0")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 1
        assert payload[0]["id"] == "d3"
        assert payload[0]["day"] == 2
        assert payload[0]["content"] == "Day2 newer entry"
        assert payload[0]["tags"] == ["social", "highlight"]
        assert payload[0]["mood_snapshot"] == "happy"
        assert payload[0]["highlight"] is True
    finally:
        resident.diary = original_diary


def test_mood_contagion_nudges_mood():
    """Co-occupants in a building influence each other's mood."""
    import random
    from engine.act import apply_mood_contagion
    from engine.types import Building, Relationship, RelationType, Resident, WorldConfig
    from engine.world import World
    from engine.generative_agent import GenerativeAgent

    random.seed(42)
    cfg = WorldConfig()
    world = World(cfg)

    # Place a building
    building = Building(id="b1", type="cafe", name="Cafe", capacity=5, position=(0, 0))
    world.add_building(building)

    # Two residents: one happy, one sad
    r_happy = Resident(id="r-happy", name="Happy", personality="happy person", mood="happy", x=0, y=0)
    r_sad = Resident(id="r-sad", name="Sad", personality="sad person", mood="sad", x=0, y=0)
    a_happy = GenerativeAgent(r_happy)
    a_sad = GenerativeAgent(r_sad)
    world.add_agent(a_happy)
    world.add_agent(a_sad)

    # Put both in the building
    world.enter_building(a_happy, building)
    world.enter_building(a_sad, building)

    # Add relationship so contagion is stronger
    world.set_relationship(Relationship(
        from_id="r-happy", to_id="r-sad", type=RelationType.friendship, intensity=0.9
    ))
    world.set_relationship(Relationship(
        from_id="r-sad", to_id="r-happy", type=RelationType.friendship, intensity=0.9
    ))

    # Run contagion many times; sad mood should trend upward and happy downward
    initial_sad = r_sad.mood
    nudged_up = 0
    for _ in range(50):
        apply_mood_contagion(world)
        if r_sad.mood != initial_sad:
            nudged_up += 1
            break

    # At least one nudge should have occurred with seed 42 over 50 iterations
    assert nudged_up > 0 or r_sad.mood != "sad"
