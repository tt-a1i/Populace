"""Tests for engine/social.py — interaction, dialogue, decay, evolve."""
from unittest.mock import patch

import pytest

from engine.social import (
    DialogueResult,
    decay_relationships,
    maybe_conduct_knowledge_teaching,
    maybe_conduct_skill_teaching,
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
async def test_initiate_dialogue_llm_fail_falls_back_to_template(mock_world):
    async def _fail(*args, **kwargs):
        return None

    with patch("backend.llm.client.chat_completion", side_effect=_fail):
        a = mock_world.agents[0]
        b = mock_world.agents[1]
        result = await initiate_dialogue(a, b, mock_world)
    assert len(result.messages) >= 2
    assert any("小红" in message["text"] or "小明" in message["text"] for message in result.messages)


@pytest.mark.asyncio
async def test_initiate_dialogue_can_comfort_depressed_friend(mock_world):
    a = mock_world.agents[0]
    b = mock_world.agents[1]
    a.resident.mental_state = "depressed"
    a.resident.mood = "sad"

    result = await initiate_dialogue(b, a, mock_world, comfort_target_id=a.resident.id)

    assert any("别一个人扛" in message["text"] or "我陪着你" in message["text"] for message in result.messages)
    assert result.relationship_delta > 0
    assert a.resident.mood in {"calm", "content", "happy"}
    assert a.resident.mental_state in {"depressed", "stable"}


@pytest.mark.asyncio
async def test_initiate_dialogue_records_shared_memory_and_reuses_it_in_dialogue(mock_world):
    a = mock_world.agents[0]
    b = mock_world.agents[1]

    result = await initiate_dialogue(a, b, mock_world)

    assert a.resident.memories
    assert b.resident.memories
    shared = [memory for memory in a.resident.memories if b.resident.id in memory.related_resident_ids]
    assert shared

    follow_up = await initiate_dialogue(a, b, mock_world)

    assert any("还记得" in message["text"] or "上次" in message["text"] for message in follow_up.messages)


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


def test_skill_teaching_boosts_student_and_friendship(mock_world):
    teacher = mock_world.agents[0]
    student = mock_world.agents[1]
    teacher.resident.skills["teaching"] = 0.95
    teacher.resident.skills["trading"] = 0.9
    student.resident.skills["trading"] = 0.1

    taught = maybe_conduct_skill_teaching(mock_world, teacher, student)

    assert taught is True
    assert student.resident.skills["trading"] > 0.1
    assert teacher.resident.skills["teaching"] > 0.95
    assert teacher.resident.reputation == pytest.approx(0.05)
    assert mock_world.get_relationship("a1", "a2") is not None
    assert mock_world.get_relationship("a2", "a1") is not None


def test_knowledge_teaching_requires_friendship_and_closes_gap(mock_world):
    teacher = mock_world.agents[0]
    student = mock_world.agents[1]
    mock_world.set_relationship(
        Relationship(
            from_id=teacher.resident.id,
            to_id=student.resident.id,
            type=RelationType.friendship,
            intensity=0.7,
            since="t",
            familiarity=0.5,
        )
    )
    teacher.resident.education.knowledge_level["social"] = 0.9
    student.resident.education.knowledge_level["social"] = 0.1

    taught = maybe_conduct_knowledge_teaching(mock_world, teacher, student)

    assert taught is True
    assert student.resident.education.knowledge_level["social"] > 0.1
    assert teacher.resident.reputation == pytest.approx(0.05)
    assert student.resident.education.course_history[-1].subject == "social"
