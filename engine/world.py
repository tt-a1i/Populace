"""World state manager for the Populace simulation engine.

Owns the list of agents, buildings, and the tile grid (§10).
The tick() method is the entry point called by the backend simulation
loop each time step (§8).
"""
from __future__ import annotations

from typing import List, Optional

from engine.agent import Agent
from engine.types import Building, Event, MovementUpdate, TickState, WorldConfig


class World:
    """Central state container for a running simulation.

    Attributes:
        config:    Tunable simulation parameters.
        agents:    All active :class:`~engine.agent.Agent` instances.
        buildings: All :class:`~engine.types.Building` objects on the map.
        grid:      2-D boolean tile grid; ``True`` = walkable (§10).
        current_tick: Monotonically increasing tick counter.
    """

    def __init__(self, config: Optional[WorldConfig] = None) -> None:
        self.config: WorldConfig = config or WorldConfig()
        self.agents: List[Agent] = []
        self.buildings: List[Building] = []

        # Initialise fully-walkable grid; buildings mark their tiles as blocked
        # when placed via add_building() (future implementation).
        self.grid: List[List[bool]] = [
            [True] * self.config.map_width_tiles
            for _ in range(self.config.map_height_tiles)
        ]
        self.current_tick: int = 0
        self.pending_events: List[Event] = []

    # ------------------------------------------------------------------
    # Agent management
    # ------------------------------------------------------------------

    def add_agent(self, agent: Agent) -> None:
        """Add an agent to the world.

        Synchronises the agent's MemoryStream config with this world's
        config so that thresholds (e.g. reflection_threshold) are
        consistent across the simulation.
        """
        agent.memory_stream._config = self.config
        self.agents.append(agent)

    def remove_agent(self, agent_id: str) -> None:
        """Remove an agent from the world by its resident id."""
        self.agents = [a for a in self.agents if a.resident.id != agent_id]

    def get_nearby_agents(self, x: int, y: int, radius: Optional[int] = None) -> List[Agent]:
        """Return agents within Manhattan distance of tile (x, y).

        Args:
            x: Tile x-coordinate of the origin.
            y: Tile y-coordinate of the origin.
            radius: Search radius in tiles; defaults to
                ``WorldConfig.interaction_distance``.

        Returns:
            Agents whose tile position is within *radius* of (x, y),
            excluding any agent located exactly at (x, y) (i.e. the
            querying agent itself).
        """
        if radius is None:
            radius = self.config.interaction_distance
        return [
            a for a in self.agents
            if 0 < abs(a.resident.x - x) + abs(a.resident.y - y) <= radius
        ]

    # ------------------------------------------------------------------
    # Building management
    # ------------------------------------------------------------------

    def add_building(self, building: Building) -> None:
        """Register a building in the world."""
        self.buildings.append(building)

    def get_building(self, building_id: str) -> Optional[Building]:
        """Look up a building by id."""
        for b in self.buildings:
            if b.id == building_id:
                return b
        return None

    # ------------------------------------------------------------------
    # Simulation loop (§8)
    # ------------------------------------------------------------------

    def tick(self) -> TickState:
        """Advance the simulation by one tick and return the state diff.

        The backend simulation loop calls this method on a timer.
        Concrete implementation will:
          1. Snapshot the current world state.
          2. Run all agents through their perceive→plan→act cycle.
          3. Collect movements, dialogues, relationship deltas, and events.
          4. Increment current_tick and return a :class:`~engine.types.TickState`.

        Returns:
            A :class:`~engine.types.TickState` describing everything that
            changed this tick (pushed to the frontend via WebSocket).
        """
        self.current_tick += 1
        sim_time = self.simulation_time()

        # Collect current position of every agent as movement updates.
        # The backend simulation loop (backend/core/simulation.py) calls
        # perceive/plan/act before tick(); by the time tick() runs the
        # agents' positions have already been updated for this step.
        movements = [
            MovementUpdate(
                id=a.resident.id,
                x=a.resident.x,
                y=a.resident.y,
                action="standing" if a.resident.location else "walking",
            )
            for a in self.agents
        ]

        return TickState(tick=self.current_tick, time=sim_time, movements=movements)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def simulation_time(self) -> str:
        """Human-readable in-world time string, e.g. ``'Day 3, 14:30'``."""
        day = self.current_tick // self.config.tick_per_day + 1
        tick_in_day = self.current_tick % self.config.tick_per_day
        # Each tick = 30 simulated minutes; day starts at 00:00
        minutes_in_day = tick_in_day * 30
        hour, minute = divmod(minutes_in_day, 60)
        return f"Day {day}, {hour:02d}:{minute:02d}"

    def __repr__(self) -> str:
        return (
            f"World(tick={self.current_tick}, "
            f"agents={len(self.agents)}, "
            f"buildings={len(self.buildings)})"
        )
