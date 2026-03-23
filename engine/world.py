"""World state manager for the Populace simulation engine.

Owns the list of agents, buildings, and the tile grid (§10).
The tick() method is the entry point called by the backend simulation
loop each time step (§8).
"""
from __future__ import annotations

import math
import random
from typing import Dict, List, Optional, Tuple

from engine.agent import Agent
from engine.pathfinding import PathCache
from engine.types import (
    Building,
    EnergyUpdate,
    Event,
    Item,
    MoodEntry,
    MovementUpdate,
    Relationship,
    Resident,
    TickState,
    WeatherType,
    WorldConfig,
    Zone,
    ZoneAtmosphere,
    ZoneBounds,
)

_EXTROVERT_KEYWORDS = ("外向", "开朗", "活泼", "健谈", "社牛", "extrovert", "outgoing")
_INTROVERT_KEYWORDS = ("内向", "安静", "害羞", "社恐", "introvert", "shy")
_MOOD_SCORE = {
    "ecstatic": 1.0,
    "excited": 0.8,
    "happy": 1.0,
    "content": 0.3,
    "calm": 0.1,
    "neutral": 0.0,
    "tired": -0.2,
    "sad": -1.0,
    "angry": -0.9,
    "fearful": -0.7,
}
_MOOD_LADDER = ["sad", "fearful", "angry", "tired", "neutral", "calm", "content", "happy", "excited", "ecstatic"]
_BUILDING_WORK_MAP = {
    "cafe": {
        "occupation": "barista",
        "base_income": 3,
        "skill": "cooking",
        "item_name": "coffee",
        "item_value": 12,
    },
    "school": {
        "occupation": "teacher",
        "base_income": 4,
        "skill": "teaching",
        "item_name": "book",
        "item_value": 7,
    },
    "shop": {
        "occupation": "shopkeeper",
        "base_income": 5,
        "skill": "trading",
        "item_name": "goods",
        "item_value": 6,
    },
    "dock": {"occupation": "fisher", "base_income": 4, "skill": "fishing"},
}


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
        self.zones: List[Zone] = self._default_zones()

        # Initialise fully-walkable grid; buildings mark their tiles as blocked
        # when placed via add_building() (future implementation).
        self.grid: List[List[bool]] = [
            [True] * self.config.map_width_tiles
            for _ in range(self.config.map_height_tiles)
        ]
        self.current_tick: int = 0
        self.pending_events: List[Event] = []
        self.relationships: Dict[Tuple[str, str], Relationship] = {}
        self.weather: WeatherType = WeatherType.sunny
        self.season: str = "spring"
        self.path_cache: PathCache = PathCache()
        self.grid_chunk_size: int = max(1, self.config.interaction_distance)
        self.grid_index: Dict[Tuple[int, int], List[Agent]] = {}
        self._grid_index_dirty = True

    def _default_zones(self) -> List[Zone]:
        width = self.config.map_width_tiles
        height = self.config.map_height_tiles
        half_width = max(1, width // 2)
        half_height = max(1, height // 2)
        quarter_width = max(1, width // 4)
        quarter_height = max(1, height // 4)
        return [
            Zone(
                id="zone-commercial",
                name="商业区",
                type="commercial",
                bounds=ZoneBounds(x=0, y=0, width=half_width, height=half_height),
                atmosphere=ZoneAtmosphere(noise=0.84, safety=0.55, beauty=0.54),
            ),
            Zone(
                id="zone-residential",
                name="住宅区",
                type="residential",
                bounds=ZoneBounds(
                    x=quarter_width,
                    y=quarter_height,
                    width=half_width,
                    height=height - quarter_height,
                ),
                atmosphere=ZoneAtmosphere(noise=0.28, safety=0.82, beauty=0.66),
            ),
            Zone(
                id="zone-education",
                name="教育区",
                type="education",
                bounds=ZoneBounds(x=half_width, y=0, width=width - half_width, height=half_height),
                atmosphere=ZoneAtmosphere(noise=0.34, safety=0.86, beauty=0.7),
            ),
            Zone(
                id="zone-leisure",
                name="休闲区",
                type="leisure",
                bounds=ZoneBounds(x=0, y=half_height, width=half_width, height=height - half_height),
                atmosphere=ZoneAtmosphere(noise=0.46, safety=0.74, beauty=0.88),
            ),
        ]

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
        if not agent.resident.mood_history:
            agent.resident.mood_history.append(
                MoodEntry(tick=self.current_tick, mood=agent.resident.mood, cause="initial")
            )
        self.agents.append(agent)
        self.mark_grid_index_dirty()

    def mood_score(self, mood: str | None) -> float:
        if not mood:
            return 0.0
        return _MOOD_SCORE.get(mood.strip().lower(), 0.0)

    def set_resident_mood(self, agent_or_resident: Agent | Resident, mood: str, cause: str) -> bool:
        resident = agent_or_resident.resident if isinstance(agent_or_resident, Agent) else agent_or_resident
        next_mood = (mood or "neutral").strip().lower()
        if resident.mood == next_mood:
            return False
        resident.mood = next_mood
        resident.mood_history.append(MoodEntry(tick=self.current_tick, mood=next_mood, cause=cause))
        resident.mood_history = resident.mood_history[-200:]
        return True

    def shift_resident_mood(self, agent_or_resident: Agent | Resident, steps: int, cause: str) -> bool:
        resident = agent_or_resident.resident if isinstance(agent_or_resident, Agent) else agent_or_resident
        current_rank = _MOOD_LADDER.index(resident.mood) if resident.mood in _MOOD_LADDER else 4
        next_rank = max(0, min(len(_MOOD_LADDER) - 1, current_rank + steps))
        return self.set_resident_mood(resident, _MOOD_LADDER[next_rank], cause)

    def update_mental_state(self, resident: Resident) -> None:
        if self.mood_score(resident.mood) < -0.3:
            resident.low_mood_ticks += 1
        else:
            resident.low_mood_ticks = 0
            if resident.mental_state == "depressed":
                resident.mental_state = "stable"
        if resident.low_mood_ticks >= 20:
            resident.mental_state = "depressed"

    def remove_agent(self, agent_id: str) -> None:
        """Remove an agent from the world by its resident id."""
        self.agents = [a for a in self.agents if a.resident.id != agent_id]
        stale_keys = [key for key in self.relationships if agent_id in key]
        for key in stale_keys:
            del self.relationships[key]
        self.mark_grid_index_dirty()

    def get_relationship(self, from_id: str, to_id: str) -> Optional[Relationship]:
        """Return the directed relationship edge from one resident to another."""
        return self.relationships.get((from_id, to_id))

    def set_relationship(self, relationship: Relationship) -> None:
        """Persist or replace a directed relationship edge."""
        self.relationships[(relationship.from_id, relationship.to_id)] = relationship

    def remove_relationship(self, from_id: str, to_id: str) -> None:
        """Delete a directed relationship edge if it exists."""
        self.relationships.pop((from_id, to_id), None)

    def add_inventory_item(
        self,
        resident: Resident,
        item_name: str,
        quantity: int = 1,
        value: int = 0,
    ) -> None:
        """Merge produced or traded items into the resident inventory."""
        if quantity <= 0:
            return

        for item in resident.inventory:
            if item.name == item_name:
                item.quantity += quantity
                item.value = max(item.value, value)
                return

        resident.inventory.append(Item(name=item_name, quantity=quantity, value=value))

    def mark_grid_index_dirty(self) -> None:
        """Mark the nearby-agent spatial index for rebuild before next query."""
        self._grid_index_dirty = True

    def rebuild_grid_index(self) -> None:
        """Rebuild the spatial bucket index for agents currently on the map."""
        chunk_size = max(1, self.config.interaction_distance)
        if chunk_size != self.grid_chunk_size:
            self.grid_chunk_size = chunk_size

        next_index: Dict[Tuple[int, int], List[Agent]] = {}
        for agent in self.agents:
            if agent.resident.location is not None:
                continue

            bucket = self._bucket_key(agent.resident.x, agent.resident.y)
            next_index.setdefault(bucket, []).append(agent)

        self.grid_index = next_index
        self._grid_index_dirty = False

    def get_nearby_agents(self, x: int, y: int, radius: Optional[int] = None) -> List[Agent]:
        """Return agents within Manhattan distance of tile (x, y).

        Args:
            x: Tile x-coordinate of the origin.
            y: Tile y-coordinate of the origin.
            radius: Search radius in tiles; defaults to
                ``WorldConfig.interaction_distance``.

        Returns:
            Agents whose tile position is within *radius* of (x, y),
            including agents at the exact origin tile.  Callers that
            need to exclude "self" should filter by identity.
        """
        if radius is None:
            radius = self.config.interaction_distance
        if self._grid_index_dirty:
            self.rebuild_grid_index()

        bucket_span = max(1, math.ceil(radius / self.grid_chunk_size))
        origin_bucket_x, origin_bucket_y = self._bucket_key(x, y)
        nearby: List[Agent] = []

        for bucket_x in range(origin_bucket_x - bucket_span, origin_bucket_x + bucket_span + 1):
            for bucket_y in range(origin_bucket_y - bucket_span, origin_bucket_y + bucket_span + 1):
                for agent in self.grid_index.get((bucket_x, bucket_y), []):
                    distance = abs(agent.resident.x - x) + abs(agent.resident.y - y)
                    if 0 <= distance <= radius:
                        nearby.append(agent)

        return nearby

    def get_social_candidates(self, agent: Agent) -> List[Agent]:
        """Return agents that can socially interact with *agent* this tick."""
        if agent.resident.location is not None:
            return [
                other
                for other in self.get_occupants(agent.resident.location)
                if other is not agent
            ]

        return [other for other in self.get_nearby_agents(agent.resident.x, agent.resident.y) if other is not agent]

    # ------------------------------------------------------------------
    # Building management
    # ------------------------------------------------------------------

    def add_building(self, building: Building) -> None:
        """Register a building in the world."""
        self.buildings.append(building)

    def set_zones(self, zones: List[Zone]) -> None:
        self.zones = zones or self._default_zones()

    def get_zone(self, zone_id: str) -> Optional[Zone]:
        for zone in self.zones:
            if zone.id == zone_id:
                return zone
        return None

    def get_zone_at_position(self, x: int, y: int) -> Optional[Zone]:
        for zone in self.zones:
            bounds = zone.bounds
            if bounds.x <= x < bounds.x + bounds.width and bounds.y <= y < bounds.y + bounds.height:
                return zone
        return None

    def get_zone_stats(self, zone_id: str) -> Optional[dict]:
        zone = self.get_zone(zone_id)
        if zone is None:
            return None

        buildings = [
            building
            for building in self.buildings
            if self.get_zone_at_position(*building.position) == zone
        ]
        residents = [
            agent.resident
            for agent in self.agents
            if self.get_zone_for_resident(agent.resident) == zone
            or (
                agent.resident.home_building_id is not None
                and (home_building := self.get_building(agent.resident.home_building_id)) is not None
                and self.get_zone_at_position(*home_building.position) == zone
            )
        ]

        building_type_counts: Dict[str, int] = {}
        for building in buildings:
            building_type_counts[building.type] = building_type_counts.get(building.type, 0) + 1

        dominant_building_types = [
            item[0]
            for item in sorted(
                building_type_counts.items(),
                key=lambda item: (-item[1], item[0]),
            )[:3]
        ]

        return {
            "id": zone.id,
            "name": zone.name,
            "type": zone.type,
            "bounds": {
                "x": zone.bounds.x,
                "y": zone.bounds.y,
                "width": zone.bounds.width,
                "height": zone.bounds.height,
            },
            "atmosphere": {
                "noise": zone.atmosphere.noise,
                "safety": zone.atmosphere.safety,
                "beauty": zone.atmosphere.beauty,
            },
            "resident_count": len(residents),
            "building_count": len(buildings),
            "dominant_building_types": dominant_building_types,
        }

    def list_zone_stats(self) -> List[dict]:
        stats: List[dict] = []
        for zone in self.zones:
            zone_stats = self.get_zone_stats(zone.id)
            if zone_stats is not None:
                stats.append(zone_stats)
        return stats

    def get_zone_for_resident(self, resident: Resident) -> Optional[Zone]:
        if resident.location is not None:
            building = self.get_building(resident.location)
            if building is not None:
                return self.get_zone_at_position(*building.position)
        return self.get_zone_at_position(resident.x, resident.y)

    def score_zone_for_resident(self, resident: Resident, zone: Zone) -> float:
        extroversion = self._extroversion(resident.personality)
        introversion = 1.0 - extroversion
        atmosphere = zone.atmosphere
        liveliness = atmosphere.noise
        calmness = 1.0 - atmosphere.noise
        scenic_bonus = atmosphere.beauty * 0.2
        safety_bonus = atmosphere.safety * (0.18 + introversion * 0.12)

        zone_bias = {
            "commercial": extroversion * 0.28,
            "leisure": extroversion * 0.18 + atmosphere.beauty * 0.08,
            "residential": introversion * 0.24 + atmosphere.safety * 0.06,
            "education": introversion * 0.2 + atmosphere.safety * 0.08,
        }.get(zone.type, 0.0)

        return extroversion * liveliness + introversion * calmness + scenic_bonus + safety_bonus + zone_bias

    def get_building(self, building_id: str) -> Optional[Building]:
        """Look up a building by id."""
        for b in self.buildings:
            if b.id == building_id:
                return b
        return None

    def get_building_at_position(self, x: int, y: int) -> Optional[Building]:
        """Return the building whose entrance is at tile ``(x, y)``."""
        for building in self.buildings:
            if building.position == (x, y):
                return building
        return None

    def get_occupants(self, building_id: str) -> List[Agent]:
        """Return all agents currently inside the given building."""
        return [agent for agent in self.agents if agent.resident.location == building_id]

    def enter_building(self, agent: Agent, building: Building) -> bool:
        """Move *agent* into *building* if capacity allows."""
        if building.type != "park" and len(self.get_occupants(building.id)) >= building.capacity:
            return False

        agent.resident.location = building.id
        self.mark_grid_index_dirty()
        if building.type == "home":
            self.set_resident_mood(agent, "neutral", "rest")
        elif building.type == "cafe":
            agent.resident.coins = max(0, agent.resident.coins - 5)
        elif building.type == "shop":
            agent.resident.coins = max(0, agent.resident.coins - 10)
        return True

    def leave_building(self, agent: Agent) -> None:
        """Place *agent* back on the map at their building entrance."""
        building_id = agent.resident.location
        if building_id is None:
            return

        agent.resident.location = None
        building = self.get_building(building_id)
        if building is not None:
            agent.resident.x, agent.resident.y = building.position
        self.mark_grid_index_dirty()

    def get_social_probability_bonus(self, agent_a: Agent, agent_b: Agent) -> float:
        """Return building-based social bonus for an agent pair."""
        if agent_a.resident.location is None or agent_a.resident.location != agent_b.resident.location:
            return 0.0

        building = self.get_building(agent_a.resident.location)
        if building is None:
            return 0.0

        if building.type == "cafe":
            return 0.2
        return 0.0

    def get_social_probability(self, agent_a: Agent, agent_b: Agent) -> float:
        """Return the combined base + building social probability."""
        ext_a = self._extroversion(agent_a.resident.personality)
        ext_b = self._extroversion(agent_b.resident.personality)
        relationship = self.get_relationship(agent_a.resident.id, agent_b.resident.id)

        relation_bonus = 0.0
        if relationship is not None:
            relation_bonus = relationship.familiarity * 0.10 + relationship.intensity * 0.15

        extroversion_bonus = ((ext_a + ext_b) / 2) * 0.30
        probability = 0.15 + extroversion_bonus + relation_bonus + self.get_social_probability_bonus(agent_a, agent_b)
        if agent_a.resident.mental_state == "depressed":
            probability *= 0.35
        if agent_b.resident.mental_state == "depressed":
            probability *= 0.8
        return max(0.05, min(0.95, probability))

    def remove_building(self, building_id: str) -> Optional["Building"]:
        """Remove a building, evict its occupants, and restore grid tiles.

        Returns the removed :class:`~engine.types.Building` or ``None`` if
        the building was not found.
        """
        building = self.get_building(building_id)
        if building is None:
            return None

        # Evict all occupants before removing
        for agent in self.get_occupants(building_id):
            self.leave_building(agent)

        self.buildings = [b for b in self.buildings if b.id != building_id]

        # Restore grid: mark entrance + 2×2 footprint body as walkable
        w = self.config.map_width_tiles
        h = self.config.map_height_tiles
        ex, ey = building.position

        def _restore(x: int, y: int) -> None:
            if 0 <= x < w and 0 <= y < h:
                self.grid[y][x] = True

        _restore(ex, ey)
        for dy in range(1, 3):
            for dx in range(0, 2):
                _restore(ex + dx, ey + dy)

        # Flush path cache so agents re-route around the now-open tiles
        self.path_cache = PathCache()
        self.mark_grid_index_dirty()
        return building

    def apply_building_effects(self, agent: Agent) -> None:
        """Apply passive effects from the building the agent is inside.

        Income is paid once per building stay (not every tick) using
        ``_paid_this_stay`` flag on the agent.
        """
        building_id = agent.resident.location
        if building_id is None:
            # Agent left all buildings — reset pay flag for next stay
            agent._paid_this_stay = False  # type: ignore[attr-defined]
            return

        building = self.get_building(building_id)
        if building is None:
            return
        from engine.lifecycle import is_elderly

        if building.type == "home":
            self.set_resident_mood(agent, "neutral", "rest")
            agent.resident.occupation = "unemployed"
            # Recover energy at home
            recovery = 0.025 if is_elderly(agent.resident) else 0.05
            agent.resident.energy = min(1.0, agent.resident.energy + recovery)
        elif building.type in _BUILDING_WORK_MAP:
            work_profile = _BUILDING_WORK_MAP[building.type]
            skill_name = work_profile["skill"]
            current_skill = float(agent.resident.skills.get(skill_name, 0.0))
            agent.resident.occupation = work_profile["occupation"]
            # Pay once per stay, not every tick
            already_paid: bool = getattr(agent, "_paid_this_stay", False)
            if not already_paid:
                tick_per_day = self.config.tick_per_day
                hour = (self.current_tick % tick_per_day) * 24.0 / tick_per_day
                if 8.0 <= hour < 12.0 or 13.0 <= hour < 17.0:
                    bonus_income = round(current_skill * work_profile["base_income"])
                    agent.resident.coins += work_profile["base_income"] + bonus_income
                    item_name = work_profile.get("item_name")
                    if item_name:
                        self.add_inventory_item(
                            agent.resident,
                            item_name=item_name,
                            quantity=1,
                            value=int(work_profile.get("item_value", 0)),
                        )
                    agent._paid_this_stay = True  # type: ignore[attr-defined]
            growth = 0.015 if current_skill < 0.6 else 0.008 if current_skill < 0.85 else 0.003
            agent.resident.skills[skill_name] = round(min(1.0, current_skill + growth), 4)
            # Work drains energy every tick
            agent.resident.energy = max(0.0, agent.resident.energy - 0.03)

    def building_stay_duration(self) -> int:
        """Return the random number of ticks an agent stays indoors."""
        return random.randint(3, 8)

    def _extroversion(self, personality: str) -> float:
        text = personality.lower()
        if any(keyword in text for keyword in _EXTROVERT_KEYWORDS):
            return 0.8
        if any(keyword in text for keyword in _INTROVERT_KEYWORDS):
            return 0.2
        return 0.5

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
        self.rebuild_grid_index()
        self.current_tick += 1
        sim_time = self.simulation_time()

        # ── Season: change every 240 ticks (spring → summer → autumn → winter) ──
        _SEASONS = ["spring", "summer", "autumn", "winter"]
        season_index = (self.current_tick // 240) % 4
        self.season = _SEASONS[season_index]

        # ── Season-based weather probability: auto-change each tick with low probability ──
        _WEATHER_WEIGHTS: dict[str, dict[str, float]] = {
            "spring": {"sunny": 0.50, "cloudy": 0.30, "rainy": 0.20, "stormy": 0.00, "snowy": 0.00},
            "summer": {"sunny": 0.40, "cloudy": 0.20, "rainy": 0.15, "stormy": 0.25, "snowy": 0.00},
            "autumn": {"sunny": 0.30, "cloudy": 0.35, "rainy": 0.25, "stormy": 0.10, "snowy": 0.00},
            "winter": {"sunny": 0.20, "cloudy": 0.30, "rainy": 0.10, "stormy": 0.05, "snowy": 0.35},
        }
        if random.random() < 0.05:  # 5% chance each tick to change weather
            weights = _WEATHER_WEIGHTS[self.season]
            weather_choices = list(weights.keys())
            weather_probs = [weights[w] for w in weather_choices]
            chosen = random.choices(weather_choices, weights=weather_probs, k=1)[0]
            self.weather = WeatherType(chosen)

        # ── Season mood baseline nudge (spring +0.1, winter -0.1) ─────────
        _SEASON_MOOD_NUDGE = {"spring": 0.1, "summer": 0.0, "autumn": 0.0, "winter": -0.1}
        season_nudge = _SEASON_MOOD_NUDGE.get(self.season, 0.0)
        if season_nudge != 0.0:
            for agent in self.agents:
                if random.random() < abs(season_nudge):
                    self.shift_resident_mood(agent, 1 if season_nudge > 0 else -1, "weather")

        for agent in self.agents:
            if agent.resident.energy < 0.2:
                self.set_resident_mood(agent, "tired", "energy")
            self.update_mental_state(agent.resident)

        # ── Mood contagion: co-occupants influence each other's mood ──────
        from engine.act import apply_mood_contagion
        apply_mood_contagion(self)

        # ── End-of-day diary generation at 22:00 (tick index 44 / 48) ────
        _EOD_TICK_IN_DAY = 44  # 22 * (tick_per_day / 24) = 22 * 2
        if (self.current_tick % self.config.tick_per_day) == _EOD_TICK_IN_DAY:
            from engine.diary import generate_diary_entry
            for agent in self.agents:
                generate_diary_entry(agent, self)

        # Collect current position of every agent as movement updates.
        # The backend simulation loop (backend/core/simulation.py) calls
        # perceive/plan/act before tick(); by the time tick() runs the
        # agents' positions have already been updated for this step.
        movements = [
            MovementUpdate(
                id=a.resident.id,
                x=a.resident.x,
                y=a.resident.y,
                action="walking" if a.current_path else "standing",
            )
            for a in self.agents
            if a.resident.location is None
        ]

        energy_updates = [
            EnergyUpdate(id=a.resident.id, energy=round(a.resident.energy, 3))
            for a in self.agents
        ]

        # Clear path cache after tick so the next tick's agent cycle starts fresh
        self.path_cache.clear()

        return TickState(
            tick=self.current_tick,
            time=sim_time,
            movements=movements,
            weather=self.weather.value,
            season=self.season,
            energy_updates=energy_updates,
        )

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

    def _bucket_key(self, x: int, y: int) -> Tuple[int, int]:
        return (x // self.grid_chunk_size, y // self.grid_chunk_size)

    def __repr__(self) -> str:
        return (
            f"World(tick={self.current_tick}, "
            f"agents={len(self.agents)}, "
            f"buildings={len(self.buildings)})"
        )
