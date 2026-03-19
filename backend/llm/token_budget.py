"""Token budget controller.

Tracks daily LLM token consumption and enforces the budget ceiling
described in spec §9:
  10 agents × 20% LLM tick × 48 ticks/day × 1000 tokens ≈ 96 000 tokens/day
"""
from __future__ import annotations


class TokenBudget:
    """Daily token budget for LLM calls.

    Args:
        daily_budget: Maximum tokens allowed per simulated day.
                      Defaults to the spec §9 estimate of 96 000.
    """

    DEFAULT_DAILY_BUDGET = 96_000

    def __init__(self, daily_budget: int = DEFAULT_DAILY_BUDGET) -> None:
        self._daily_budget = daily_budget
        self._used: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def consume(self, tokens: int) -> bool:
        """Attempt to consume *tokens* from the budget.

        Args:
            tokens: Number of tokens to deduct.

        Returns:
            ``True`` if the budget covers the request (tokens deducted),
            ``False`` if the budget is exhausted (no deduction made).
        """
        if self.remaining() < tokens:
            return False
        self._used += tokens
        return True

    def remaining(self) -> int:
        """Return the number of tokens still available today."""
        return max(0, self._daily_budget - self._used)

    def is_exhausted(self) -> bool:
        """Return ``True`` when the daily budget has been fully consumed."""
        return self._used >= self._daily_budget

    def reset(self) -> None:
        """Reset the counter for a new simulated day."""
        self._used = 0

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    @property
    def daily_budget(self) -> int:
        return self._daily_budget

    @property
    def used(self) -> int:
        return self._used

    def __repr__(self) -> str:
        return (
            f"TokenBudget(used={self._used}, "
            f"remaining={self.remaining()}, "
            f"daily_budget={self._daily_budget})"
        )
