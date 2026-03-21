"""Social interaction module — dialogue triggering and coordination.

Implements the dialogue protocol from spec §11:
  - should_interact(): probability gate (proximity + extroversion + randomness)
  - initiate_dialogue(): up to 3-round LLM exchange + relationship delta
  - DialogueResult: typed return value carrying messages and delta
"""
from __future__ import annotations

import logging
import random
import re
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

_log = logging.getLogger(__name__)

from engine._optional_backend import load_backend_attr
from engine.types import Memory, RelationType, Relationship, RelationshipDelta, WorldConfig

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.world import World


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class DialogueResult:
    """Outcome of a completed dialogue exchange.

    Attributes:
        messages:           Ordered list of ``{speaker_id, text}`` dicts.
        relationship_delta: Sentiment score [-10, +10] (spec §11).
        is_important:       True when |delta| >= 5 → write to long-term memory.
    """
    messages: list[dict] = field(default_factory=list)
    relationship_delta: int = 0
    is_important: bool = False
    gossip: dict | None = None

    @classmethod
    def empty(cls) -> "DialogueResult":
        """Empty result returned on LLM failure."""
        return cls()


# ---------------------------------------------------------------------------
# Personality → extroversion score
# ---------------------------------------------------------------------------

_EXTROVERT_KEYWORDS = ("外向", "开朗", "活泼", "健谈", "社牛", "extrovert", "outgoing")
_INTROVERT_KEYWORDS = ("内向", "安静", "害羞", "社恐", "introvert", "shy")
_NEGATIVE_RELATION_TYPES = {RelationType.rivalry, RelationType.fear, RelationType.dislike}
_BUILD_DIALOGUE_PROMPT = load_backend_attr("backend.llm.prompts", "build_dialogue_prompt")
_BUILD_DIALOGUE_EVAL_PROMPT = load_backend_attr("backend.llm.prompts", "build_dialogue_eval_prompt")


def _build_dialogue_prompt_messages(
    speaker: "Agent",
    listener: "Agent",
    context: str,
) -> list[dict[str, str]]:
    if _BUILD_DIALOGUE_PROMPT is None:
        return [
            {
                "role": "system",
                "content": "请生成一句简短、自然的角色对话。",
            },
            {
                "role": "user",
                "content": (
                    f"说话者：{speaker.resident.name}\n"
                    f"听者：{listener.resident.name}\n"
                    f"上下文：{context}\n"
                    "请输出一句对话。"
                ),
            },
        ]

    return _BUILD_DIALOGUE_PROMPT(speaker.resident, listener.resident, context)


def _build_dialogue_eval_messages(context_history: str) -> list[dict[str, str]]:
    if _BUILD_DIALOGUE_EVAL_PROMPT is None:
        return [
            {
                "role": "system",
                "content": "请根据对话情绪输出一个 -10 到 10 的整数。",
            },
            {
                "role": "user",
                "content": context_history,
            },
        ]

    return _BUILD_DIALOGUE_EVAL_PROMPT(context_history)


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _delta_to_intensity(delta: float) -> float:
    return _clamp(delta / 10.0, -1.0, 1.0)


def _ensure_relationship(world: "World", from_id: str, to_id: str, since: str) -> Relationship:
    relationship = world.get_relationship(from_id, to_id)
    if relationship is None:
        relationship = Relationship(
            from_id=from_id,
            to_id=to_id,
            type=RelationType.knows,
            intensity=0.0,
            since=since,
            familiarity=0.0,
        )
        world.set_relationship(relationship)
    return relationship


def _extroversion(personality: str) -> float:
    """Return a [0.0, 1.0] extroversion score from personality text."""
    p = personality.lower()
    if any(k in p for k in _EXTROVERT_KEYWORDS):
        return 0.8
    if any(k in p for k in _INTROVERT_KEYWORDS):
        return 0.2
    return 0.5


# ---------------------------------------------------------------------------
# Trigger check
# ---------------------------------------------------------------------------

def should_interact(agent_a: "Agent", agent_b: "Agent", world: "World") -> bool:
    """Decide whether two agents should start a dialogue this tick (spec §11).

    Probability formula:
        p = clamp(base + extroversion_bonus, 0.05, 0.95)

    where base = 0.15, extroversion_bonus rewards both agents being
    extroverted (max +0.30), and existing familiarity/intensity adds
    a modest social bias.

    Args:
        agent_a: First agent.
        agent_b: Second agent.
        world:   Current world state, including relationship graph.

    Returns:
        True if a dialogue should be initiated this tick.
    """
    ext_a = _extroversion(agent_a.resident.personality)
    ext_b = _extroversion(agent_b.resident.personality)
    relationship = world.get_relationship(agent_a.resident.id, agent_b.resident.id)
    relation_bonus = 0.0
    if relationship is not None:
        relation_bonus = relationship.familiarity * 0.10 + relationship.intensity * 0.15
    # Average extroversion bonus: up to +0.30
    extroversion_bonus = ((ext_a + ext_b) / 2) * 0.30
    probability = min(0.95, max(0.05, 0.15 + extroversion_bonus + relation_bonus))
    return random.random() < probability


