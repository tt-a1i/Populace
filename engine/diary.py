"""Diary generation — creates rule-based daily journal entries for residents.

Called at end-of-day (22:00 sim time) from world.tick().
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.world import World

# Maximum diary entries kept per resident
_MAX_DIARY_ENTRIES = 30


def _build_summary(agent: "Agent", world: "World") -> str:
    """Summarise the day from recent memories and current state."""
    recent = agent.memory_stream.all[-5:]
    name = agent.resident.name
    mood = agent.resident.mood

    if not recent:
        return f"{name}今天没有什么特别的事发生，平静地度过了这一天。心情是{mood}。"

    items = [m.content for m in recent[:3]]
    events_text = "；".join(items)
    return f"{name}今天：{events_text}。心情：{mood}。"


def generate_diary_entry(agent: "Agent", world: "World") -> "DiaryEntry":  # type: ignore[name-defined]
    """Append a diary entry to the agent's resident and return it."""
    from engine.types import DiaryEntry

    day_num = world.current_tick // world.config.tick_per_day + 1
    entry = DiaryEntry(
        id=str(uuid.uuid4()),
        date=f"Day {day_num}",
        tick=world.current_tick,
        summary=_build_summary(agent, world),
    )
    agent.resident.diary.append(entry)
    if len(agent.resident.diary) > _MAX_DIARY_ENTRIES:
        agent.resident.diary = agent.resident.diary[-_MAX_DIARY_ENTRIES:]
    return entry
