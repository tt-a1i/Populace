"""Resident life-goal system.

Each resident is assigned one long-term goal at creation time.
Goals progress automatically each tick and award achievements,
mood boosts, and bulletin announcements on completion.
"""
from __future__ import annotations

import random
from typing import Any, List

from engine.types import LifeGoal, RelationType


# ---------------------------------------------------------------------------
# Goal definitions
# ---------------------------------------------------------------------------

GOAL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "social_butterfly",
        "name": "社交蝴蝶",
        "description": "结交10个朋友",
        "target": 10.0,
        "reward": "social_butterfly_goal",
        "icon": "🦋",
        "personality_keywords": ["外向", "热情", "友善", "活泼", "社交"],
    },
    {
        "type": "wealthy",
        "name": "富甲一方",
        "description": "积累1000金币",
        "target": 1000.0,
        "reward": "wealthy_goal",
        "icon": "💰",
        "personality_keywords": ["勤劳", "精明", "商业", "节俭", "hardworking"],
    },
    {
        "type": "scholar",
        "name": "博学多才",
        "description": "所有知识领域达到0.5以上",
        "target": 1.0,
        "reward": "scholar_goal",
        "icon": "📚",
        "personality_keywords": ["好学", "聪明", "求知", "安静", "内向"],
    },
    {
        "type": "famous",
        "name": "名扬四海",
        "description": "声望超过0.9",
        "target": 0.9,
        "reward": "famous_goal",
        "icon": "⭐",
        "personality_keywords": ["自信", "表现", "领导", "魅力", "ambitious"],
    },
    {
        "type": "family_person",
        "name": "家庭美满",
        "description": "结婚并有子女",
        "target": 2.0,
        "reward": "family_person_goal",
        "icon": "👨‍👩‍👧",
        "personality_keywords": ["温柔", "caring", "家庭", "善良", "体贴"],
    },
    {
        "type": "explorer",
        "name": "探索先锋",
        "description": "访问所有区域",
        "target": 1.0,
        "reward": "explorer_goal",
        "icon": "🗺️",
        "personality_keywords": ["冒险", "好奇", "探索", "adventurous", "active"],
    },
    {
        "type": "artist",
        "name": "艺术大师",
        "description": "举办5场文化活动",
        "target": 5.0,
        "reward": "artist_goal",
        "icon": "🎨",
        "personality_keywords": ["艺术", "创意", "浪漫", "文艺", "creative"],
    },
]

GOAL_MAP: dict[str, dict[str, Any]] = {g["type"]: g for g in GOAL_DEFINITIONS}


# ---------------------------------------------------------------------------
# Goal assignment
# ---------------------------------------------------------------------------

def assign_life_goal(personality: str, seed: int | None = None) -> LifeGoal:
    """Pick a goal influenced by the resident's personality."""
    rng = random.Random(seed)
    personality_lower = personality.lower()

    weights: list[float] = []
    for goal_def in GOAL_DEFINITIONS:
        match_count = sum(
            1 for keyword in goal_def["personality_keywords"]
            if keyword in personality_lower
        )
        weights.append(1.0 + match_count * 2.0)

    chosen = rng.choices(GOAL_DEFINITIONS, weights=weights, k=1)[0]
    return LifeGoal(
        type=chosen["type"],
        progress=0.0,
        target=chosen["target"],
        reward=chosen["reward"],
    )


# ---------------------------------------------------------------------------
# Progress tracking
# ---------------------------------------------------------------------------

def _count_friends(world: Any, resident_id: str) -> int:
    count = 0
    for rel in world.relationships.values():
        if rel.from_id == resident_id and rel.type in (RelationType.friendship, RelationType.love) and rel.intensity >= 0.5:
            count += 1
    return count


def _knowledge_progress(resident: Any) -> float:
    knowledge = getattr(resident, "education", None)
    if knowledge is None:
        return 0.0
    levels = getattr(knowledge, "knowledge_level", {})
    if not levels:
        return 0.0
    if all(v >= 0.5 for v in levels.values()):
        return 1.0
    return round(sum(min(v, 0.5) for v in levels.values()) / (len(levels) * 0.5), 3)


def _family_progress(resident: Any) -> float:
    family = getattr(resident, "family", None)
    if family is None:
        return 0.0
    score = 0.0
    if getattr(family, "partner_id", None):
        score += 1.0
    children = getattr(family, "children_ids", [])
    if children:
        score += 1.0
    return score


def _cultural_event_count(world: Any, resident_id: str) -> int:
    events = getattr(world, "cultural_events", [])
    return sum(1 for e in events if getattr(e, "organizer_id", "") == resident_id)


