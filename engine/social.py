"""Social interaction module — dialogue triggering and coordination.

Implements the dialogue protocol from spec §11:
  - should_interact(): probability gate (proximity + extroversion + randomness)
  - initiate_dialogue(): up to 3-round LLM exchange + relationship delta
  - DialogueResult: typed return value carrying messages and delta
"""
from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from engine.types import DialogueUpdate, Memory, RelationshipDelta

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.world import World


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class DialogueResult:
    """Outcome of a completed dialogue exchange.

    Attributes:
        messages:           Ordered list of ``{speaker_id, text}`` dicts.
        relationship_delta: Sentiment score [-10, +10] (spec §11).
        is_important:       True when |delta| >= 5 → write to long-term memory.
    """
    messages: list[dict] = field(default_factory=list)
    relationship_delta: int = 0
    is_important: bool = False

    @classmethod
    def empty(cls) -> "DialogueResult":
        """Empty result returned on LLM failure."""
        return cls()


# ---------------------------------------------------------------------------
# Personality → extroversion score
# ---------------------------------------------------------------------------

_EXTROVERT_KEYWORDS = ("外向", "开朗", "活泼", "健谈", "社牛", "extrovert", "outgoing")
_INTROVERT_KEYWORDS = ("内向", "安静", "害羞", "社恐", "introvert", "shy")


def _extroversion(personality: str) -> float:
    """Return a [0.0, 1.0] extroversion score from personality text."""
    p = personality.lower()
    if any(k in p for k in _EXTROVERT_KEYWORDS):
        return 0.8
    if any(k in p for k in _INTROVERT_KEYWORDS):
        return 0.2
    return 0.5


# ---------------------------------------------------------------------------
# Trigger check
# ---------------------------------------------------------------------------

def should_interact(agent_a: "Agent", agent_b: "Agent", world: "World") -> bool:
    """Decide whether two agents should start a dialogue this tick (spec §11).

    Probability formula:
        p = clamp(base + extroversion_bonus, 0.05, 0.95)

    where base = 0.15 and extroversion_bonus rewards both agents being
    extroverted (max +0.30).

    Args:
        agent_a: First agent.
        agent_b: Second agent.
        world:   Current world state (not used for probability, reserved
                 for future relationship-graph lookups).

    Returns:
        True if a dialogue should be initiated this tick.
    """
    ext_a = _extroversion(agent_a.resident.personality)
    ext_b = _extroversion(agent_b.resident.personality)
    # Average extroversion bonus: up to +0.30
    extroversion_bonus = ((ext_a + ext_b) / 2) * 0.30
    probability = min(0.95, max(0.05, 0.15 + extroversion_bonus))
    return random.random() < probability


# ---------------------------------------------------------------------------
# Dialogue execution
# ---------------------------------------------------------------------------

async def initiate_dialogue(
    agent_a: "Agent",
    agent_b: "Agent",
    world: "World",
) -> DialogueResult:
    """Run a full dialogue exchange between two agents (spec §11).

    Flow:
      1. Agent A opens  (LLM, ≤50 token)
      2. Agent B replies (LLM, ≤50 token)
      3. Up to 3 rounds (6 messages total)
      4. LLM scores sentiment delta → update memory if important

    On any LLM failure the exchange ends early (returns what was collected
    so far, or an empty result if nothing was generated).

    Args:
        agent_a: The initiating speaker.
        agent_b: The responding speaker.
        world:   World state (used for simulation_time and memory storage).

    Returns:
        A :class:`DialogueResult` with messages and relationship_delta.
    """
    from backend.llm.client import chat_completion
    from backend.llm.prompts import build_dialogue_eval_prompt, build_dialogue_prompt

    messages: list[dict] = []
    context_history = ""
    tick_time = world.simulation_time()

    # Up to 3 rounds = 6 turns (A, B, A, B, A, B)
    for round_idx in range(3):
        for speaker, listener in ((agent_a, agent_b), (agent_b, agent_a)):
            prompt_msgs = build_dialogue_prompt(
                speaker.resident,
                listener.resident,
                context_history or "两人偶遇",
            )
            text = await chat_completion(prompt_msgs, max_tokens=50)
            if text is None:
                # LLM failure → end dialogue early
                break
            text = text.strip()
            messages.append({"speaker_id": speaker.resident.id, "text": text})
            context_history += f"{speaker.resident.name}：{text}\n"
        else:
            continue
        break  # inner loop broke — exit outer loop too

    if not messages:
        return DialogueResult.empty()

    # Evaluate relationship delta
    delta = 0
    eval_text = await chat_completion(
        build_dialogue_eval_prompt(context_history),
        max_tokens=10,
    )
    if eval_text is not None:
        try:
            delta = max(-10, min(10, int(eval_text.strip().split()[0])))
        except (ValueError, IndexError):
            delta = 0

    is_important = abs(delta) >= 5

    # Memorise important dialogues (spec §11)
    if is_important:
        summary = f"与 {agent_b.resident.name} 的对话：{context_history[:100]}"
        mem_a = Memory(
            id=str(uuid.uuid4()),
            content=summary,
            timestamp=tick_time,
            importance=0.8,
            emotion="happy" if delta > 0 else "sad",
        )
        agent_a.memory_stream.add(mem_a)
        mem_b = Memory(
            id=str(uuid.uuid4()),
            content=f"与 {agent_a.resident.name} 的对话：{context_history[:100]}",
            timestamp=tick_time,
            importance=0.8,
            emotion="happy" if delta > 0 else "sad",
        )
        agent_b.memory_stream.add(mem_b)

    return DialogueResult(
        messages=messages,
        relationship_delta=delta,
        is_important=is_important,
    )
