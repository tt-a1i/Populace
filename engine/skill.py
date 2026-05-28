"""Resident skill tree & growth system.

Eight skill tracks, each with levels 0-5 and an XP bar.
Occupation determines which skills gain XP during work ticks.
"""
from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from engine.types import Resident

# ---------------------------------------------------------------------------
# Skill catalogue
# ---------------------------------------------------------------------------

SKILL_DEFS: dict[str, str] = {
    "farming":   "农耕",
    "crafting":  "工艺",
    "trading":   "经商",
    "healing":   "医术",
    "combat":    "武艺",
    "music":     "音乐",
    "cooking":   "厨艺",
    "diplomacy": "外交",
}

SKILL_IDS = list(SKILL_DEFS.keys())

MAX_LEVEL = 5

# XP needed to go from level n to level n+1
def _xp_to_next(level: int) -> float:
    return float(max(1, level + 1) * 100)


# Occupation → primary skills that gain XP during work
OCCUPATION_SKILLS: dict[str, list[str]] = {
    "farmer":     ["farming", "crafting"],
    "merchant":   ["trading", "diplomacy"],
    "healer":     ["healing", "cooking"],
    "guard":      ["combat", "farming"],
    "artist":     ["music", "crafting"],
    "teacher":    ["diplomacy", "music"],
    "cook":       ["cooking", "farming"],
    "doctor":     ["healing", "diplomacy"],
    "shopkeeper": ["trading", "crafting"],
    "blacksmith": ["crafting", "combat"],
    "tailor":     ["crafting", "music"],
    "fisherman":  ["farming", "cooking"],
    "clergy":     ["diplomacy", "healing"],
    "banker":     ["trading", "diplomacy"],
}

# ---------------------------------------------------------------------------
# Skill dataclass helpers
# ---------------------------------------------------------------------------

def make_skill(skill_id: str, level: int = 1) -> "SkillEntry":
    from engine.types import Skill
    return Skill(
        skill_id=skill_id,
        name=SKILL_DEFS.get(skill_id, skill_id),
        level=level,
        xp=0.0,
        xp_to_next=_xp_to_next(level),
    )


def init_skill_tree(resident: Any, rng: random.Random | None = None) -> None:
    """Initialise a resident's skill_tree with 2-3 random level-1 skills."""
    from engine.types import Skill
    r = rng if rng is not None else random.Random(hash(resident.id))
    tree: dict = getattr(resident, "skill_tree", None)
    if tree:
        return  # already initialised
    sample_size = r.randint(2, 3)
    chosen = r.sample(SKILL_IDS, sample_size)
    resident.skill_tree = {
        sid: Skill(
            skill_id=sid,
            name=SKILL_DEFS[sid],
            level=1,
            xp=0.0,
            xp_to_next=_xp_to_next(1),
        )
        for sid in chosen
    }


# ---------------------------------------------------------------------------
# XP gain & level-up
# ---------------------------------------------------------------------------

_XP_PER_TICK_BASE = 8.0
_XP_VARIANCE = 0.4  # ±40%


def gain_skill_xp(resident: Any, skill_id: str, amount: float) -> bool:
    """Add XP to a skill; returns True if the skill levelled up."""
    tree: dict = getattr(resident, "skill_tree", None)
    if tree is None:
        return False
    if skill_id not in tree:
        from engine.types import Skill
        tree[skill_id] = Skill(
            skill_id=skill_id,
            name=SKILL_DEFS.get(skill_id, skill_id),
            level=0,
            xp=0.0,
            xp_to_next=_xp_to_next(0),
        )
    entry = tree[skill_id]
    if entry.level >= MAX_LEVEL:
        return False
    entry.xp += amount
    if entry.xp >= entry.xp_to_next:
        entry.xp -= entry.xp_to_next
        entry.level = min(MAX_LEVEL, entry.level + 1)
        entry.xp_to_next = _xp_to_next(entry.level)
        return True
    return False


