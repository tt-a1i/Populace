"""Romance lifecycle: confession, dating, proposal, marriage, quarrel, divorce."""
from __future__ import annotations

import random
from dataclasses import asdict
from typing import TYPE_CHECKING, Any

from engine.types import (
    Event,
    RelationshipDelta,
    RelationshipStatus,
    RelationType,
)

if TYPE_CHECKING:
    from engine.world import World

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------
CONFESSION_INTENSITY = 0.7
PROPOSAL_INTENSITY = 0.9
QUARREL_INTENSITY = 0.3
DIVORCE_INTENSITY = 0.15

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mood_modifier(mood: str) -> float:
    """Return a modifier [0.5, 1.3] based on mood for confession/proposal success."""
    return {
        "ecstatic": 1.3, "happy": 1.15, "content": 1.05,
        "neutral": 1.0, "sad": 0.7, "angry": 0.6,
        "fearful": 0.65, "tired": 0.75,
    }.get(mood, 1.0)


def _personality_chemistry(a_personality: str, b_personality: str) -> float:
    """Return a rough compatibility bonus [0.0, 0.2]."""
    shared = set(a_personality.replace("、", ",").split(",")) & set(b_personality.replace("、", ",").split(","))
    return min(0.2, len(shared) * 0.05)


def _is_available(world: "World", resident_id: str) -> bool:
    """True if the resident is single or divorced (not dating/married to someone else)."""
    agent = world.get_agent(resident_id)
    if agent is None:
        return False
    status = agent.resident.relationship_status
    return status in (RelationshipStatus.single, RelationshipStatus.divorced)


# ---------------------------------------------------------------------------
# Romance processing — called each tick from the simulation loop
# ---------------------------------------------------------------------------

def process_romance_tick(
    world: "World",
    rng: random.Random | None = None,
) -> tuple[list[Event], list[RelationshipDelta]]:
    """Process romance events for a single tick.

    Returns events and relationship deltas for the tick state.
    """
    rng = rng or random
    events: list[Event] = []
    deltas: list[RelationshipDelta] = []
    seen_pairs: set[tuple[str, str]] = set()
    agents_by_id = {agent.resident.id: agent for agent in world.agents}

    for relationship in list(world.relationships.values()):
        if relationship.type != RelationType.love:
            continue
        pair = tuple(sorted((relationship.from_id, relationship.to_id)))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)

        reverse = world.get_relationship(relationship.to_id, relationship.from_id)
        if reverse is None or reverse.type != RelationType.love:
            continue

        agent_a = agents_by_id.get(pair[0])
        agent_b = agents_by_id.get(pair[1])
        if agent_a is None or agent_b is None:
            continue

        a = agent_a.resident
        b = agent_b.resident
        intensity = min(relationship.intensity, reverse.intensity)

        # --- Married couple: check for quarrel / divorce ---
        if a.relationship_status == RelationshipStatus.married and b.relationship_status == RelationshipStatus.married:
            if a.family.partner_id == b.id:
                new_events, new_deltas = _process_married_couple(world, agent_a, agent_b, intensity, rng)
                events.extend(new_events)
                deltas.extend(new_deltas)
            continue

        # --- Dating couple: check for proposal ---
        if a.relationship_status == RelationshipStatus.dating and b.relationship_status == RelationshipStatus.dating:
            if a.family.partner_id == b.id:
                new_events, new_deltas = _process_dating_couple(world, agent_a, agent_b, intensity, rng)
                events.extend(new_events)
                deltas.extend(new_deltas)
            continue

        # --- Both available: check for confession ---
        if _is_available(world, a.id) and _is_available(world, b.id):
            if intensity >= CONFESSION_INTENSITY:
                new_events, new_deltas = _try_confession(world, agent_a, agent_b, intensity, rng)
                events.extend(new_events)
                deltas.extend(new_deltas)

    return events, deltas


