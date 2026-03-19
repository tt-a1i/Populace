"""Async simulation loop for driving world ticks."""

from __future__ import annotations

import asyncio
import inspect
from typing import Any, Callable, Optional

from .clock import SimulationClock


class SimulationLoop:
    """Runs the simplified spec §8 tick loop on an async timer."""

    def __init__(
        self,
        world: Any,
        clock: Optional[SimulationClock] = None,
        tick_handler: Optional[Callable[[], Any]] = None,
    ) -> None:
        self.world = world
        self.clock = clock or SimulationClock()
        self.tick_handler = tick_handler or self.world.tick
        self.running = False
        self.last_tick_state: Optional[Any] = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        if self.running:
            return

        self.running = True
        self._stop_event.clear()

        try:
            while not self._stop_event.is_set():
                if self.clock.is_paused():
                    await self._wait_for_stop(0.1)
                    continue

                # Simplified spec §8 flow:
                # 1. freeze snapshot
                # 2. agent perception
                # 3. decision phase
                # 4. commit actions
                # 5. push diff
                result = self.tick_handler()
                if inspect.isawaitable(result):
                    result = await result
                self.last_tick_state = result

                await self._wait_for_stop(self.clock.tick_interval())
        finally:
            self.running = False

    async def stop(self) -> None:
        self.running = False
        self._stop_event.set()
        await asyncio.sleep(0)

    async def _wait_for_stop(self, timeout: float) -> None:
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            return