def process_skill_tick(state: Any) -> list[str]:
    """Called every 10 ticks from world.tick() — grants occupation XP to working residents."""
    world = getattr(state, "world", state)
    rng: random.Random = getattr(world, "rng", random.Random())
    events: list[str] = []

    for agent in getattr(world, "agents", []):
        resident = agent.resident
        occupation = str(getattr(resident, "occupation", "unemployed")).lower()
        if occupation == "unemployed":
            continue
        skill_ids = OCCUPATION_SKILLS.get(occupation, [])
        if not skill_ids:
            continue
        # Pick one skill to gain XP this tick
        sid = rng.choice(skill_ids)
        variance = 1.0 + rng.uniform(-_XP_VARIANCE, _XP_VARIANCE)
        amount = round(_XP_PER_TICK_BASE * variance, 2)
        levelled_up = gain_skill_xp(resident, sid, amount)
        if levelled_up:
            tree = resident.skill_tree or {}
            level = tree[sid].level if sid in tree else 0
            events.append(f"{resident.name}的{SKILL_DEFS.get(sid, sid)}技能提升至 Lv.{level}！")

    return events


# ---------------------------------------------------------------------------
# Distribution stats
# ---------------------------------------------------------------------------

def get_skill_distribution(state: Any) -> dict[str, dict]:
    """Return per-skill stats: avg_level, max_level, masters_count (level>=4)."""
    world = getattr(state, "world", state)
    agents = getattr(world, "agents", [])

    result: dict[str, dict] = {
        sid: {"avg_level": 0.0, "max_level": 0, "masters_count": 0}
        for sid in SKILL_IDS
    }

    if not agents:
        return result

    totals: dict[str, float] = {sid: 0.0 for sid in SKILL_IDS}
    counts: dict[str, int] = {sid: 0 for sid in SKILL_IDS}

    for agent in agents:
        tree: dict = getattr(agent.resident, "skill_tree", None) or {}
        for sid, entry in tree.items():
            if sid not in result:
                continue
            level = int(getattr(entry, "level", 0))
            totals[sid] += level
            counts[sid] += 1
            if level > result[sid]["max_level"]:
                result[sid]["max_level"] = level
            if level >= 4:
                result[sid]["masters_count"] += 1

    for sid in SKILL_IDS:
        if counts[sid] > 0:
            result[sid]["avg_level"] = round(totals[sid] / counts[sid], 2)

    return result


def get_skill_masters(state: Any) -> dict[str, list[dict]]:
    """Return up to 3 masters (level>=4) per skill."""
    world = getattr(state, "world", state)
    agents = getattr(world, "agents", [])
    masters: dict[str, list[dict]] = {sid: [] for sid in SKILL_IDS}

    for agent in agents:
        tree: dict = getattr(agent.resident, "skill_tree", None) or {}
        for sid, entry in tree.items():
            if sid not in masters:
                continue
            level = int(getattr(entry, "level", 0))
            if level >= 4:
                masters[sid].append({
                    "id": agent.resident.id,
                    "name": agent.resident.name,
                    "level": level,
                })

    for sid in masters:
        masters[sid] = sorted(masters[sid], key=lambda x: -x["level"])[:3]

    return masters


def get_resident_skills(resident: Any) -> list[dict]:
    """Return a resident's skill_tree as a serialisable list."""
    tree: dict = getattr(resident, "skill_tree", None) or {}
    result = []
    for sid, entry in tree.items():
        result.append({
            "skill_id": sid,
            "name": getattr(entry, "name", SKILL_DEFS.get(sid, sid)),
            "level": int(getattr(entry, "level", 0)),
            "xp": float(getattr(entry, "xp", 0.0)),
            "xp_to_next": float(getattr(entry, "xp_to_next", 100.0)),
        })
    return sorted(result, key=lambda x: -x["level"])