# ---------------------------------------------------------------------------
# Confession
# ---------------------------------------------------------------------------

def _try_confession(
    world: "World", agent_a: Any, agent_b: Any, intensity: float,
    rng: random.Random | None = None,
) -> tuple[list[Event], list[RelationshipDelta]]:
    rng = rng or random
    events: list[Event] = []
    deltas: list[RelationshipDelta] = []

    a, b = agent_a.resident, agent_b.resident

    # Only attempt confession with a probability per tick
    if rng.random() >= 0.08:
        return events, deltas

    base_chance = 0.5 + (intensity - CONFESSION_INTENSITY) * 1.0
    mood_mod = (_mood_modifier(a.mood) + _mood_modifier(b.mood)) / 2
    chemistry = _personality_chemistry(a.personality, b.personality)
    success_chance = min(0.95, max(0.1, base_chance * mood_mod + chemistry))

    if rng.random() < success_chance:
        # Success: start dating
        a.relationship_status = RelationshipStatus.dating
        b.relationship_status = RelationshipStatus.dating
        a.family.partner_id = b.id
        b.family.partner_id = a.id
        events.append(Event(
            id=f"confession-{world.current_tick}-{a.id}-{b.id}",
            description=f"{a.name} 向 {b.name} 表白成功，两人开始交往。",
            timestamp=world.simulation_time(),
            source="romance",
        ))
        for from_id, to_id in ((a.id, b.id), (b.id, a.id)):
            deltas.append(RelationshipDelta(from_id=from_id, to_id=to_id, type="love", delta=0.05))
    else:
        events.append(Event(
            id=f"confession-fail-{world.current_tick}-{a.id}-{b.id}",
            description=f"{a.name} 向 {b.name} 表白，但被婉拒了。",
            timestamp=world.simulation_time(),
            source="romance",
        ))

    return events, deltas


# ---------------------------------------------------------------------------
# Dating → Proposal → Marriage
# ---------------------------------------------------------------------------

def _process_dating_couple(
    world: "World", agent_a: Any, agent_b: Any, intensity: float,
    rng: random.Random | None = None,
) -> tuple[list[Event], list[RelationshipDelta]]:
    rng = rng or random
    events: list[Event] = []
    deltas: list[RelationshipDelta] = []

    if intensity < PROPOSAL_INTENSITY:
        return events, deltas

    # Proposal attempt each tick with low probability
    if rng.random() >= 0.05:
        return events, deltas

    a, b = agent_a.resident, agent_b.resident
    mood_mod = (_mood_modifier(a.mood) + _mood_modifier(b.mood)) / 2
    success_chance = min(0.95, max(0.2, 0.6 * mood_mod))

    if rng.random() < success_chance:
        # Marriage!
        a.relationship_status = RelationshipStatus.married
        b.relationship_status = RelationshipStatus.married
        # Share home — move partner to the proposer's home
        if a.home_building_id and not b.home_building_id:
            b.home_building_id = a.home_building_id
        elif b.home_building_id and not a.home_building_id:
            a.home_building_id = b.home_building_id
        elif a.home_building_id and b.home_building_id:
            b.home_building_id = a.home_building_id

        events.append(Event(
            id=f"marriage-{world.current_tick}-{a.id}-{b.id}",
            description=f"{a.name} 与 {b.name} 结婚了！",
            timestamp=world.simulation_time(),
            source="romance",
        ))
        for from_id, to_id in ((a.id, b.id), (b.id, a.id)):
            deltas.append(RelationshipDelta(from_id=from_id, to_id=to_id, type="love", delta=0.05))

    return events, deltas


# ---------------------------------------------------------------------------
# Married couple: shared economy, quarrel, divorce
# ---------------------------------------------------------------------------

