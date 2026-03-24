from __future__ import annotations

from dataclasses import asdict
from typing import Any

from engine.types import Achievement, RelationType


ACHIEVEMENTS: list[dict[str, str]] = [
    {
        "id": "social_butterfly",
        "name": "社交达人",
        "description": "friendship > 0.8 的朋友达到 5 个",
        "category": "social",
        "icon": "🤝",
    },
    {
        "id": "social_star",
        "name": "人气王",
        "description": "被 10 位以上居民认识",
        "category": "social",
        "icon": "🌟",
    },
    {
        "id": "mood_master",
        "name": "情绪稳定",
        "description": "连续 50 tick 保持 mood > 0.5",
        "category": "mind",
        "icon": "🧘",
    },
    {
        "id": "shopping_maniac",
        "name": "购物狂",
        "description": "交易次数达到 20 次",
        "category": "economy",
        "icon": "🛍️",
    },
    {
        "id": "workaholic",
        "name": "工作狂",
        "description": "连续工作 30 tick",
        "category": "work",
        "icon": "💼",
    },
    {
        "id": "explorer",
        "name": "探索者",
        "description": "访问过所有区域",
        "category": "exploration",
        "icon": "🧭",
    },
    {
        "id": "civic_voice",
        "name": "投票积极分子",
        "description": "参与 5 次以上投票",
        "category": "civic",
        "icon": "🗳️",
    },
    {
        "id": "good_neighbor",
        "name": "好邻居",
        "description": "安慰抑郁居民 3 次",
        "category": "care",
        "icon": "💗",
    },
]

ACHIEVEMENT_MAP: dict[str, dict[str, str]] = {item["id"]: item for item in ACHIEVEMENTS}


def _ensure_tracking_state(state: Any) -> None:
    if not hasattr(state, "_achievements_store"):
        state._achievements_store = {}
    if not hasattr(state, "_achievement_unlock_meta"):
        state._achievement_unlock_meta = {}
    if not hasattr(state, "_zones_visited"):
        state._zones_visited = {}
    if not hasattr(state, "_mood_positive_streaks"):
        state._mood_positive_streaks = {}
    if not hasattr(state, "_work_streaks"):
        state._work_streaks = {}
    if not hasattr(state, "_comfort_counts"):
        state._comfort_counts = {}


def _set_resident_achievement(state: Any, resident_id: str, achievement_id: str, tick: int) -> None:
    achievement_def = ACHIEVEMENT_MAP[achievement_id]
    resident = next((agent.resident for agent in state.world.agents if agent.resident.id == resident_id), None)
    if resident is None:
        return
    unlocked = Achievement(
        id=achievement_def["id"],
        name=achievement_def["name"],
        description=achievement_def["description"],
        category=achievement_def["category"],
        unlocked_at_tick=tick,
        icon=achievement_def["icon"],
    )
    resident.achievements = [item for item in resident.achievements if item.id != achievement_id]
    resident.achievements.append(unlocked)


def sync_tracking_for_tick(state: Any) -> None:
    _ensure_tracking_state(state)
    for agent in state.world.agents:
        resident = agent.resident
        zone = state.world.get_zone_for_resident(resident)
        if zone is not None:
            state._zones_visited.setdefault(resident.id, set()).add(zone.id)
        if state.world.mood_score(resident.mood) > 0.5:
            state._mood_positive_streaks[resident.id] = state._mood_positive_streaks.get(resident.id, 0) + 1
        else:
            state._mood_positive_streaks[resident.id] = 0
        occupation = getattr(resident, "occupation", "unemployed")
        if occupation not in {"unemployed", "student", "infant"}:
            state._work_streaks[resident.id] = state._work_streaks.get(resident.id, 0) + 1
        else:
            state._work_streaks[resident.id] = 0


def record_comfort_action(state: Any, comforter_id: str) -> None:
    _ensure_tracking_state(state)
    state._comfort_counts[comforter_id] = state._comfort_counts.get(comforter_id, 0) + 1


def _friendship_counterparts(state: Any, resident_id: str) -> set[str]:
    result: set[str] = set()
    for (from_id, to_id), relationship in state.world.relationships.items():
        if relationship.type != RelationType.friendship or relationship.intensity <= 0.8:
            continue
        if from_id == resident_id:
            result.add(to_id)
        if to_id == resident_id:
            result.add(from_id)
    return result


