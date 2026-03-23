from __future__ import annotations

import random
import re
import uuid
import hashlib
from dataclasses import asdict
from typing import TYPE_CHECKING

from engine.generative_agent import GenerativeAgent
from engine.types import (
    PopulationEvent,
    PopulationResidentSnapshot,
    RelationType,
    Relationship,
    RelationshipDelta,
    Resident,
)

if TYPE_CHECKING:
    from engine.world import World


ELDERLY_AGE_DAYS = 365
DEATH_AGE_DAYS = 500
DAILY_DEATH_PROBABILITY = 0.05
DAILY_BIRTH_PROBABILITY = 0.02
NEWBORN_PARENT_BOND = 0.7
MUTATION_TRAITS = (
    "好奇",
    "坚韧",
    "温柔",
    "敏锐",
    "乐天",
    "谨慎",
    "倔强",
    "机灵",
)
NAME_POOL = (
    "阿芽",
    "小禾",
    "青岚",
    "安木",
    "星竹",
    "山岚",
    "知夏",
    "松月",
)
SKIN_COLORS = (
    "#F2D3B1",
    "#E5B887",
    "#D39A6A",
    "#B97C52",
    "#8A5A3C",
    "#5C3A27",
)
HAIR_STYLES = ("short", "long", "spiky", "bald", "ponytail")
HAIR_COLORS = (
    "#1F2937",
    "#5B4636",
    "#8B5A2B",
    "#D4A373",
    "#C084FC",
    "#F8FAFC",
)
OUTFIT_COLORS = (
    "#2563EB",
    "#059669",
    "#DC2626",
    "#D97706",
    "#7C3AED",
    "#DB2777",
    "#0F766E",
    "#4B5563",
)


def is_elderly(resident: Resident) -> bool:
    return resident.age_days > ELDERLY_AGE_DAYS


def snapshot_resident(resident: Resident) -> PopulationResidentSnapshot:
    return PopulationResidentSnapshot(
        id=resident.id,
        name=resident.name,
        personality=resident.personality,
        mood=resident.mood,
        location=resident.location,
        x=resident.x,
        y=resident.y,
        home_building_id=resident.home_building_id,
        skin_color=resident.skin_color,
        hair_style=resident.hair_style,
        hair_color=resident.hair_color,
        outfit_color=resident.outfit_color,
        coins=resident.coins,
        occupation=resident.occupation,
        inventory=list(resident.inventory),
        energy=resident.energy,
        age_days=resident.age_days,
        goals=list(resident.goals),
    )


def _split_traits(personality: str) -> list[str]:
    parts = [part.strip() for part in re.split(r"[，,、/|；; ]+", personality) if part.strip()]
    return parts or [personality.strip() or "普通"]