def _process_married_couple(
    world: "World", agent_a: Any, agent_b: Any, intensity: float,
    rng: random.Random | None = None,
) -> tuple[list[Event], list[RelationshipDelta]]:
    rng = rng or random
    events: list[Event] = []
    deltas: list[RelationshipDelta] = []

    a, b = agent_a.resident, agent_b.resident

    # Shared economy: equalize wallets each tick
    total_wallet = a.wallet + b.wallet
    a.wallet = round(total_wallet / 2, 2)
    b.wallet = round(total_wallet / 2, 2)

    # Quarrel
    if intensity < QUARREL_INTENSITY:
        if rng.random() < 0.15:
            events.append(Event(
                id=f"quarrel-{world.current_tick}-{a.id}-{b.id}",
                description=f"{a.name} 与 {b.name} 发生了争吵。",
                timestamp=world.simulation_time(),
                source="romance",
            ))
            world.shift_resident_mood(agent_a, -1, "quarrel")
            world.shift_resident_mood(agent_b, -1, "quarrel")

    # Divorce
    if intensity < DIVORCE_INTENSITY:
        if rng.random() < 0.1:
            _execute_divorce(world, agent_a, agent_b)
            events.append(Event(
                id=f"divorce-{world.current_tick}-{a.id}-{b.id}",
                description=f"{a.name} 与 {b.name} 离婚了。",
                timestamp=world.simulation_time(),
                source="romance",
            ))

    return events, deltas


# ---------------------------------------------------------------------------
# Divorce execution
# ---------------------------------------------------------------------------

def _execute_divorce(world: "World", agent_a: Any, agent_b: Any) -> None:
    a, b = agent_a.resident, agent_b.resident
    a.relationship_status = RelationshipStatus.divorced
    b.relationship_status = RelationshipStatus.divorced
    a.family.partner_id = None
    b.family.partner_id = None
    # Revert home: give b a different home if possible
    if a.home_building_id == b.home_building_id:
        alternate = next(
            (bld for bld in world.buildings if bld.type == "home" and bld.id != a.home_building_id
             and len(world.get_occupants(bld.id)) < bld.capacity),
            None,
        )
        if alternate is not None:
            b.home_building_id = alternate.id


# ---------------------------------------------------------------------------
# Spouse death handling
# ---------------------------------------------------------------------------

def handle_spouse_death(world: "World", deceased_id: str) -> None:
    """Clear the surviving spouse's partner references when a married resident dies."""
    for agent in world.agents:
        r = agent.resident
        if r.family.partner_id == deceased_id:
            r.family.partner_id = None
            r.relationship_status = RelationshipStatus.single


# ---------------------------------------------------------------------------
# Romance stats for API
# ---------------------------------------------------------------------------

def get_romance_stats(world: "World") -> dict[str, int]:
    married = 0
    dating = 0
    divorced = 0
    for agent in world.agents:
        status = agent.resident.relationship_status
        if status == RelationshipStatus.married:
            married += 1
        elif status == RelationshipStatus.dating:
            dating += 1
        elif status == RelationshipStatus.divorced:
            divorced += 1
    return {
        "couples_count": married // 2 + dating // 2,
        "marriages": married // 2,
        "dating_pairs": dating // 2,
        "divorces": divorced,
    }


def get_resident_romance(world: "World", resident_id: str) -> dict[str, Any]:
    agent = world.get_agent(resident_id)
    if agent is None:
        return {"relationship_status": "single", "partner": None, "love_intensity": 0.0}
    r = agent.resident
    partner_info = None
    love_intensity = 0.0
    if r.family.partner_id:
        partner_agent = world.get_agent(r.family.partner_id)
        if partner_agent is not None:
            partner_info = {
                "id": partner_agent.resident.id,
                "name": partner_agent.resident.name,
            }
        rel = world.get_relationship(r.id, r.family.partner_id)
        if rel is not None:
            love_intensity = rel.intensity
    return {
        "relationship_status": r.relationship_status.value,
        "partner": partner_info,
        "love_intensity": round(love_intensity, 3),
    }