def _zone_visit_progress(state: Any, resident_id: str) -> float:
    all_zones = {zone.id for zone in getattr(state.world, "zones", [])}
    if not all_zones:
        return 1.0
    visited = getattr(state, "_zones_visited", {}).get(resident_id, set())
    return round(len(visited & all_zones) / len(all_zones), 3)


def compute_goal_progress(state: Any, resident: Any) -> float:
    """Compute current progress toward a resident's life goal."""
    goal = getattr(resident, "life_goal", None)
    if goal is None or goal.completed:
        return goal.progress if goal else 0.0

    goal_type = goal.type
    if goal_type == "social_butterfly":
        return float(min(_count_friends(state.world, resident.id), goal.target))
    elif goal_type == "wealthy":
        return float(min(getattr(resident, "wallet", 0.0) + getattr(resident, "coins", 0), goal.target))
    elif goal_type == "scholar":
        return _knowledge_progress(resident)
    elif goal_type == "famous":
        return float(min(getattr(resident, "reputation", 0.0), goal.target))
    elif goal_type == "family_person":
        return float(min(_family_progress(resident), goal.target))
    elif goal_type == "explorer":
        return _zone_visit_progress(state, resident.id)
    elif goal_type == "artist":
        return float(min(_cultural_event_count(state.world, resident.id), goal.target))
    return 0.0


def track_goals(state: Any) -> list[dict[str, Any]]:
    """Update goal progress for all residents. Returns list of completion events."""
    completions: list[dict[str, Any]] = []
    current_tick = getattr(state.world, "current_tick", 0)

    for agent in state.world.agents:
        resident = agent.resident
        goal = getattr(resident, "life_goal", None)
        if goal is None or goal.completed:
            continue

        new_progress = compute_goal_progress(state, resident)
        goal.progress = max(0.0, min(new_progress, goal.target))

        if goal.progress >= goal.target:
            goal.completed = True
            goal.completed_tick = current_tick
            completions.append({
                "resident_id": resident.id,
                "resident_name": resident.name,
                "goal_type": goal.type,
                "reward": goal.reward,
                "tick": current_tick,
            })

    return completions


def apply_goal_completions(state: Any, completions: list[dict[str, Any]]) -> None:
    """Award achievement, boost mood, and post bulletin for completed goals."""
    for event in completions:
        resident_id = event["resident_id"]
        goal_type = event["goal_type"]
        goal_def = GOAL_MAP.get(goal_type, {})

        # Unlock achievement
        if hasattr(state, "_achievements_store"):
            state._achievements_store.setdefault(resident_id, set()).add(f"goal_{goal_type}")
        if hasattr(state, "_achievement_unlock_meta"):
            state._achievement_unlock_meta[(resident_id, f"goal_{goal_type}")] = event["tick"]

        # Boost mood
        for agent in state.world.agents:
            if agent.resident.id == resident_id:
                agent.resident.mood = "ecstatic"
                break

        # Post bulletin
        if hasattr(state, "_bulletin_posts"):
            from engine.types import BulletinPost
            post = BulletinPost(
                id=f"goal_{resident_id}_{event['tick']}",
                author_id=resident_id,
                content=f"{event['resident_name']}达成了人生目标「{goal_def.get('name', goal_type)}」！{goal_def.get('description', '')}",
                tick=event["tick"],
                category="goal",
                topic="life_goal",
                subject_id=resident_id,
                tone="positive",
                author_name=event["resident_name"],
            )
            resident_names = {a.resident.id: a.resident.name for a in state.world.agents}
            state._bulletin_posts.insert(0, {
                "id": post.id,
                "author_id": post.author_id,
                "author_name": resident_names.get(post.author_id, post.author_name),
                "content": post.content,
                "tick": post.tick,
                "likes": [],
                "category": post.category,
                "topic": post.topic,
                "subject_id": post.subject_id,
                "tone": post.tone,
            })
            state._bulletin_posts = state._bulletin_posts[:120]


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def get_resident_goal_view(state: Any, resident_id: str) -> dict[str, Any] | None:
    """Build the API response for a resident's life goal."""
    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            goal = getattr(agent.resident, "life_goal", None)
            if goal is None:
                return None
            goal_def = GOAL_MAP.get(goal.type, {})
            pct = round(goal.progress / goal.target * 100, 1) if goal.target > 0 else 0.0
            return {
                "type": goal.type,
                "name": goal_def.get("name", goal.type),
                "description": goal_def.get("description", ""),
                "icon": goal_def.get("icon", "🎯"),
                "progress": round(goal.progress, 2),
                "target": goal.target,
                "percentage": min(pct, 100.0),
                "completed": goal.completed,
                "completed_tick": goal.completed_tick if goal.completed else None,
                "reward": goal.reward,
            }
    return None
