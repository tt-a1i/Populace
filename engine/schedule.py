"""Daily schedule system for AI agents.

Gives each agent a structured 24-hour routine so that rule-path behaviour
is purposeful rather than random.  The schedule is based on the simulated
hour derived from ``world.current_tick``.

Phases
------
  sleep       22:00 – 06:00   Agent stays home or rest area
  morning     06:00 – 08:00   Wake up, leave home
  work        08:00 – 12:00   Move toward work building (shop / school / cafe)
  lunch       12:00 – 13:00   Move toward cafe / park
  afternoon   13:00 – 17:00   Work / social activities
  evening     17:00 – 20:00   Socialise (cafe / park); extroverts stay later
  home        20:00 – 22:00   Head home

Personality adjustments
-----------------------
  外向 / extrovert — evening phase extends to 21:00; home phase 21:00–22:00
  内向 / introvert — home phase starts at 18:00; evening ends at 18:00
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from engine.world import World

# Keywords matched against resident.personality
_EXTROVERT_KW = ("外向", "开朗", "活泼", "健谈", "社牛", "extrovert", "outgoing")
_INTROVERT_KW = ("内向", "安静", "害羞", "社恐", "introvert", "shy")

# Building type priorities per phase
_PHASE_BUILDINGS: dict[str, list[str]] = {
    "work":      ["school", "shop", "cafe"],
    "lunch":     ["cafe", "park"],
    "afternoon": ["school", "shop", "park"],
    "evening":   ["cafe", "park"],
    "home":      ["home"],
    "morning":   [],   # just leave the house — no specific destination
    "sleep":     ["home"],
}


def _personality_type(personality: str) -> str:
    """Return 'extrovert', 'introvert', or 'neutral'."""
    p = personality.lower()
    if any(k in p for k in _EXTROVERT_KW):
        return "extrovert"
    if any(k in p for k in _INTROVERT_KW):
        return "introvert"
    return "neutral"


@dataclass
class SchedulePhase:
    name: str                  # e.g. "work", "sleep"
    target_types: list[str]    # preferred building types, in priority order


class DailySchedule:
    """Encapsulates the daily routine for a single agent."""

    def __init__(self, personality: str) -> None:
        self._ptype = _personality_type(personality)

    # ------------------------------------------------------------------
    # Phase boundaries (hour-based)
    # ------------------------------------------------------------------

    def current_phase(self, hour: float) -> SchedulePhase:
        """Return the schedule phase active at *hour* (0–24 float).

        Args:
            hour: Simulated hour of the day (e.g. 14.5 = 14:30).

        Returns:
            :class:`SchedulePhase` with name and preferred building types.
        """
        if self._ptype == "extrovert":
            home_start = 21.0
        elif self._ptype == "introvert":
            home_start = 18.0
        else:
            home_start = 20.0  # neutral
        evening_end = home_start  # evening → home boundary

        if hour < 6.0 or hour >= 22.0:
            phase = "sleep"
        elif hour < 8.0:
            phase = "morning"
        elif hour < 12.0:
            phase = "work"
        elif hour < 13.0:
            phase = "lunch"
        elif hour < 17.0:
            phase = "afternoon"
        elif hour < evening_end:
            phase = "evening"
        elif hour < 22.0:
            phase = "home"
        else:
            phase = "sleep"

        return SchedulePhase(
            name=phase,
            target_types=list(_PHASE_BUILDINGS.get(phase, [])),
        )

    def rule_plan(
        self,
        agent: "object",   # Agent, typed loosely to avoid circular import
        world: "World",
    ) -> dict:
        """Generate a rule-based action plan aligned with the daily schedule.

        Looks up the current phase, then tries to find a suitable building in
        the world.  Falls back to ``{"action": "move"}`` (random wander) if no
        matching building is available.

        Args:
            agent: The :class:`~engine.agent.Agent` instance.
            world: Current world state (provides buildings + time info).

        Returns:
            An action dict such as ``{"action": "move", "target": [x, y]}``.
        """
        # Compute simulated hour from current tick
        tick_per_day = world.config.tick_per_day
        ticks_per_hour = tick_per_day / 24.0
        tick_in_day = world.current_tick % tick_per_day
        hour = tick_in_day / ticks_per_hour

        phase = self.current_phase(hour)
        resident = agent.resident  # type: ignore[attr-defined]

        # ------------------------------------------------------------------
        # Sleep / home phase: return to own home building
        # ------------------------------------------------------------------
        if phase.name in ("sleep", "home"):
            home_id = getattr(resident, "home_building_id", None)
            if home_id:
                home_building = world.get_building(home_id)
                if home_building is not None:
                    # Already home → stay
                    if resident.location == home_id:
                        return {"action": "idle"}
                    return {"action": "move", "target": list(home_building.position)}
            return {"action": "idle"}

        # ------------------------------------------------------------------
        # Morning phase: leave home and wander briefly
        # ------------------------------------------------------------------
        if phase.name == "morning":
            if resident.location is not None:
                return {"action": "move"}  # leave building, random direction
            return {"action": "move"}

        # ------------------------------------------------------------------
        # Work / lunch / afternoon / evening: move toward preferred building
        # ------------------------------------------------------------------
        for btype in phase.target_types:
            candidates = [
                b for b in world.buildings
                if b.type == btype and b.id != getattr(resident, "home_building_id", None)
            ]
            if not candidates:
                continue
            # Prefer a building that isn't full
            for building in candidates:
                occupants = len(world.get_occupants(building.id))
                if occupants < building.capacity:
                    if resident.location == building.id:
                        return {"action": "idle"}  # already there
                    return {"action": "move", "target": list(building.position)}
            # All full — target first one anyway (agent will queue at entrance)
            target = candidates[0]
            if resident.location == target.id:
                return {"action": "idle"}
            return {"action": "move", "target": list(target.position)}

        # Fallback: random wander
        return {"action": "move"}
