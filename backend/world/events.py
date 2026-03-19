"""Preset event templates for the god-mode intervention system (spec §14).

Each entry in PRESET_EVENTS is a dict that can be injected into the
simulation via the REST API or directly through SimulationState.enqueue_event().

Keys:
    id          Unique slug used by the frontend event picker.
    name        Short Chinese display name.
    description Full event description injected into agent perception.
    radius      Tile radius of effect; -1 means whole-map (global).
    duration    How many ticks the event persists; 1 = instant.
    source      Always "user" for god-mode events.
"""
from __future__ import annotations

from typing import Any

PRESET_EVENTS: list[dict[str, Any]] = [
    {
        "id": "storm",
        "name": "暴风雨",
        "description": "一场突如其来的暴风雨席卷整个小区，所有人都在寻找避雨的地方。",
        "radius": -1,
        "duration": 8,
        "source": "user",
    },
    {
        "id": "lost_wallet",
        "name": "丢钱包",
        "description": "有人在广场附近丢失了一个鼓鼓的钱包，里面有重要证件，急需帮助。",
        "radius": 5,
        "duration": 1,
        "source": "user",
    },
    {
        "id": "love_letter",
        "name": "匿名情书",
        "description": "一封精心装饰的匿名情书悄然出现，没有署名，引发居民纷纷猜测。",
        "radius": 3,
        "duration": 1,
        "source": "user",
    },
    {
        "id": "free_cake",
        "name": "免费蛋糕",
        "description": "咖啡馆门口摆出一大桌免费蛋糕，香气四溢，吸引所有经过的居民。",
        "radius": 6,
        "duration": 3,
        "source": "user",
    },
    {
        "id": "stranger",
        "name": "来了个陌生人",
        "description": "一个神秘的陌生人出现在小区，行踪不定，居民们议论纷纷。",
        "radius": -1,
        "duration": 5,
        "source": "user",
    },
    {
        "id": "power_outage",
        "name": "停电了",
        "description": "整个小区突然停电，漆黑一片，居民们被迫走出家门互相照应。",
        "radius": -1,
        "duration": 5,
        "source": "user",
    },
    {
        "id": "street_performance",
        "name": "街头表演",
        "description": "一位流浪艺术家在广场上开始了精彩的街头表演，吸引居民围观。",
        "radius": 8,
        "duration": 4,
        "source": "user",
    },
]


def get_preset_by_id(event_id: str) -> dict[str, Any] | None:
    """Look up a preset event by its slug id.

    Args:
        event_id: The slug, e.g. ``"storm"``.

    Returns:
        A copy of the event dict, or *None* if not found.
    """
    for event in PRESET_EVENTS:
        if event["id"] == event_id:
            return dict(event)
    return None
