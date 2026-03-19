"""Reflect module — synthesise memories into high-level insights (LLM).

Implements step 3 of the decision loop described in spec §4.1:
  "反思（Reflect）— 定期总结经历，形成高层认知"

LLM failure strategy (spec §9): if chat_completion returns None,
reflect() returns None and the caller falls back to rule engine.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from engine.types import Memory, Reflection

if TYPE_CHECKING:
    from engine.agent import Agent


async def reflect(agent: "Agent", memories: list[Memory]) -> Reflection | None:
    """Generate a reflection from recent memories via LLM.

    Args:
        agent:    The reflecting agent (provides resident profile for prompt).
        memories: Recent memories to synthesise (typically from MemoryStream).

    Returns:
        A :class:`~engine.types.Reflection` on success, or *None* when the
        LLM call fails or times out (caller should skip reflection this tick).
    """
    # Import here to avoid hard dependency at module load time
    from backend.llm.client import chat_completion
    from backend.llm.prompts import build_reflect_prompt

    if not memories:
        return None

    messages = build_reflect_prompt(agent.resident, memories)
    summary = await chat_completion(messages, max_tokens=200)

    if summary is None:
        return None

    # Use the timestamp of the most recent memory as the reflection time
    latest_ts = memories[-1].timestamp if memories else "unknown"

    return Reflection(
        id=str(uuid.uuid4()),
        summary=summary.strip(),
        timestamp=latest_ts,
        derived_from=[m.id for m in memories],
    )
