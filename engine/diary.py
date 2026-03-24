"""Rule-based daily diary generation for residents."""
from __future__ import annotations

import random
import re
import uuid
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.world import World

_MAX_DIARY_ENTRIES = 30
_SOCIAL_TRAITS = ("外向", "开朗", "活泼", "健谈", "社牛", "extrovert", "outgoing")
_INTROVERT_TRAITS = ("内向", "安静", "害羞", "细腻", "introvert", "shy")
_IMPORTANT_KEYWORDS = ("朋友", "吵", "病", "节日", "投票", "festival", "vote")
_MOOD_ICON = {
    "happy": "😊",
    "excited": "🤩",
    "ecstatic": "🥳",
    "calm": "😌",
    "content": "🙂",
    "neutral": "😐",
    "tired": "😴",
    "sad": "😢",
    "angry": "😠",
    "fearful": "😟",
}


def _day_number(world: "World") -> int:
    return world.current_tick // world.config.tick_per_day + 1


def _extract_day_related_memories(agent: "Agent", day: int) -> list[str]:
    prefix = f"Day {day}"
    snippets: list[str] = []
    for memory in reversed(agent.memory_stream.all):
        if prefix not in memory.timestamp:
            continue
        if memory.content.startswith("Tick "):
            continue
        snippets.append(memory.content)
        if len(snippets) >= 6:
            break
    return list(reversed(snippets))


def _extract_day_mood_changes(agent: "Agent", day: int, tick_per_day: int) -> list[str]:
    start_tick = (day - 1) * tick_per_day
    end_tick = start_tick + tick_per_day
    return [
        entry.mood
        for entry in agent.resident.mood_history
        if start_tick <= entry.tick < end_tick
    ]


def _personality_weight(personality: str) -> str:
    lower = personality.lower()
    if any(token in lower for token in _SOCIAL_TRAITS):
        return "social"
    if any(token in lower for token in _INTROVERT_TRAITS):
        return "reflective"
    return "balanced"


def _build_base_tags(agent: "Agent", world: "World", memories: list[str], mood_changes: list[str]) -> list[str]:
    tags = [f"weather:{world.weather.value if hasattr(world.weather, 'value') else str(world.weather)}"]
    resident = agent.resident
    if resident.occupation != "unemployed":
        tags.append("work")
    if resident.inventory:
        tags.append("shopping")
    if mood_changes:
        tags.append("mood")
    joined = " ".join(memories)
    if any(keyword in joined for keyword in ("聊", "说", "朋友", "一起", "gossip", "dialogue")):
        tags.append("social")
    if any(keyword in joined for keyword in ("投票", "vote")):
        tags.append("vote")
    if any(keyword in joined for keyword in ("买", "卖", "交易", "coffee", "goods", "book")):
        tags.append("shopping")

    deduped: list[str] = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped


def _build_state_tags(day_context: dict[str, Any] | None) -> list[str]:
    if not day_context:
        return []
    tags = list(day_context.get("tags", []))
    for flag, tag_name in (
        ("had_trade", "shopping"),
        ("had_vote", "vote"),
        ("had_social", "social"),
        ("had_work", "work"),
        ("had_festival", "festival"),
        ("had_conflict", "conflict"),
    ):
        if day_context.get(flag):
            tags.append(tag_name)
    deduped: list[str] = []
    for tag in tags:
        if tag not in deduped:
            deduped.append(tag)
    return deduped


def _select_focus_line(
    agent: "Agent",
    memories: list[str],
    tags: list[str],
    personality_mode: str,
    rng: random.Random,
) -> str:
    name = agent.resident.name
    if memories:
        sample = memories[: 3 if personality_mode == "social" else 2]
        if personality_mode == "social":
            return f"{name}今天最在意的是和别人来往：{'；'.join(sample)}。"
        if personality_mode == "reflective":
            return f"{name}今天记下来的更多是感受：{'；'.join(sample)}。"
        return f"{name}今天经历了这些事：{'；'.join(sample)}。"

    fallback_lines = [
        f"{name}今天过得比较平静，更多是在观察小镇的变化。",
        f"{name}把今天记成了普通却不空白的一天。",
        f"{name}觉得今天没有惊天动地，但也留下了些小波澜。",
    ]
    if "work" in tags:
        fallback_lines.append(f"{name}今天大部分时间都放在了工作上。")
    if "social" in tags:
        fallback_lines.append(f"{name}今天和人来往不少，心里一直热乎乎的。")
    return rng.choice(fallback_lines)


