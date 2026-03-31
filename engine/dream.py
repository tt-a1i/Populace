"""Dream & life aspiration system: each resident carries a dream and makes progress toward it."""
from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any

from engine.types import DiaryEntry, Event

if TYPE_CHECKING:
    from engine.world import World

# ---------------------------------------------------------------------------
# Dream catalogue
# ---------------------------------------------------------------------------

DREAMS = [
    "成为富翁",
    "找到真爱",
    "建立家族",
    "成为名人",
    "环游世界",
    "成为匠人",
    "保卫家园",
    "留下传说",
]

# Map dream → (behavior/field check, increment per tick)
_DREAM_PROGRESS_RULES: list[tuple[str, float, str]] = [
    # (dream, per-tick increment when condition met, condition label)
    ("成为富翁",   0.003, "wealth"),
    ("找到真爱",   0.004, "romance"),
    ("建立家族",   0.004, "family"),
    ("成为名人",   0.003, "reputation"),
    ("环游世界",   0.005, "travel"),
    ("成为匠人",   0.003, "skills"),
    ("保卫家园",   0.003, "safety"),
    ("留下传说",   0.002, "diary"),
]

_FULFILLMENT_MESSAGES: dict[str, str] = {
    "成为富翁":   "终于积累了足够的财富，梦想成真！",
    "找到真爱":   "爱情降临，心中的梦想绽放了！",
    "建立家族":   "家族枝繁叶茂，梦想在温暖中实现！",
    "成为名人":   "声名远播，成为了镇上家喻户晓的人物！",
    "环游世界":   "走遍了山川大地，梦想的脚步终于停下！",
    "成为匠人":   "技艺精湛，成为了众人仰望的匠人！",
    "保卫家园":   "家园安宁，誓言已经兑现！",
    "留下传说":   "事迹流传于世，传说就此诞生！",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _assign_initial_dream(resident: Any, rng: random.Random) -> None:
    """Assign a random dream if none set yet."""
    if not resident.dream:
        resident.dream = rng.choice(DREAMS)
        resident.dream_progress = 0.0


def _compute_progress_delta(world: "World", resident: Any) -> float:
    """Return the progress increment for this tick based on resident state."""
    dream = resident.dream
    rule = next((r for r in _DREAM_PROGRESS_RULES if r[0] == dream), None)
    if rule is None:
        return 0.0
    _dream, per_tick, condition = rule

    # Check condition
    if condition == "wealth":
        if resident.wallet >= 500 or resident.coins >= 500:
            return per_tick
    elif condition == "romance":
        from engine.types import RelationshipStatus
        if resident.relationship_status in (RelationshipStatus.dating, RelationshipStatus.married):
            return per_tick
    elif condition == "family":
        if resident.family.children_ids or resident.family.partner_id:
            return per_tick
    elif condition == "reputation":
        if resident.reputation >= 0.3:
            return per_tick
    elif condition == "travel":
        if resident.travel_log:
            completed = [t for t in resident.travel_log if t.tick_returned > 0]
            if len(completed) >= 1:
                return per_tick
    elif condition == "skills":
        avg_skill = (sum(resident.skills.values()) / max(1, len(resident.skills))) if resident.skills else 0.0
        if avg_skill >= 0.3:
            return per_tick
    elif condition == "safety":
        if resident.safety_feeling >= 0.7:
            return per_tick
    elif condition == "diary":
        if len(resident.diary) >= 5:
            return per_tick

    # Small baseline progress regardless
    return per_tick * 0.1


def _fulfill_dream(world: "World", agent: Any, rng: random.Random) -> Event:
    """Mark dream as fulfilled, give mood boost, assign new dream, write diary entry."""
    resident = agent.resident
    old_dream = resident.dream
    msg = _FULFILLMENT_MESSAGES.get(old_dream, f"梦想\u300c{old_dream}\u300d终于实现了！")

    # Diary entry
    diary_id = f"dream-fulfilled-{world.current_tick}-{resident.id}"
    resident.diary.append(DiaryEntry(
        id=diary_id,
        content=msg,
        date=world.simulation_time(),
        tick=world.current_tick,
        mood_snapshot=resident.mood,
        tags=["dream", "milestone"],
        highlight=True,
    ))
    resident.diary = resident.diary[-50:]

    # Happiness boost
    world.shift_resident_mood(agent, 3, "dream_fulfilled")

    # Track fulfillments at world level
    if not hasattr(world, "_dream_fulfillments"):
        world._dream_fulfillments = []
    world._dream_fulfillments.append({
        "resident_id": resident.id,
        "resident_name": resident.name,
        "dream": old_dream,
        "tick": world.current_tick,
    })
    world._dream_fulfillments = world._dream_fulfillments[-100:]

    # Assign new dream (different from current)
    remaining = [d for d in DREAMS if d != old_dream]
    resident.dream = rng.choice(remaining)
    resident.dream_progress = 0.0

    return Event(
        id=f"dream-fulfilled-{world.current_tick}-{resident.id}",
        description=f"{resident.name} 的梦想「{old_dream}」实现了！{msg}",
        timestamp=world.simulation_time(),
        source="dream",
    )


# ---------------------------------------------------------------------------
# Main tick processing
# ---------------------------------------------------------------------------

def process_dream_tick(
    world: "World",
    rng: random.Random | None = None,
) -> list[Event]:
    """Update dream progress for all residents. Called periodically from simulation loop."""
    rng = rng or random
    events: list[Event] = []

    for agent in world.agents:
        resident = agent.resident
        if resident.age_stage == "child":
            continue

        # Ensure dream is set
        _assign_initial_dream(resident, rng)

        # Advance progress
        delta = _compute_progress_delta(world, resident)
        resident.dream_progress = round(min(1.0, resident.dream_progress + delta), 4)

        # Check fulfillment
        if resident.dream_progress >= 1.0:
            event = _fulfill_dream(world, agent, rng)
            events.append(event)

    return events


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def get_dream_stats(world: "World") -> dict:
    """Return aggregate dream statistics."""
    fulfillments = getattr(world, "_dream_fulfillments", [])
    dreams_fulfilled_total = len(fulfillments)

    # Count current dreams
    from collections import Counter
    dream_counts: Counter[str] = Counter()
    total_progress = 0.0
    active_count = 0
    for agent in world.agents:
        r = agent.resident
        if r.age_stage == "child":
            continue
        if r.dream:
            dream_counts[r.dream] += 1
            total_progress += r.dream_progress
            active_count += 1

    top_dreams = [
        {"dream": dream, "count": count}
        for dream, count in dream_counts.most_common(3)
    ]

    avg_progress = round(total_progress / max(1, active_count), 4)

    recent_fulfillments = fulfillments[-5:]

    return {
        "dreams_fulfilled_total": dreams_fulfilled_total,
        "top_dreams": top_dreams,
        "avg_progress": avg_progress,
        "recent_fulfillments": recent_fulfillments,
    }
