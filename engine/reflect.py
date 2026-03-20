"""Reflect module — synthesise memories into high-level insights (LLM).

Implements step 3 of the decision loop described in spec §4.1:
  "反思（Reflect）— 定期总结经历，形成高层认知"

LLM failure strategy (spec §9): if chat_completion returns None,
reflect() returns None and the caller falls back to rule engine.
"""
from __future__ import annotations

import uuid
from typing import Any, TYPE_CHECKING

from engine._optional_backend import load_backend_attr
from engine.types import Memory, Reflection

if TYPE_CHECKING:
    from engine.agent import Agent


_BUILD_REFLECT_PROMPT = load_backend_attr("backend.llm.prompts", "build_reflect_prompt")


def _build_reflect_messages(agent: "Agent", memories: list[Memory]) -> list[dict[str, Any]]:
    if _BUILD_REFLECT_PROMPT is None:
        memory_lines = "\n".join(f"- {memory.content}" for memory in memories[-5:])
        return [
            {
                "role": "system",
                "content": "请总结这些经历，输出一句高层认知。",
            },
            {
                "role": "user",
                "content": (
                    f"居民：{agent.resident.name}\n"
                    f"性格：{agent.resident.personality}\n"
                    f"最近记忆：\n{memory_lines}"
                ),
            },
        ]

    return _BUILD_REFLECT_PROMPT(agent.resident, memories)


async def reflect(agent: "Agent", memories: list[Memory]) -> Reflection | None:
    """Generate a reflection from recent memories via LLM.

    Args:
        agent:    The reflecting agent (provides resident profile for prompt).
        memories: Recent memories to synthesise (typically from MemoryStream).

    Returns:
        A :class:`~engine.types.Reflection` on success, or *None* when the
        LLM call fails or times out (caller should skip reflection this tick).
    """
    if not memories:
        return None

    messages = _build_reflect_messages(agent, memories)
    summary = await agent.call_llm(messages, max_tokens=200)

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