def _build_diary_content(
    agent: "Agent",
    world: "World",
    day: int,
    tags: list[str],
    mood_changes: list[str],
    day_context: dict[str, Any] | None,
) -> tuple[str, bool]:
    resident = agent.resident
    rng = random.Random(f"{resident.id}:{day}:{world.current_tick}")
    memories = _extract_day_related_memories(agent, day)
    personality_mode = _personality_weight(resident.personality)
    intro = _select_focus_line(agent, memories, tags, personality_mode, rng)

    event_lines: list[str] = []
    if "work" in tags:
        event_lines.append(f"工作上有推进，{resident.occupation}的节奏让今天显得很扎实。")
    if "shopping" in tags:
        event_lines.append(f"和物品、买卖有关的小事不少，背包里的变化也提醒着今天不是白过。")
    if "vote" in tags:
        event_lines.append("社区里的投票话题也占了一部分心思。")
    if "social" in tags:
        event_lines.append("和别人说话、来往、交换情绪，成了今天最有温度的部分。")
    if day_context and day_context.get("weather_line"):
        event_lines.append(str(day_context["weather_line"]))
    elif hasattr(world.weather, "value"):
        event_lines.append(f"天气是{world.weather.value}，多少也影响了整天的节奏。")

    mood_line = f"收尾时的心情是{resident.mood}。"
    if mood_changes:
        unique_moods = []
        for mood in mood_changes:
            if mood not in unique_moods:
                unique_moods.append(mood)
        mood_line = f"今天心情起伏经过了{'→'.join(unique_moods[-3:])}，最后停在{resident.mood}。"

    content_parts = [intro, *event_lines[:3], mood_line]
    content = " ".join(part for part in content_parts if part).strip()

    important_reasons = list(day_context.get("important_events", [])) if day_context else []
    joined_text = " ".join(memories + important_reasons + [content])
    highlight = bool(important_reasons) or any(keyword in joined_text for keyword in _IMPORTANT_KEYWORDS)
    if highlight:
        highlight_reason = important_reasons[0] if important_reasons else content_parts[0]
        content = f"**{highlight_reason}** {content}"

    return content, highlight


def _upsert_entry(agent: "Agent", entry: "DiaryEntry") -> "DiaryEntry":
    for index, existing in enumerate(agent.resident.diary):
        if existing.day == entry.day:
            agent.resident.diary[index] = entry
            return entry
    agent.resident.diary.append(entry)
    agent.resident.diary.sort(key=lambda item: (item.day, item.tick, item.id))
    if len(agent.resident.diary) > _MAX_DIARY_ENTRIES:
        agent.resident.diary = agent.resident.diary[-_MAX_DIARY_ENTRIES:]
    return entry


def generate_diary_entry(
    agent: "Agent",
    world: "World",
    day_context: dict[str, Any] | None = None,
) -> "DiaryEntry":  # type: ignore[name-defined]
    """Create or refresh the resident's diary entry for the current day."""
    from engine.types import DiaryEntry

    day = _day_number(world)
    mood_changes = _extract_day_mood_changes(agent, day, world.config.tick_per_day)
    tags = _build_base_tags(agent, world, _extract_day_related_memories(agent, day), mood_changes)
    for tag in _build_state_tags(day_context):
        if tag not in tags:
            tags.append(tag)
    content, highlight = _build_diary_content(agent, world, day, tags, mood_changes, day_context)
    if highlight and "highlight" not in tags:
        tags.append("highlight")

    mood_snapshot = agent.resident.mood
    entry = DiaryEntry(
        id=str(uuid.uuid4()),
        date=f"Day {day}",
        day=day,
        tick=world.current_tick,
        content=content,
        summary=content,
        tags=tags,
        mood_snapshot=mood_snapshot,
        highlight=highlight,
    )
    return _upsert_entry(agent, entry)


def build_state_diary_context(
    state: Any,
    resident_id: str,
    day: int,
) -> dict[str, Any]:
    """Collect higher-level simulation signals for richer daily diary generation."""
    day_prefix = f"Day {day}"
    timeline = [
        event for event in getattr(state, "_world_timeline", [])
        if str(event.get("time", "")).startswith(day_prefix)
    ]
    trades = [
        event for event in getattr(state, "_trade_history", [])
        if int(event.get("tick", -1)) // state.world.config.tick_per_day + 1 == day
        and resident_id in {event.get("seller_id"), event.get("buyer_id")}
    ]
    votes = [
        event for event in getattr(state, "_vote_history", [])
        if int(event.get("end_tick", -1)) // state.world.config.tick_per_day + 1 == day
    ]
    dialogues = [
        entry for entry in getattr(state, "_dialogue_history", [])
        if str(entry.get("time", "")).startswith(day_prefix)
        and resident_id in {entry.get("from_id"), entry.get("to_id")}
    ]

    tags: list[str] = []
    important_events: list[str] = []
    if trades:
        tags.append("shopping")
    if votes:
        tags.append("vote")
        important_events.append("参加了社区投票")
    if dialogues:
        tags.append("social")
    for item in timeline:
        event_type = str(item.get("event_type", ""))
        description = str(item.get("description", ""))
        if "festival" in event_type or "节日" in description:
            tags.append("festival")
            important_events.append(description)
        if "population_birth" in event_type or "新朋友" in description:
            important_events.append(description)
        if "confession" in description or "争吵" in description or "吵" in description:
            tags.append("conflict")
            important_events.append(description)

    weather_value = state.world.weather.value if hasattr(state.world.weather, "value") else str(state.world.weather)
    return {
        "had_trade": bool(trades),
        "had_vote": bool(votes),
        "had_social": bool(dialogues),
        "had_work": False,
        "had_festival": "festival" in tags,
        "had_conflict": "conflict" in tags,
        "weather_line": f"天气落在{weather_value}上，让今天的氛围有了明确的底色。",
        "tags": tags,
        "important_events": important_events,
    }
