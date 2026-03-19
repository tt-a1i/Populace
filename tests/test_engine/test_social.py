"""Tests for engine/social.py — interaction, dialogue, decay, evolve."""
from unittest.mock import patch

import pytest

from engine.social import (
    DialogueResult,
    decay_relationships,
    evolve_relationship,
    initiate_dialogue,
    should_interact,
    update_relationships_from_dialogue,
)
from engine.types import RelationType, Relationship

from tests.conftest import make_agent


def test_should_interact_extroverts_high_probability(mock_world):
    a = mock_world.agents[0]
    b = mock_world.agents[1]
    # Force extrovert personalities
    a.resident.personality = "外向、热情"
    b.resident.personality = "外向、开朗"

    hits = sum(1 for _ in range(100) if should_interact(a, b, mock_world))
    assert hits > 20  # should be triggered frequently


def test_should_interact_introverts_lower_probability(mock_world):
    a = mock_world.agents[0]
    b = mock_world.agents[1]
    a.resident.personality = "内向、安静"
    b.resident.personality = "内向、害羞"

    with patch("engine.social.random.random", return_value=0.99):
        result = should_interact(a, b, mock_world)
    assert result is False


def test_dialogue_result_empty():
    dr = DialogueResult.empty()
    assert dr.messages == []
    assert dr.relationship_delta == 0
    assert dr.is_important is False


@pytest.mark.asyncio
async def test_initiate_dialogue_returns_result(mock_world, mock_llm_eval):
    a = mock_world.agents[0]
    b = mock_world.agents[1]
    result = await initiate_dialogue(a, b, mock_world)
    assert isinstance(result, DialogueResult)
    assert isinstance(result.messages, list)
    assert -10 <= result.relationship_delta <= 10


@pytest.mark.asyncio
async def test_initiate_dialogue_llm_fail_returns_empty(mock_world):
    """When LLM returns None, dialogue returns empty result."""
    async def _fail(*args, **kwargs):
        return None

    with patch("backend.llm.client.chat_completion", side_effect=_fail):
        a = mock_world.agents[0]
        b = mock_world.agents[1]
        result = await initiate_dialogue(a, b, mock_world)
    assert result.messages == []


def test_decay_reduces_intensity(mock_world):
    from engine.types import Relationship as Rel
    mock_world.set_relationship(Rel(
        from_id="a1", to_id="a2",
        type=RelationType.friendship,
        intensity=0.5, since="t", familiarity=0.3,
    ))
    updates = decay_relationships(mock_world, mock_world.config)
    rel = mock_world.get_relationship("a1", "a2")
    assert rel.intensity < 0.5
    assert len(updates) == 1


def test_decay_removes_zero_no_familiarity(mock_world):
    from engine.types import Relationship as Rel
    mock_world.set_relationship(Rel(
        from_id="a1", to_id="a2",
        type=RelationType.friendship,
        intensity=0.005, since="t", familiarity=0.0,
    ))
    decay_relationships(mock_world, mock_world.config)
    assert mock_world.get_relationship("a1", "a2") is None


def test_evolve_knows_to_friendship():
    new_type = evolve_relationship(
        "a", "b", 0.3, RelationType.knows,
        intensity=0.3, familiarity=0.25,
    )
    assert new_type == RelationType.friendship


def test_evolve_friendship_to_rivalry_on_negative():
    new_type = evolve_relationship(
        "a", "b", -0.4, RelationType.friendship,
        intensity=0.2, familiarity=0.5,
    )
    assert new_type == RelationType.rivalry


def test_update_relationships_bidirectional(mock_world):
    deltas = update_relationships_from_dialogue(
        mock_world, mock_world.agents[0], mock_world.agents[1], 3.0
    )
    assert len(deltas) == 2
    assert deltas[0].from_id == "a1" and deltas[0].to_id == "a2"
    assert deltas[1].from_id == "a2" and deltas[1].to_id == "a1"
