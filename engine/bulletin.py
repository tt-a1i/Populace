"""Announcement board generation and social propagation helpers."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict
import uuid
from typing import TYPE_CHECKING, Any, Iterable

from engine.types import BulletinPost, RelationType, Relationship

if TYPE_CHECKING:
    from engine.types import Resident
    from engine.world import World


_TOPIC_LABELS = {
    "spring_festival": "春日祭",
    "summer_festival": "夏日烧烤",
    "autumn_festival": "秋收感恩",
    "winter_festival": "冬日篝火",
    "limited_coffee": "限量咖啡豆",
    "shop_shortage": "商店缺货",
    "social_star": "人气王",
}

_POSITIVE_RELATION_DELTA = 0.08
_NEGATIVE_RELATION_DELTA = -0.06


def build_bulletin_post(resident: "Resident", *, tick: int, experience: dict[str, Any]) -> BulletinPost | None:
    content = str(experience.get("content", "")).strip()
    if not content:
        return None
    return BulletinPost(
        id=f"bulletin-{resident.id}-{tick}-{uuid.uuid4().hex[:6]}",
        author_id=resident.id,
        content=content,
        tick=tick,
        likes=list(experience.get("likes", [])),
        category=str(experience.get("category", "social")),
        topic=str(experience.get("topic", experience.get("category", "social"))),
        subject_id=str(experience.get("subject_id", resident.id)),
        tone=str(experience.get("tone", "positive")),
    )


def process_bulletin_reactions(
    world: "World",
    posts: Iterable[BulletinPost],
    *,
    residents: Iterable["Resident"] | None = None,
) -> dict[str, int]:
    audience = list(residents) if residents is not None else [agent.resident for agent in world.agents]
    reads = 0
    likes = 0

    for post in posts:
        subject_id = post.subject_id or post.author_id
        for resident in audience:
            if resident.id == post.author_id:
                continue
            reads += 1
            relationship = world.get_relationship(resident.id, subject_id)
            if relationship is None:
                relationship = Relationship(
                    from_id=resident.id,
                    to_id=subject_id,
                    type=RelationType.knows,
                    intensity=0.0,
                    familiarity=0.0,
                    since=world.simulation_time(),
                    reason="bulletin",
                )

            delta = 0.0
            if post.tone == "positive":
                delta = _POSITIVE_RELATION_DELTA
                relationship.type = RelationType.friendship if relationship.intensity + delta >= 0.2 else relationship.type
            elif post.tone == "negative":
                delta = _NEGATIVE_RELATION_DELTA
                relationship.type = RelationType.dislike

            relationship.intensity = round(min(1.0, max(0.0, relationship.intensity + delta)), 4)
            relationship.familiarity = round(min(1.0, relationship.familiarity + 0.03), 4)
            relationship.reason = f"bulletin:{post.topic}"
            world.set_relationship(relationship)

            if post.tone == "negative":
                world.adjust_resident_reputation(subject_id, -0.03, f"bulletin:{post.topic}")

            if _should_like_post(resident, post, relationship) and resident.id not in post.likes:
                post.likes.append(resident.id)
                likes += 1

    return {"reads": reads, "likes": likes}


def summarize_hot_topics(posts: Iterable[BulletinPost], *, limit: int = 6) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "topic": "",
        "label": "",
        "category": "social",
        "post_count": 0,
        "like_count": 0,
        "tone_score": 0,
    })

    for post in posts:
        row = grouped[post.topic]
        row["topic"] = post.topic
        row["label"] = topic_label(post.topic)
        row["category"] = post.category
        row["post_count"] += 1
        row["like_count"] += len(post.likes)
        if post.tone == "positive":
            row["tone_score"] += 1
        elif post.tone == "negative":
            row["tone_score"] -= 1

    if not grouped:
        return []

    max_weight = max((row["post_count"] + row["like_count"] * 0.25) for row in grouped.values())
    topics: list[dict[str, Any]] = []
    for row in grouped.values():
        weight = row["post_count"] + row["like_count"] * 0.25
        tone_score = row["tone_score"]
        sentiment = "positive" if tone_score > 0 else "negative" if tone_score < 0 else "neutral"
        topics.append(
            {
                "topic": row["topic"],
                "label": row["label"],
                "category": row["category"],
                "post_count": row["post_count"],
                "heat": round(weight / max_weight, 3) if max_weight else 0.0,
                "sentiment": sentiment,
            }
        )

    topics.sort(key=lambda item: (-item["heat"], -item["post_count"], item["label"]))
    return topics[:limit]


def topic_label(topic: str) -> str:
    if topic in _TOPIC_LABELS:
        return _TOPIC_LABELS[topic]
    return topic.replace("_", " ").strip() or "公共话题"


def infer_bulletin_experience(state: Any, resident: "Resident") -> dict[str, Any] | None:
    tick = int(getattr(state.world, "current_tick", 0))
    recent_window = max(12, state.world.config.tick_per_day // 2)

    achievement_hits = [
        (achievement_id, unlocked_tick)
        for (resident_id, achievement_id), unlocked_tick in getattr(state, "_achievement_unlock_meta", {}).items()
        if resident_id == resident.id and tick - int(unlocked_tick) <= recent_window
    ]
    if achievement_hits:
        achievement_id, _ = max(achievement_hits, key=lambda item: item[1])
        return {
            "category": "achievement",
            "topic": achievement_id,
            "tone": "positive",
            "content": f"今天解锁了{topic_label(achievement_id)}，感觉努力终于被大家看见了。",
            "subject_id": resident.id,
        }

    trade_hits = [
        trade
        for trade in getattr(state, "_trade_history", [])
        if tick - int(trade.get("tick", 0)) <= recent_window
        and resident.id in {trade.get("seller_id"), trade.get("buyer_id")}
    ]
    if trade_hits:
        latest = trade_hits[-1]
        action = "卖出了" if latest.get("seller_id") == resident.id else "买到了"
        return {
            "category": "market",
            "topic": latest.get("item_name", "market_story"),
            "tone": "positive",
            "content": f"{action}{latest.get('item_name', '好东西')}，今天手气不错。",
            "subject_id": resident.id,
        }

    festivals = list(getattr(state, "_active_festivals", [])) + list(getattr(state, "_festival_history", []))
    festival_hits = [
        festival for festival in festivals
        if resident.id in festival.get("participants", [])
        and tick - int(festival.get("start_tick", 0)) <= recent_window
    ]
    if festival_hits:
        latest = festival_hits[-1]
        return {
            "category": "festival",
            "topic": f"{latest.get('type', 'festival')}_festival" if latest.get("type") != "birthday" else "birthday",
            "tone": "positive",
            "content": f"{latest.get('name', '庆典')}太热闹了，今晚和很多人都聊得很开心。",
            "subject_id": resident.id,
        }

    if getattr(resident, "flagged_for_crime", False) or (resident.mood or "").lower() in {"sad", "angry", "fearful"}:
        return {
            "category": "social",
            "topic": "rough_day",
            "tone": "negative",
            "content": "今天有点不顺，还是想离热闹远一点。",
            "subject_id": resident.id,
        }

    return None


def serialize_posts(posts: Iterable[BulletinPost], resident_names: dict[str, str]) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for post in posts:
        row = asdict(post)
        row["author_name"] = resident_names.get(post.author_id, post.author_id)
        payload.append(row)
    payload.sort(key=lambda item: (-int(item["tick"]), -len(item.get("likes", [])), item["id"]))
    return payload


def _should_like_post(resident: "Resident", post: BulletinPost, relationship: Relationship) -> bool:
    score = relationship.intensity * 0.6 + relationship.familiarity * 0.2
    personality = (resident.personality or "").lower()
    if post.tone == "positive":
        score += 0.35
    elif post.tone == "negative":
        score -= 0.25
    if any(keyword in personality for keyword in ("外向", "热心", "开朗", "friendly", "kind")):
        score += 0.1
    if any(keyword in personality for keyword in ("内向", "冷淡", "保守")):
        score -= 0.05
    return score >= 0.3