def evolve_relationship(
    agent_a: "Agent | str",
    agent_b: "Agent | str",
    delta: float,
    current_type: RelationType | str,
    *,
    intensity: float | None = None,
    familiarity: float | None = None,
) -> RelationType:
    """Return the next relationship type after a dialogue update.

    The public four-argument signature matches the task contract. The
    optional keyword-only context lets the simulation pass the already
    updated intensity/familiarity when available.
    """
    del agent_a, agent_b  # type context only; evolution depends on relationship state

    relation_type = current_type if isinstance(current_type, RelationType) else RelationType(current_type)
    current_intensity = 0.0 if intensity is None else intensity
    current_familiarity = 0.0 if familiarity is None else familiarity

    if relation_type is RelationType.friendship:
        if delta > 0 and current_intensity > 0.8:
            love_probability = _clamp(
                0.15 + (current_intensity - 0.8) * 1.5 + max(delta, 0.0) * 0.15,
                0.0,
                0.65,
            )
            if random.random() < love_probability:
                return RelationType.love
        if delta < 0 and (delta <= -0.35 or current_intensity < 0.25):
            return RelationType.rivalry
        return RelationType.friendship

    if relation_type is RelationType.rivalry:
        if delta > 0 and (delta >= 0.3 or current_intensity < 0.35):
            return RelationType.friendship
        return RelationType.rivalry

    if relation_type is RelationType.knows:
        if current_familiarity >= 0.2 and current_intensity >= 0.25:
            return RelationType.friendship if delta >= 0 else RelationType.rivalry
        return RelationType.knows

    return relation_type


def update_relationships_from_dialogue(
    world: "World",
    agent_a: "Agent",
    agent_b: "Agent",
    delta: float,
) -> list[RelationshipDelta]:
    """Apply a dialogue sentiment score to both directed relationship edges."""
    tick_time = world.simulation_time()
    return [
        _apply_relationship_delta(world, agent_a.resident.id, agent_b.resident.id, delta, tick_time),
        _apply_relationship_delta(world, agent_b.resident.id, agent_a.resident.id, delta, tick_time),
    ]


def _apply_relationship_delta(
    world: "World",
    from_id: str,
    to_id: str,
    delta: float,
    tick_time: str,
) -> RelationshipDelta:
    relationship = _ensure_relationship(world, from_id, to_id, tick_time)
    previous_type = relationship.type
    previous_intensity = relationship.intensity
    delta_intensity = _delta_to_intensity(delta)

    relationship.familiarity = round(
        _clamp(relationship.familiarity + 0.05 + abs(delta_intensity) * 0.10, 0.0, 1.0),
        4,
    )

    if relationship.type in _NEGATIVE_RELATION_TYPES:
        relationship.intensity = round(_clamp(relationship.intensity - delta_intensity, 0.0, 1.0), 4)
    elif relationship.type is RelationType.knows:
        relationship.intensity = round(_clamp(relationship.intensity + abs(delta_intensity), 0.0, 1.0), 4)
    else:
        relationship.intensity = round(_clamp(relationship.intensity + delta_intensity, 0.0, 1.0), 4)

    new_type = evolve_relationship(
        from_id,
        to_id,
        delta_intensity,
        relationship.type,
        intensity=relationship.intensity,
        familiarity=relationship.familiarity,
    )
    if new_type is RelationType.love:
        relationship.intensity = max(relationship.intensity, 0.85)
    elif new_type in {RelationType.friendship, RelationType.rivalry} and new_type is not previous_type:
        relationship.intensity = max(relationship.intensity, 0.3)

    relationship.type = new_type
    if relationship.type is not previous_type:
        relationship.reason = f"evolved_from:{previous_type.value}@{tick_time}"

    world.set_relationship(relationship)
    return RelationshipDelta(
        from_id=from_id,
        to_id=to_id,
        type=relationship.type.value,
        delta=round(relationship.intensity - previous_intensity, 4),
    )


