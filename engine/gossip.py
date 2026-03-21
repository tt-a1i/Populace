"""Gossip propagation module.

During social dialogues, agents may share information about absent third
parties.  This nudges the listener's relationship with the mentioned target
positively or negatively.
"""
from __future__ import annotations

import random
import uuid
from typing import TYPE_CHECKING

from engine.types import Memory, RelationType, Relationship

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.world import World


_GOSSIP_PROBABILITY = 0.30
_GOOD_GOSSIP_DELTA = 0.08
_BAD_GOSSIP_DELTA = -0.06

_GOOD_TEMPLATES = [
    "{name}最近很不错，大家都很喜欢他/她。",
    "{name}是个好人，你应该多和他/她交流。",
    "我觉得{name}很值得信任。",
    "听说{name}帮了不少人，人缘很好。",
]
_BAD_TEMPLATES = [
    "听说{name}最近和大家关系不太好。",
    "{name}有时候让我感觉有点不舒服。",
    "我不太确定{name}是否可信。",
    "听说{name}做了一些让人失望的事情。",
]


def generate_gossip(speaker: "Agent", world: "World") -> dict | None:
    """Pick a third party and generate a gossip snippet about them.

    Returns a dict with keys: target_id, target_name, content, is_positive.
    Returns None if gossip does not trigger or no suitable target exists.
    """
    if random.random() >= _GOSSIP_PROBABILITY:
        return None

    speaker_id = speaker.resident.id
    known_ids = [to_id for (from_id, to_id) in world.relationships if from_id == speaker_id]
    if not known_ids:
        return None

    target_id = random.choice(known_ids)
    target_agent = next((a for a in world.agents if a.resident.id == target_id), None)
    if target_agent is None:
        return None

    rel = world.get_relationship(speaker_id, target_id)
    is_positive = rel is None or rel.type not in (
        RelationType.rivalry,
        RelationType.dislike,
        RelationType.fear,
    )

    target_name = target_agent.resident.name
    templates = _GOOD_TEMPLATES if is_positive else _BAD_TEMPLATES
    content = random.choice(templates).format(name=target_name)

    return {
        "target_id": target_id,
        "target_name": target_name,
        "content": content,
        "is_positive": is_positive,
    }


def spread_gossip(listener: "Agent", gossip: dict, world: "World") -> None:
    """Apply gossip effect to the listener's relationship with the gossip target.

    Good gossip nudges the relationship positively; bad gossip negatively.
    Also stores a short memory of hearing the gossip.
    """
    target_id = gossip["target_id"]
    is_positive = gossip["is_positive"]
    content = gossip["content"]

    # Don't let gossip affect the subject themselves
    if listener.resident.id == target_id:
        return

    rel = world.get_relationship(listener.resident.id, target_id)
    if rel is None:
        rel = Relationship(
            from_id=listener.resident.id,
            to_id=target_id,
            type=RelationType.knows,
            intensity=0.0,
            since=world.simulation_time(),
            familiarity=0.0,
        )
        world.set_relationship(rel)

    delta = _GOOD_GOSSIP_DELTA if is_positive else _BAD_GOSSIP_DELTA
    rel.intensity = round(min(1.0, max(0.0, rel.intensity + delta)), 4)
    rel.familiarity = round(min(1.0, rel.familiarity + 0.03), 4)
    world.set_relationship(rel)

    mem = Memory(
        id=str(uuid.uuid4()),
        content=f"[八卦] {content}",
        timestamp=world.simulation_time(),
        importance=0.3,
        emotion="curious",
    )
    listener.memory_stream.add(mem)