def inherit_personality(parent_a: Resident, parent_b: Resident, rng: random.Random | None = None) -> str:
    rng = rng or random
    traits_a = _split_traits(parent_a.personality)
    traits_b = _split_traits(parent_b.personality)

    keep_a = max(1, min(len(traits_a), len(traits_a) // 2 or 1))
    keep_b = max(1, min(len(traits_b), len(traits_b) // 2 or 1))
    inherited = rng.sample(traits_a, k=keep_a) + rng.sample(traits_b, k=keep_b)

    deduped: list[str] = []
    for trait in inherited:
        if trait not in deduped:
            deduped.append(trait)

    mutation = rng.choice(MUTATION_TRAITS)
    if mutation not in deduped:
        deduped.append(mutation)

    return "、".join(deduped[:4])


def _pick_birth_position(world: "World", parent_a: Resident, parent_b: Resident) -> tuple[int, int, str | None]:
    home_id = parent_a.home_building_id or parent_b.home_building_id
    if home_id:
        home = world.get_building(home_id)
        if home is not None:
            return home.position[0], home.position[1], home_id
    return parent_a.x, parent_a.y, parent_a.home_building_id or parent_b.home_building_id


def _generate_child_name(parent_a: Resident, parent_b: Resident, rng: random.Random | None = None) -> str:
    rng = rng or random
    shared_prefix = ""
    if parent_a.name and parent_b.name and parent_a.name[0] == parent_b.name[0]:
        shared_prefix = parent_a.name[0]
    return f"{shared_prefix}{rng.choice(NAME_POOL)}"


def generate_resident_appearance(resident_id: str) -> dict[str, str]:
    """Derive a deterministic appearance tuple from a resident id inside the engine layer."""
    digest = hashlib.sha256(resident_id.encode("utf-8")).digest()
    return {
        "skin_color": SKIN_COLORS[digest[0] % len(SKIN_COLORS)],
        "hair_style": HAIR_STYLES[digest[1] % len(HAIR_STYLES)],
        "hair_color": HAIR_COLORS[digest[2] % len(HAIR_COLORS)],
        "outfit_color": OUTFIT_COLORS[digest[3] % len(OUTFIT_COLORS)],
    }


def _create_parent_child_relationships(
    world: "World",
    parent_ids: list[str],
    child_id: str,
    current_time: str,
) -> list[RelationshipDelta]:
    deltas: list[RelationshipDelta] = []
    for parent_id in parent_ids:
        for from_id, to_id in ((parent_id, child_id), (child_id, parent_id)):
            world.set_relationship(
                Relationship(
                    from_id=from_id,
                    to_id=to_id,
                    type=RelationType.knows,
                    intensity=NEWBORN_PARENT_BOND,
                    familiarity=0.9,
                    since=current_time,
                    reason="新生家庭纽带",
                )
            )
            deltas.append(
                RelationshipDelta(
                    from_id=from_id,
                    to_id=to_id,
                    type=RelationType.knows.value,
                    delta=NEWBORN_PARENT_BOND,
                )
            )
    return deltas


def process_daily_population(
    world: "World",
    rng: random.Random | None = None,
) -> tuple[list[PopulationEvent], list[RelationshipDelta], dict[str, int]]:
    rng = rng or random
    population_events: list[PopulationEvent] = []
    relationship_deltas: list[RelationshipDelta] = []
    summary = {"births": 0, "deaths": 0}

    for agent in world.agents:
        agent.resident.age_days += 1

    deceased_ids: list[str] = []
    for agent in list(world.agents):
        resident = agent.resident
        if resident.age_days <= DEATH_AGE_DAYS:
            continue
        if rng.random() >= DAILY_DEATH_PROBABILITY:
            continue
        deceased_ids.append(resident.id)
        population_events.append(
            PopulationEvent(
                event_type="death",
                resident_id=resident.id,
                resident_name=resident.name,
                resident=snapshot_resident(resident),
                summary=f"{resident.name} 在 {resident.age_days} 天后离世。",
            )
        )

    for resident_id in deceased_ids:
        world.remove_agent(resident_id)
        summary["deaths"] += 1

    agents_by_id = {agent.resident.id: agent for agent in world.agents}
    seen_pairs: set[tuple[str, str]] = set()
    current_time = world.simulation_time()

    for relationship in list(world.relationships.values()):
        if relationship.type != RelationType.love or relationship.intensity < 0.9:
            continue
        reverse = world.get_relationship(relationship.to_id, relationship.from_id)
        if reverse is None or reverse.type != RelationType.love or reverse.intensity < 0.9:
            continue

        pair = tuple(sorted((relationship.from_id, relationship.to_id)))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)

        if rng.random() >= DAILY_BIRTH_PROBABILITY:
            continue

        parent_a = agents_by_id.get(pair[0])
        parent_b = agents_by_id.get(pair[1])
        if parent_a is None or parent_b is None:
            continue

        child_id = f"resident-{uuid.uuid4().hex[:8]}"
        child_name = _generate_child_name(parent_a.resident, parent_b.resident, rng)
        child_personality = inherit_personality(parent_a.resident, parent_b.resident, rng)
        x, y, home_id = _pick_birth_position(world, parent_a.resident, parent_b.resident)
        appearance = generate_resident_appearance(child_id)
        child = Resident(
            id=child_id,
            name=child_name,
            personality=child_personality,
            goals=["探索世界", "认识家人"],
            mood="calm",
            location=None,
            x=x,
            y=y,
            home_building_id=home_id,
            skin_color=appearance["skin_color"],
            hair_style=appearance["hair_style"],
            hair_color=appearance["hair_color"],
            outfit_color=appearance["outfit_color"],
            occupation="infant",
            energy=1.0,
            age_days=0,
        )
        child_agent = GenerativeAgent(child)
        world.add_agent(child_agent)
        if home_id:
            home = world.get_building(home_id)
            if home is not None:
                world.enter_building(child_agent, home)

        relationship_deltas.extend(
            _create_parent_child_relationships(world, [pair[0], pair[1]], child_id, current_time)
        )
        population_events.append(
            PopulationEvent(
                event_type="birth",
                resident_id=child.id,
                resident_name=child.name,
                resident=snapshot_resident(child),
                parent_ids=[pair[0], pair[1]],
                parent_names=[parent_a.resident.name, parent_b.resident.name],
                summary=f"{parent_a.resident.name} 与 {parent_b.resident.name} 迎来了新居民 {child.name}。",
            )
        )
        summary["births"] += 1

    return population_events, relationship_deltas, summary


def serialize_population_event(event: PopulationEvent) -> dict[str, object]:
    return asdict(event)
