from __future__ import annotations

from engine.act import act
from engine.lifecycle import process_daily_population
from engine.types import RelationType, Relationship

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
    agent.resident.age_days = 366

    act(agent, {"action": "move", "target": [8, 5]}, mock_world)

    assert agent.resident.x == 6
    assert agent.resident.y == 5


def test_elderly_home_recovery_is_halved(mock_world):
    agent = mock_world.agents[0]
    agent.resident.location = "home1"
    agent.resident.age_days = 400
    agent.resident.energy = 0.5

    mock_world.apply_building_effects(agent)

    assert agent.resident.energy == 0.525


def test_daily_population_process_removes_deceased_resident(mock_world):
    agent = mock_world.agents[0]
    agent.resident.age_days = 501

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
    assert "温柔" in newborn.resident.personality
    assert "勇敢" in newborn.resident.personality
    assert relationship_deltas
    assert mock_world.get_relationship(parent_a.resident.id, newborn.resident.id) is not None
    assert mock_world.get_relationship(newborn.resident.id, parent_b.resident.id) is not None


def test_daily_population_process_ages_everyone(mock_world):
    start_ages = {agent.resident.id: agent.resident.age_days for agent in mock_world.agents}

    process_daily_population(mock_world, rng=ZeroRng())

    for agent in mock_world.agents:
        assert agent.resident.age_days == start_ages[agent.resident.id] + 1
