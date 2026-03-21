"""Simulation clock controls for the backend tick loop."""

from __future__ import annotations

from .config import settings


class SimulationClock:
    """Controls tick cadence and pause/resume state.

    Supported speeds follow spec §8: paused (0x), 1x, 2x, 5x, 10x, and 50x.
    """

    _ALLOWED_SPEEDS = {0.0, 1.0, 2.0, 5.0, 10.0, 50.0}

    def __init__(self, speed: float = 1.0) -> None:
        self._base_interval = settings.tick_interval_seconds
        self._resume_speed = 1.0
        self._speed = 1.0
        self.set_speed(speed)

    @property
    def speed(self) -> float:
        return self._speed

    def set_speed(self, speed: float) -> None:
        if speed not in self._ALLOWED_SPEEDS:
            raise ValueError(f"unsupported simulation speed: {speed}")

        self._speed = speed
        if speed > 0:
            self._resume_speed = speed

    def pause(self) -> None:
        self._speed = 0.0

    def resume(self) -> None:
        self._speed = self._resume_speed

    def is_paused(self) -> bool:
        return self._speed == 0.0

    def tick_interval(self) -> float:
        if self.is_paused():
            return float("inf")
        return self._base_interval / self._speed
