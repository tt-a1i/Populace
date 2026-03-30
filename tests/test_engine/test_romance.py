"""Tests for romance system: confession, dating, marriage, divorce."""
from __future__ import annotations

import pytest

from engine.types import (
    Building,
    Relationship,
    RelationshipDelta,
    RelationshipStatus,
    RelationType,
    Resident,
    WorldConfig,
)
from engine.world import World
from engine.generative_agent import GenerativeAgent
from engine.romance import (
    _is_available,
    _execute_divorce,
    get_resident_romance,
    get_romance_stats,
    handle_spouse_death,
    process_romance_tick,
)


def _make_world_with_couple(
    intensity: float = 0.8,
    status_a: RelationshipStatus = RelationshipStatus.single,
    status_b: RelationshipStatus = RelationshipStatus.single,
) -> tuple[World, "GenerativeAgent", "GenerativeAgent"]:
    cfg = WorldConfig(tick_per_day=48, llm_call_probability=0.0)
    world = World(cfg)
    world.current_tick = 100

    home = Building(id="home1", type="home", name="Home", capacity=4, position=(1, 1))
    home2 = Building(id="home2", type="home", name="Home 2", capacity=4, position=(5, 5))
    world.add_building(home)
    world.add_building(home2)

    r_a = Resident(id="ra", name="小明", personality="开朗", age_days=300, home_building_id="home1")
    r_b = Resident(id="rb", name="小红", personality="温柔", age_days=280, home_building_id="home2")
    r_a.relationship_status = status_a
    r_b.relationship_status = status_b
    agent_a = GenerativeAgent(r_a)
    agent_b = GenerativeAgent(r_b)
    world.add_agent(agent_a)
    world.add_agent(agent_b)

    # Set up mutual love relationships
    world.set_relationship(Relationship(
        from_id="ra", to_id="rb", type=RelationType.love,
        intensity=intensity, since="t", familiarity=0.5,
    ))
    world.set_relationship(Relationship(
        from_id="rb", to_id="ra", type=RelationType.love,
        intensity=intensity, since="t", familiarity=0.5,
    ))

    return world, agent_a, agent_b


# ---------------------------------------------------------------------------
# F1: relationship_status field
# ---------------------------------------------------------------------------

def test_resident_defaults_to_single():
    r = Resident(id="r1", name="Test", personality="calm")
    assert r.relationship_status == RelationshipStatus.single


def test_relationship_status_enum_values():
    assert RelationshipStatus.single.value == "single"
    assert RelationshipStatus.dating.value == "dating"
    assert RelationshipStatus.married.value == "married"
    assert RelationshipStatus.divorced.value == "divorced"


# ---------------------------------------------------------------------------
# F2: Confession
# ---------------------------------------------------------------------------

def test_confession_transitions_to_dating():
    import random
    world, agent_a, agent_b = _make_world_with_couple(intensity=0.75)

    # Force confession to trigger and succeed
    rng = random.Random(42)
    rng.random = lambda: 0.0  # type: ignore[method-assign]

    events, deltas = process_romance_tick(world, rng)

    assert agent_a.resident.relationship_status == RelationshipStatus.dating
    assert agent_b.resident.relationship_status == RelationshipStatus.dating
    assert agent_a.resident.family.partner_id == "rb"
    assert agent_b.resident.family.partner_id == "ra"
    assert any("表白成功" in e.description for e in events)


# ---------------------------------------------------------------------------
# E1: Confession blocked for taken residents
# ---------------------------------------------------------------------------

def test_confession_blocked_when_already_dating():
    import random
    world, agent_a, agent_b = _make_world_with_couple(
        intensity=0.75,
        status_a=RelationshipStatus.dating,
    )
    agent_a.resident.family.partner_id = "other"

    rng = random.Random(42)
    rng.random = lambda: 0.0  # type: ignore[method-assign]

    events, deltas = process_romance_tick(world, rng)

    # Should not have confessed since agent_a is dating someone else
    assert not any("表白" in e.description for e in events)


# ---------------------------------------------------------------------------
# F4: Proposal → Marriage
# ---------------------------------------------------------------------------

def test_proposal_transitions_to_married():
    import random
    world, agent_a, agent_b = _make_world_with_couple(
        intensity=0.95,
        status_a=RelationshipStatus.dating,
        status_b=RelationshipStatus.dating,
    )
    agent_a.resident.family.partner_id = "rb"
    agent_b.resident.family.partner_id = "ra"

    rng = random.Random(42)
    rng.random = lambda: 0.0  # type: ignore[method-assign]

    events, deltas = process_romance_tick(world, rng)

    assert agent_a.resident.relationship_status == RelationshipStatus.married
    assert agent_b.resident.relationship_status == RelationshipStatus.married
    assert agent_b.resident.home_building_id == agent_a.resident.home_building_id
    assert any("结婚" in e.description for e in events)


