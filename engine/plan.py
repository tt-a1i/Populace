"""Plan module — decide the next action via LLM or rule fallback.

Implements step 4 of the decision loop described in spec §4.1:
  "规划（Plan）— LLM 生成接下来的行动计划"

Fault tolerance (spec §9): if the LLM call fails or times out, returns
the default idle action so the simulation never blocks.
"""
from __future__ import annotations

from typing import Any, TYPE_CHECKING

from engine.types import Event, Memory, Reflection

if TYPE_CHECKING:
    from engine.agent import Agent

# Default action returned on any LLM failure
_DEFAULT_ACTION: dict = {"action": "idle"}


def _build_plan_messages(
    agent: "Agent",
    memories: list[Memory],
    reflections: list[Reflection],
) -> list[dict[str, Any]]:
    try:
        from backend.llm.prompts import build_plan_prompt
    except ImportError:
        memory_lines = "\n".join(f"- {memory.content}" for memory in memories[-3:]) or "- 无"
        reflection_lines = "\n".join(f"- {reflection.summary}" for reflection in reflections[-2:]) or "- 无"
        return [
            {
                "role": "system",
                "content": "你是小镇居民，需要根据记忆和反思决定下一步行动。",
            },
            {
                "role": "user",
                "content": (
                    f"居民：{agent.resident.name}\n"
                    f"性格：{agent.resident.personality}\n"
                    f"记忆：\n{memory_lines}\n"
                    f"反思：\n{reflection_lines}\n"
                    "请输出下一步行动。"
                ),
            },
        ]

    return build_plan_prompt(agent.resident, memories, reflections)


async def plan(
    agent: "Agent",
    perceived_events: list[Event],
    memories: list[Memory],
    reflections: list[Reflection],
) -> dict:
    """Generate an action plan for this tick.

    Tries the LLM first; falls back to ``{"action": "idle"}`` on failure.

    Args:
        agent:            The planning agent.
        perceived_events: Events returned by the perceive step.
        memories:         Retrieved relevant memories.
        reflections:      Recent reflections (may be empty).

    Returns:
        Action dict, e.g.::

            {"action": "move", "target": (12, 8)}
            {"action": "idle"}
            {"action": "talk", "target_id": "r2"}
    """
    messages = _build_plan_messages(agent, memories, reflections)

    # Inject perceived_events into the user message so the LLM has full context
    if perceived_events:
        events_text = "\n".join(f"- {e.description}" for e in perceived_events)
        for msg in reversed(messages):
            if msg["role"] == "user":
                msg["content"] += f"\n\n当前感知到的事件：\n{events_text}"
                break

    result = await agent.call_llm(messages, max_tokens=200)

    if result is None:
        return _DEFAULT_ACTION

    return _parse_plan(result)


def _parse_plan(llm_output: str) -> dict:
    """Lightly parse the LLM text into an action dict.

    V1: the LLM is expected to output plain Chinese describing the action.
    We do keyword matching to extract a structured intent; anything
    unrecognised defaults to idle.
    """
    text = llm_output.strip().lower()

    if any(kw in text for kw in ("移动", "走", "去", "前往", "move")):
        return {"action": "move", "raw": llm_output}

    if any(kw in text for kw in ("对话", "聊", "说话", "talk", "chat")):
        return {"action": "talk", "raw": llm_output}

    if any(kw in text for kw in ("等待", "休息", "待", "idle", "wait")):
        return {"action": "idle", "raw": llm_output}

    # Unknown intent → safe default
    return {"action": "idle", "raw": llm_output}