def decay_relationships(world: "World", config: WorldConfig) -> list[RelationshipDelta]:
    """Naturally decay relationship intensity for every directed edge each tick."""
    updates: list[RelationshipDelta] = []

    for relationship in list(world.relationships.values()):
        if relationship.intensity <= 0:
            continue

        previous_type = relationship.type
        previous_intensity = relationship.intensity
        relationship.intensity = round(
            max(0.0, relationship.intensity - config.relationship_decay_rate),
            4,
        )
        delta = round(relationship.intensity - previous_intensity, 4)

        if relationship.intensity <= 0:
            if relationship.familiarity > 0:
                relationship.type = RelationType.knows
                relationship.reason = ""
                world.set_relationship(relationship)
                updates.append(
                    RelationshipDelta(
                        from_id=relationship.from_id,
                        to_id=relationship.to_id,
                        type=relationship.type.value,
                        delta=delta,
                    )
                )
            else:
                world.remove_relationship(relationship.from_id, relationship.to_id)
                updates.append(
                    RelationshipDelta(
                        from_id=relationship.from_id,
                        to_id=relationship.to_id,
                        type=previous_type.value,
                        delta=delta,
                    )
                )
            continue

        world.set_relationship(relationship)
        updates.append(
            RelationshipDelta(
                from_id=relationship.from_id,
                to_id=relationship.to_id,
                type=relationship.type.value,
                delta=delta,
            )
        )

    return updates


# ---------------------------------------------------------------------------
# Dialogue execution
# ---------------------------------------------------------------------------

async def initiate_dialogue(
    agent_a: "Agent",
    agent_b: "Agent",
    world: "World",
) -> DialogueResult:
    """Run a full dialogue exchange between two agents (spec §11).

    Flow:
      1. Agent A opens  (LLM, ≤50 token)
      2. Agent B replies (LLM, ≤50 token)
      3. Up to 3 rounds (6 messages total)
      4. LLM scores sentiment delta → update memory if important

    On any LLM failure the exchange ends early (returns what was collected
    so far, or an empty result if nothing was generated).

    Args:
        agent_a: The initiating speaker.
        agent_b: The responding speaker.
        world:   World state (used for simulation_time and memory storage).

    Returns:
        A :class:`DialogueResult` with messages and relationship_delta.
    """
    messages: list[dict] = []
    context_history = ""
    tick_time = world.simulation_time()

    # Up to 3 rounds = 6 turns (A, B, A, B, A, B)
    for round_idx in range(3):
        for speaker, listener in ((agent_a, agent_b), (agent_b, agent_a)):
            prompt_msgs = _build_dialogue_prompt_messages(
                speaker,
                listener,
                context_history or "两人偶遇",
            )
            text = await speaker.call_llm(prompt_msgs, max_tokens=50)
            if text is None:
                # LLM failure → end dialogue early
                break
            text = text.strip()
            if not text:
                break
            messages.append({"speaker_id": speaker.resident.id, "text": text})
            context_history += f"{speaker.resident.name}：{text}\n"
        else:
            continue
        break  # inner loop broke — exit outer loop too

    if not messages:
        return DialogueResult.empty()

    # Evaluate relationship delta
    delta = 0
    eval_text = await agent_a.call_llm(_build_dialogue_eval_messages(context_history), max_tokens=10)
    if eval_text is not None:
        match = re.search(r'-?\d+', eval_text.strip())
        if match:
            delta = max(-10, min(10, int(match.group())))
        else:
            _log.warning("Could not parse dialogue score from LLM: %r", eval_text)
            delta = 0

    is_important = abs(delta) >= 5

    # Memorise important dialogues (spec §11)
    if is_important:
        summary = f"与 {agent_b.resident.name} 的对话：{context_history[:100]}"
        mem_a = Memory(
            id=str(uuid.uuid4()),
            content=summary,
            timestamp=tick_time,
            importance=0.8,
            emotion="happy" if delta > 0 else "sad",
        )
        agent_a.memory_stream.add(mem_a)
        mem_b = Memory(
            id=str(uuid.uuid4()),
            content=f"与 {agent_a.resident.name} 的对话：{context_history[:100]}",
            timestamp=tick_time,
            importance=0.8,
            emotion="happy" if delta > 0 else "sad",
        )
        agent_b.memory_stream.add(mem_b)

    # Social interaction costs energy for both participants
    agent_a.resident.energy = max(0.0, agent_a.resident.energy - 0.02)
    agent_b.resident.energy = max(0.0, agent_b.resident.energy - 0.02)

    # Gossip: speaker A may share info about an absent third party
    from engine.gossip import generate_gossip, spread_gossip
    gossip = generate_gossip(agent_a, world)
    if gossip is not None:
        spread_gossip(agent_b, gossip, world)

    return DialogueResult(
        messages=messages,
        relationship_delta=delta,
        is_important=is_important,
        gossip=gossip,
    )