# ---------------------------------------------------------------------------
# F5: Shared economy
# ---------------------------------------------------------------------------

def test_married_couple_shares_wallet():
    import random
    world, agent_a, agent_b = _make_world_with_couple(
        intensity=0.5,
        status_a=RelationshipStatus.married,
        status_b=RelationshipStatus.married,
    )
    agent_a.resident.family.partner_id = "rb"
    agent_b.resident.family.partner_id = "ra"
    agent_a.resident.wallet = 100.0
    agent_b.resident.wallet = 0.0

    rng = random.Random(42)
    events, deltas = process_romance_tick(world, rng)

    assert agent_a.resident.wallet == 50.0
    assert agent_b.resident.wallet == 50.0


# ---------------------------------------------------------------------------
# F6: Quarrel and Divorce
# ---------------------------------------------------------------------------

def test_divorce_clears_partner_and_status():
    world, agent_a, agent_b = _make_world_with_couple(
        intensity=0.1,
        status_a=RelationshipStatus.married,
        status_b=RelationshipStatus.married,
    )
    agent_a.resident.family.partner_id = "rb"
    agent_b.resident.family.partner_id = "ra"

    _execute_divorce(world, agent_a, agent_b)

    assert agent_a.resident.relationship_status == RelationshipStatus.divorced
    assert agent_b.resident.relationship_status == RelationshipStatus.divorced
    assert agent_a.resident.family.partner_id is None
    assert agent_b.resident.family.partner_id is None


# ---------------------------------------------------------------------------
# E2: Divorce clears both partner references
# ---------------------------------------------------------------------------

def test_divorce_clears_both_partner_references():
    world, agent_a, agent_b = _make_world_with_couple(
        intensity=0.1,
        status_a=RelationshipStatus.married,
        status_b=RelationshipStatus.married,
    )
    agent_a.resident.family.partner_id = "rb"
    agent_b.resident.family.partner_id = "ra"

    _execute_divorce(world, agent_a, agent_b)

    assert agent_a.resident.family.partner_id is None
    assert agent_b.resident.family.partner_id is None


# ---------------------------------------------------------------------------
# E3: Spouse death
# ---------------------------------------------------------------------------

def test_spouse_death_clears_surviving_partner():
    world, agent_a, agent_b = _make_world_with_couple(
        intensity=0.9,
        status_a=RelationshipStatus.married,
        status_b=RelationshipStatus.married,
    )
    agent_a.resident.family.partner_id = "rb"
    agent_b.resident.family.partner_id = "ra"

    handle_spouse_death(world, "ra")

    assert agent_b.resident.family.partner_id is None
    assert agent_b.resident.relationship_status == RelationshipStatus.single


# ---------------------------------------------------------------------------
# F7: Romance stats
# ---------------------------------------------------------------------------

def test_romance_stats():
    world, agent_a, agent_b = _make_world_with_couple(
        intensity=0.9,
        status_a=RelationshipStatus.married,
        status_b=RelationshipStatus.married,
    )
    agent_a.resident.family.partner_id = "rb"
    agent_b.resident.family.partner_id = "ra"

    stats = get_romance_stats(world)
    assert stats["marriages"] == 1
    assert stats["couples_count"] == 1
    assert stats["dating_pairs"] == 0


# ---------------------------------------------------------------------------
# F8: Resident romance info
# ---------------------------------------------------------------------------

def test_resident_romance_info():
    world, agent_a, agent_b = _make_world_with_couple(
        intensity=0.85,
        status_a=RelationshipStatus.dating,
        status_b=RelationshipStatus.dating,
    )
    agent_a.resident.family.partner_id = "rb"
    agent_b.resident.family.partner_id = "ra"

    info = get_resident_romance(world, "ra")
    assert info["relationship_status"] == "dating"
    assert info["partner"]["name"] == "小红"
    assert info["love_intensity"] == 0.85


# ---------------------------------------------------------------------------
# Helper: _is_available
# ---------------------------------------------------------------------------

def test_is_available_for_single_and_divorced():
    world, agent_a, agent_b = _make_world_with_couple(intensity=0.5)
    assert _is_available(world, "ra") is True

    agent_a.resident.relationship_status = RelationshipStatus.divorced
    assert _is_available(world, "ra") is True

    agent_a.resident.relationship_status = RelationshipStatus.married
    assert _is_available(world, "ra") is False
