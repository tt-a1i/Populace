from __future__ import annotations

from engine.act import act
from engine.lifecycle import process_daily_population
from engine.types import Item, RelationType, Relationship

from tests.conftest import make_agent


class ZeroRng:
    def random(self) -> float:
        return 0.0

    def choice(self, seq):
        return seq[0]

    def sample(self, population, k):
        return list(population)[:k]


def test_elderly_movement_is_halved(mock_world):
    agent = mock_world.agents[0]
    agent.resident.age_days = 801

    act(agent, {"action": "move", "target": [8, 5]}, mock_world)

    assert agent.resident.x == 6
    assert agent.resident.y == 5


def test_elderly_home_recovery_is_halved(mock_world):
    agent = mock_world.agents[0]
    agent.resident.location = "home1"
    agent.resident.age_days = 840
    agent.resident.energy = 0.5

    mock_world.apply_building_effects(agent)

    assert agent.resident.energy == 0.525


def test_daily_population_process_removes_deceased_resident(mock_world):
    agent = mock_world.agents[0]
    agent.resident.age_days = 1000

    events, relationship_deltas, summary = process_daily_population(mock_world, rng=ZeroRng())

    assert relationship_deltas == []
    assert summary == {"births": 0, "deaths": 1}
    assert all(existing.resident.id != agent.resident.id for existing in mock_world.agents)
    assert events[0].event_type == "death"
    assert events[0].resident_id == agent.resident.id


def test_daily_population_process_creates_newborn_with_parent_traits(mock_world):
    parent_a = mock_world.agents[0]
    parent_b = mock_world.agents[1]
    parent_a.resident.personality = "温柔、健谈、细心"
    parent_b.resident.personality = "勇敢、沉稳、敏锐"
    parent_a.resident.skills = {"crafting": 0.9, "social": 0.6}
    parent_b.resident.skills = {"teaching": 0.8, "social": 0.4}
    mock_world.set_relationship(
        Relationship(
            from_id=parent_a.resident.id,
            to_id=parent_b.resident.id,
            type=RelationType.love,
            intensity=0.95,
            familiarity=1.0,
        )
    )
    mock_world.set_relationship(
        Relationship(
            from_id=parent_b.resident.id,
            to_id=parent_a.resident.id,
            type=RelationType.love,
            intensity=0.96,
            familiarity=1.0,
        )
    )

    events, relationship_deltas, summary = process_daily_population(mock_world, rng=ZeroRng())

    births = [event for event in events if event.event_type == "birth"]
    assert summary == {"births": 1, "deaths": 0}
    assert len(births) == 1
    newborn = next(agent for agent in mock_world.agents if agent.resident.id == births[0].resident_id)
    assert newborn.resident.age_days == 0
    assert newborn.resident.age_stage == "child"
    assert "温柔" in newborn.resident.personality
    assert "勇敢" in newborn.resident.personality
    assert newborn.resident.skills
    assert set(newborn.resident.skills).issubset({"crafting", "social", "teaching"})
    assert all(0 < value < 1.0 for value in newborn.resident.skills.values())
    assert relationship_deltas
    assert mock_world.get_relationship(parent_a.resident.id, newborn.resident.id) is not None
    assert mock_world.get_relationship(newborn.resident.id, parent_b.resident.id) is not None


def test_daily_population_process_ages_everyone(mock_world):
    start_ages = {agent.resident.id: agent.resident.age_days for agent in mock_world.agents}

    process_daily_population(mock_world, rng=ZeroRng())

    for agent in mock_world.agents:
        assert agent.resident.age_days == start_ages[agent.resident.id] + 1


def test_daily_population_process_retires_elder_and_pays_pension(mock_world):
    agent = mock_world.agents[0]
    agent.resident.age_days = 799
    agent.resident.occupation = "shopkeeper"
    agent.resident.job.title = "shopkeeper"
    agent.resident.wallet = 12.0
    mock_world.current_tick = 240
    mock_world.town_reserve = 60.0

    events, relationship_deltas, summary = process_daily_population(mock_world, rng=ZeroRng())

    assert events == []
    assert relationship_deltas == []
    assert summary == {"births": 0, "deaths": 0}
    assert agent.resident.age_days == 800
    assert agent.resident.age_stage == "elder"
    assert agent.resident.occupation == "retired"
    assert agent.resident.job.title == "retired"
    assert agent.resident.retirement_tick == 240
    assert agent.resident.wallet > 12.0
    assert mock_world.town_reserve < 60.0


def test_daily_population_process_transfers_inheritance_on_elder_death(mock_world):
    elder = mock_world.agents[0]
    heir = mock_world.agents[1]
    elder.resident.age_days = 1000
    elder.resident.coins = 135
    elder.resident.wallet = 42.5
    elder.resident.inventory = [Item(name="heirloom", quantity=1, value=20)]
    elder.resident.family.children_ids = [heir.resident.id]
    mock_world.current_tick = 512

    events, relationship_deltas, summary = process_daily_population(mock_world, rng=ZeroRng())

    assert relationship_deltas == []
    assert summary == {"births": 0, "deaths": 1}
    assert all(existing.resident.id != elder.resident.id for existing in mock_world.agents)
    assert heir.resident.coins >= 235
    assert heir.resident.wallet >= 42.5
    assert any(item.name == "heirloom" for item in heir.resident.inventory)
    assert heir.resident.inheritance["from_resident_id"] == elder.resident.id
    assert heir.resident.inheritance["tick"] == 512
    assert events[0].event_type == "death"
