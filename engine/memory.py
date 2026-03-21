"""Memory system — short-term memory stream with relevance retrieval.

Implements the memory layer described in spec §4.1:
  短期记忆: 最近 N 条（Redis 快速访问）
  检索: 按 importance × recency 排序（V1 简化策略）
  反思触发: 累计记忆数达到 reflection_threshold 的整数倍时触发
"""
from __future__ import annotations

from engine.types import Memory, WorldConfig


class MemoryStream:
    """Short-term memory buffer for one agent.

    Args:
        config: World configuration; drives ``short_term_memory_size``
                and ``reflection_threshold``.
    """

    def __init__(self, config: WorldConfig | None = None) -> None:
        self._config = config or WorldConfig()
        self._memories: list[Memory] = []
        self._total_added: int = 0          # lifetime count, never decremented
        self._last_reflect_at: int = 0      # total_added value at last reflection

    # ------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------

    def add(self, memory: Memory) -> None:
        """Add a memory to the stream.

        Keeps only the most recent ``short_term_memory_size`` entries;
        older entries are evicted (they live in Neo4j long-term storage).

        Args:
            memory: The :class:`~engine.types.Memory` to store.
        """
        self._memories.append(memory)
        self._total_added += 1
        cap = self._config.short_term_memory_size
        if len(self._memories) > cap:
            self._memories = self._memories[-cap:]

    def retrieve(self, query: str, k: int = 5) -> list[Memory]:
        """Retrieve the *k* most relevant memories.

        V1 strategy: score = importance × recency_weight, where
        recency_weight increases linearly with position in the buffer
        (most recent = highest weight).

        Args:
            query: Natural-language context (reserved for V2 embedding
                   similarity; ignored in V1).
            k:     Maximum number of memories to return.

        Returns:
            Up to *k* memories sorted by relevance descending.
        """
        if not self._memories:
            return []
        n = len(self._memories)
        last = max(n - 1, 1)
        scored = [
            (m, m.importance * 0.6 + (idx / last) * 0.4)
            for idx, m in enumerate(self._memories)
        ]
        scored.sort(key=lambda t: t[1], reverse=True)
        return [m for m, _ in scored[:k]]

    def should_reflect(self) -> bool:
        """Return True when enough new memories have accumulated to trigger
        a reflection cycle (spec §4.1, §16: REFLECTION_THRESHOLD = 10).

        Fires on every positive integer multiple of the threshold so that
        reflection happens repeatedly throughout the simulation.
        """
        threshold = self._config.reflection_threshold
        if threshold <= 0 or self._total_added == 0:
            return False
        next_reflect_at = self._last_reflect_at + threshold
        if self._total_added >= next_reflect_at:
            self._last_reflect_at = next_reflect_at
            return True
        return False

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    @property
    def all(self) -> list[Memory]:
        """All memories currently in the short-term buffer."""
        return list(self._memories)

    @property
    def total_added(self) -> int:
        """Lifetime count of memories ever added (monotonically increasing)."""
        return self._total_added

    def __len__(self) -> int:
        return len(self._memories)

    def __repr__(self) -> str:
        return (
            f"MemoryStream(buffered={len(self._memories)}, "
            f"total_added={self._total_added})"
        )
