"""Concrete generative agent — wires the 6 abstract Agent methods to the
module-level engine functions (perceive / reflect / plan / act) and the
agent's own MemoryStream.

This is the default Agent subclass used by the simulation.  Custom agents
can override any of the 6 methods without touching the engine modules.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Dict, List, Optional

from engine.agent import Agent
from engine.types import Event, Memory, Reflection, Resident

if TYPE_CHECKING:
    from engine.world import World


class GenerativeAgent(Agent):
    """Default Agent implementation that delegates to engine modules.

    Method → module mapping:
      perceive   → engine.perceive.perceive
      retrieve   → self.memory_stream.retrieve
      reflect    → engine.reflect.reflect  (async)
      plan       → engine.plan.plan        (async)
      act        → engine.act.act
      memorize   → self.memory_stream.add  (converts Event → Memory)
    """

    def __init__(self, resident: Resident) -> None:
        super().__init__(resident)

    # ------------------------------------------------------------------
    # Step a — Perceive
    # ------------------------------------------------------------------

    def perceive(self, world: "World") -> List[Event]:
        """Delegate to engine.perceive.perceive."""
        from engine.perceive import perceive as _perceive
        return _perceive(self, world)

    # ------------------------------------------------------------------
    # Step b — Retrieve
    # ------------------------------------------------------------------

    def retrieve(self, query: str) -> List[Memory]:
        """Retrieve relevant memories from the short-term stream."""
        return self.memory_stream.retrieve(query)

    # ------------------------------------------------------------------
    # Step c — Reflect  (async)
    # ------------------------------------------------------------------

    async def reflect(self, memories: List[Memory]) -> Optional[Reflection]:
        """Delegate to engine.reflect.reflect (LLM-driven)."""
        from engine.reflect import reflect as _reflect
        return await _reflect(self, memories)

    # ------------------------------------------------------------------
    # Step d — Plan  (async)
    # ------------------------------------------------------------------

    async def plan(self, context: Dict) -> Dict:
        """Choose LLM or rule path based on context["use_llm"].

        *context* keys: ``events``, ``memories``, ``reflections``, ``use_llm``.
        """
        if context.get("use_llm", False):
            from engine.plan import plan as _plan
            return await _plan(
                self,
                context.get("events", []),
                context.get("memories", []),
                context.get("reflections", []),
            )
        # Rule path: random walk (spec §8: "走路、日常通勤")
        return {"action": "move"}

    # ------------------------------------------------------------------
    # Step e — Act
    # ------------------------------------------------------------------

    def act(self, plan: Dict, world: "World") -> None:
        """Delegate to engine.act.act."""
        from engine.act import act as _act
        _act(self, plan, world)

    # ------------------------------------------------------------------
    # Step f — Memorize
    # ------------------------------------------------------------------

    def memorize(self, event: Event) -> None:
        """Convert *event* to a Memory, store it in the stream, and cache in Redis."""
        mem = Memory(
            id=str(uuid.uuid4()),
            content=event.description,
            timestamp=event.timestamp,
            importance=0.5,
            emotion="neutral",
        )
        self.memory_stream.add(mem)
        # Non-blocking write to Redis short-term memory cache (spec §4.1)
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            from backend.db.redis import cache_agent_memory
            loop.create_task(cache_agent_memory(self.resident.id, mem))
        except RuntimeError:
            pass  # No running event loop (e.g. unit tests) — skip silently
        except Exception:
            pass  # Redis unavailable — skip silently