def _known_counterparts(state: Any, resident_id: str) -> set[str]:
    result: set[str] = set()
    for from_id, to_id in state.world.relationships:
        if from_id == resident_id:
            result.add(to_id)
        if to_id == resident_id:
            result.add(from_id)
    return result


def _trade_count(state: Any, resident_id: str) -> int:
    count = 0
    for entry in getattr(state, "_trade_history", []):
        if entry.get("seller_id") == resident_id or entry.get("buyer_id") == resident_id:
            count += 1
    return count


def _vote_count(state: Any, resident_id: str) -> int:
    vote_ids: set[str] = set()
    for vote in [*getattr(state, "_active_votes", []), *getattr(state, "_vote_history", [])]:
        if resident_id in vote.get("votes_by_resident", {}):
            vote_ids.add(vote.get("id", f"vote-{len(vote_ids)}"))
    return len(vote_ids)


def build_resident_achievement_view(state: Any, resident_id: str) -> list[dict[str, Any]]:
    _ensure_tracking_state(state)
    unlocked = state._achievements_store.get(resident_id, set())
    rows: list[dict[str, Any]] = []
    for item in ACHIEVEMENTS:
        unlock_tick = state._achievement_unlock_meta.get((resident_id, item["id"]))
        rows.append(
            {
                **item,
                "unlocked": item["id"] in unlocked,
                "unlocked_at_tick": unlock_tick,
            }
        )
    return rows


def build_leaderboard(state: Any) -> list[dict[str, Any]]:
    _ensure_tracking_state(state)
    rows: list[dict[str, Any]] = []
    for agent in state.world.agents:
        resident = agent.resident
        achievements = build_resident_achievement_view(state, resident.id)
        unlocked = [item for item in achievements if item["unlocked"]]
        rows.append(
            {
                "resident_id": resident.id,
                "resident_name": resident.name,
                "unlocked_count": len(unlocked),
                "achievements": sorted(
                    unlocked,
                    key=lambda item: (
                        item["unlocked_at_tick"] if item["unlocked_at_tick"] is not None else 10**9,
                        item["name"],
                    ),
                ),
            }
        )
    rows.sort(key=lambda item: (-item["unlocked_count"], item["resident_name"], item["resident_id"]))
    return rows


def check_and_unlock(state: Any) -> list[dict[str, Any]]:
    _ensure_tracking_state(state)
    unlocks: list[dict[str, Any]] = []
    all_zone_ids = {zone.id for zone in getattr(state.world, "zones", [])}

    for agent in state.world.agents:
        resident = agent.resident
        resident_id = resident.id
        unlocked = state._achievements_store.setdefault(resident_id, set())

        def unlock_if_needed(achievement_id: str) -> None:
            if achievement_id in unlocked:
                return
            achievement_def = ACHIEVEMENT_MAP[achievement_id]
            unlocked.add(achievement_id)
            state._achievement_unlock_meta[(resident_id, achievement_id)] = state.world.current_tick
            _set_resident_achievement(state, resident_id, achievement_id, state.world.current_tick)
            unlocks.append(
                {
                    "resident_id": resident_id,
                    "resident_name": resident.name,
                    "achievement_id": achievement_id,
                    "achievement_name": achievement_def["name"],
                    "category": achievement_def["category"],
                    "unlocked_at_tick": state.world.current_tick,
                    "icon": achievement_def["icon"],
                }
            )

        if len(_friendship_counterparts(state, resident_id)) >= 5:
            unlock_if_needed("social_butterfly")
        if len(_known_counterparts(state, resident_id)) >= 10:
            unlock_if_needed("social_star")
        if state._mood_positive_streaks.get(resident_id, 0) >= 50:
            unlock_if_needed("mood_master")
        if _trade_count(state, resident_id) >= 20:
            unlock_if_needed("shopping_maniac")
        if state._work_streaks.get(resident_id, 0) >= 30:
            unlock_if_needed("workaholic")
        if all_zone_ids and state._zones_visited.get(resident_id, set()) >= all_zone_ids:
            unlock_if_needed("explorer")
        if _vote_count(state, resident_id) >= 5:
            unlock_if_needed("civic_voice")
        if state._comfort_counts.get(resident_id, 0) >= 3:
            unlock_if_needed("good_neighbor")

    return unlocks


def dump_resident_achievements(resident: Any) -> list[dict[str, Any]]:
    return [asdict(item) if hasattr(item, "__dataclass_fields__") else dict(item) for item in getattr(resident, "achievements", [])]
