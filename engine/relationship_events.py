"""Relationship threshold event system.

When a directed relationship's intensity crosses a key threshold for the first
time, a one-time milestone event fires:

    friendship >= 0.8  →  "best_friends"   (成为挚友)
    love      >= 0.9   →  "confession"     (告白)
    rivalry   >= 0.8   →  "public_argument"(公开争吵)

Each event:
  - Produces a special Chinese-language dialogue line.
  - Updates the moods of both participants.
  - Nudges the mood of residents who share the same location.
"""
from __future__ import annotations

import random
from typing import TYPE_CHECKING

from engine.types import RelationType

if TYPE_CHECKING:
    from engine.world import World


# ---------------------------------------------------------------------------
# Data tables
# ---------------------------------------------------------------------------

_THRESHOLDS = [
    (RelationType.friendship, 0.8, "best_friends"),
    (RelationType.love, 0.9, "confession"),
    (RelationType.rivalry, 0.8, "public_argument"),
]

_DIALOGUES: dict[str, list[str]] = {
    "best_friends": [
        "{from_name}和{to_name}相视而笑：'我觉得我们是真正的朋友了！'",
        "{from_name}拍了拍{to_name}的肩膀：'有你这个朋友，真的很开心。'",
        "'{to_name}，我们认识这么久了，你已经是我最好的朋友了。' {from_name}说道。",
    ],
    "confession": [
        "{from_name}鼓起勇气对{to_name}说：'我……我喜欢你。'",
        "{from_name}声音颤抖：'{to_name}，我一直想告诉你——我爱你。'",
        "月光下，{from_name}握住{to_name}的手：'可以做我的恋人吗？'",
    ],
    "public_argument": [
        "{from_name}大声指责{to_name}：'你这样做太过分了！'",
        "两人当众争吵，{from_name}怒道：'{to_name}，我们之间的事没完！'",
        "{from_name}与{to_name}在广场上爆发冲突，吸引了路人围观。",
    ],
}

# Resident moods are constrained to: happy | sad | angry | neutral
_PARTICIPANT_MOODS: dict[str, tuple[str, str]] = {
    "best_friends":    ("happy", "happy"),
    "confession":      ("happy", "happy"),
    "public_argument": ("angry", "angry"),
}
_NEARBY_MOOD: dict[str, str] = {
    "best_friends":    "happy",
    "confession":      "happy",
    "public_argument": "sad",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def check_relationship_events(world: "World", state: object) -> list[dict]:
    """Return new relationship milestone events that fired this tick.

    Each returned dict has keys: from_id, to_id, from_name, to_name,
    event_type, dialogue.  Side-effects: updates resident moods.

    A ``_rel_events_fired`` set is attached to *state* (with hasattr guard so
    that test environments using ``__new__`` to bypass ``__init__`` work
    correctly).
    """
    if not hasattr(state, "_rel_events_fired"):
        state._rel_events_fired = set()  # type: ignore[attr-defined]

    events: list[dict] = []

    for (from_id, to_id), rel in list(world.relationships.items()):
        for rel_type, threshold, event_type in _THRESHOLDS:
            if rel.type != rel_type:
                continue
            if rel.intensity < threshold:
                continue

            fire_key = (from_id, to_id, event_type)
            if fire_key in state._rel_events_fired:  # type: ignore[attr-defined]
                continue
            state._rel_events_fired.add(fire_key)  # type: ignore[attr-defined]

            from_agent = next((a for a in world.agents if a.resident.id == from_id), None)
            to_agent = next((a for a in world.agents if a.resident.id == to_id), None)
            if from_agent is None or to_agent is None:
                continue

            from_name = from_agent.resident.name
            to_name = to_agent.resident.name

            template = random.choice(_DIALOGUES[event_type])
            dialogue = template.format(from_name=from_name, to_name=to_name)

            # Update moods of the two participants
            from_mood, to_mood = _PARTICIPANT_MOODS[event_type]
            from_agent.resident.mood = from_mood
            to_agent.resident.mood = to_mood

            # Nudge nearby co-located residents
            nearby_mood = _NEARBY_MOOD[event_type]
            location = from_agent.resident.location
            if location:
                for agent in world.agents:
                    if (
                        agent.resident.id not in (from_id, to_id)
                        and agent.resident.location == location
                    ):
                        agent.resident.mood = nearby_mood

            events.append(
                {
                    "from_id": from_id,
                    "to_id": to_id,
                    "from_name": from_name,
                    "to_name": to_name,
                    "event_type": event_type,
                    "dialogue": dialogue,
                }
            )

    return events
