"""Agent base class for the Populace simulation engine.

Defines the perceive→retrieve→reflect→plan→act→memorize lifecycle
described in spec §4.1.  Concrete subclasses (LLM-driven or rule-driven)
implement the method bodies; this file only provides the interface and
data ownership.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Dict, List, Optional

from engine.types import Event, Memory, Reflection, Resident

if TYPE_CHECKING:
    from engine.world import World


class Agent(ABC):
    """Base class for a generative AI resident agent.

    Each Agent owns a :class:`~engine.types.Resident` data object and
    exposes the six-phase decision loop from Stanford Generative Agents.
    All methods are no-ops here; subclasses override them with rule-engine
    or LLM logic.
    """

    def __init__(self, resident: Resident) -> None:
        from engine.memory import MemoryStream
        self.resident = resident
        self.memory_stream: MemoryStream = MemoryStream()
        self.reflections: List[Reflection] = []

    # ------------------------------------------------------------------
    # Decision loop (§4.1)
    # ------------------------------------------------------------------

    @abstractmethod
    def perceive(self, world: "World") -> List[Event]:
        """Sense the environment: current location, nearby agents, recent events.

        Args:
            world: The shared world state snapshot for this tick.

        Returns:
            List of events observable by this agent right now.
        """
        ...

    @abstractmethod
    def retrieve(self, query: str) -> List[Memory]:
        """Retrieve relevant memories from long-term storage.

        Args:
            query: Natural-language description of the current context.

        Returns:
            Ranked list of relevant :class:`~engine.types.Memory` objects.
        """
        ...

    @abstractmethod
    def reflect(self, memories: List[Memory]) -> Optional[Reflection]:
        """Synthesize memories into a high-level insight (LLM-driven).

        Called periodically when the memory count exceeds
        ``WorldConfig.reflection_threshold``.

        Args:
            memories: Recent memories to synthesise.

        Returns:
            A :class:`~engine.types.Reflection`, or *None* if not triggered.
        """
        ...

    @abstractmethod
    def plan(self, context: Dict) -> Dict:
        """Decide on the next action given perceived context and memories.

        Args:
            context: Dict containing perceived events and retrieved memories.

        Returns:
            Action plan dict, e.g. ``{"action": "move", "target": (10, 12)}``.
        """
        ...

    @abstractmethod
    def act(self, plan: Dict, world: "World") -> None:
        """Execute the planned action: move, speak, or interact.

        Args:
            plan: Output of :meth:`plan`.
            world: Mutable world state to apply the action to.
        """
        ...

    @abstractmethod
    def memorize(self, event: Event) -> None:
        """Persist this tick's experience into the memory stream.

        Args:
            event: The event to store.
        """
        ...

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return f"Agent(id={self.resident.id!r}, name={self.resident.name!r})"
