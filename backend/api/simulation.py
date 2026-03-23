from __future__ import annotations

import asyncio
from collections import Counter
import logging
import math
import random
from dataclasses import asdict, is_dataclass
from typing import Any, Literal, Optional

from fastapi import APIRouter, Body, Request
from pydantic import BaseModel

_log = logging.getLogger(__name__)


def _log_task_exception(task: asyncio.Task) -> None:  # type: ignore[type-arg]
    """Callback for fire-and-forget tasks — logs exceptions instead of silently dropping them."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        _log.warning("Background task %s failed: %s", task.get_name(), exc)

from backend.api.schemas import (
    DialogueHistoryEntryResponse,
    EconomyStatsResponse,
    KnowledgeGraphEdge,
    KnowledgeGraphNode,
    KnowledgeGraphResponse,
    OccupationDistEntry,
    PopulationHistoryEntryResponse,
    MarketStatsResponse,
    ScenarioDataResponse,
    SimulationStatsResponse,
    SimulationStatusResponse,
    TimelineEventResponse,
    WhatIfRelationshipSnapshot,
    WhatIfRequest,
    WhatIfResidentSnapshot,
    WhatIfResponse,
    WhatIfStateSnapshot,
    api_error,
    error_responses,
)
from backend.core.simulation import SimulationLoop
from backend.llm.client import validate_llm_config
from engine.types import EventUpdate, RelationType, VoteUpdate


router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class SpeedRequest(BaseModel):
    speed: Literal[1, 2, 5, 10, 50]


class StartRequest(BaseModel):
    scene: str = "modern_community"   # template slug, e.g. "seaside_village"


_MOOD_SCORES = {
    "ecstatic": 1.0,
    "excited": 0.8,
    "happy": 1.0,
    "content": 0.3,
    "neutral": 0.0,
    "calm": 0.1,
    "tired": -0.2,
    "sad": -1.0,
    "angry": -0.9,
    "fearful": -0.7,
}


def _mood_score(mood: str | None) -> float:
    if not mood:
        return 0.0
    return _MOOD_SCORES.get(mood.strip().lower(), 0.0)


class SimulationState:
    def __init__(self) -> None:
        import logging
        from backend.world.town import load_scenario
        self._log = logging.getLogger(__name__)
        self.world = load_scenario()
        self.loop = SimulationLoop(self.world, tick_handler=self._tick)
        self._task: Optional[asyncio.Task[None]] = None
        self._events: list[dict[str, Any]] = []
        self._experiment_history: list[dict[str, Any]] = []
        self._max_experiment_history_ticks = max(200, self.world.config.tick_per_day * 30)
        # Dialogue tasks fired in previous ticks; results are harvested each tick
        self._pending_dialogues: list[asyncio.Task] = []
        # Maps dialogue task → (resident_a_id, resident_b_id) — replaces dynamic attrs
        self._dialogue_pair_ids: dict[asyncio.Task, tuple[str, str]] = {}
        # frozenset pairs of resident ids that have an in-flight dialogue task
        self._active_dialogue_pairs: set[frozenset] = set()
        # Active persistent events: list of dicts with remaining_ticks, radius, description
        self._active_events: list[dict[str, Any]] = []
        self._total_dialogue_count = 0
        self._total_relationship_change_count = 0
        self._dialogue_history: list[dict[str, Any]] = []
        # Mood history: list of {tick, resident_id, resident_name, mood} (max 100 ticks)
        self._mood_history: list[dict[str, Any]] = []
        # Achievement tracking
        self._achievements_store: dict[str, set[str]] = {}
        self._buildings_visited: dict[str, set[str]] = {}
        self._rel_events_fired: set = set()
        # World timeline: list of timeline event dicts (max 500)
        self._world_timeline: list[dict[str, Any]] = []
        self._population_history: list[dict[str, Any]] = []
        self._trade_history: list[dict[str, Any]] = []
        self._active_votes: list[dict[str, Any]] = []
        self._vote_history: list[dict[str, Any]] = []
        self.building_visit_log: list[dict[str, Any]] = []
        self._timeline_id_counter: int = 0
        # Quest system
        self._active_quests: list[dict[str, Any]] = []
        self._completed_quests: list[str] = []
        self._replay_snapshots: list[dict[str, Any]] = []
        self._state_lock: asyncio.Lock = asyncio.Lock()
        # Performance monitoring
        self._tick_durations: list[float] = []  # last N tick durations in ms
        self._max_tick_history = 50
        self._pending_llm_count = 0
        self._adaptive_throttle_active = False

    async def restore_from_neo4j(self) -> None:
        """Restore prior session state at startup.

        Order (spec §12):
          1. Redis — short-term memories (fast, but no positions yet)
          2. Neo4j — long-term memories, reflections, relationships;
                     home-position reset is skipped when Redis has positions
          3. Redis — positions applied last so they override Neo4j's home reset
        """
        # --- Step 1: Redis short-term memories (no position apply yet) ---
        redis_positions = await self._restore_redis_memories()

        # --- Step 2: Neo4j long-term data ---
        neo4j_ok = False
        try:
            from backend.db.neo4j import load_residents, restore_world_memories
            existing = await load_residents()
            if not existing:
                self._log.info("Neo4j: no prior session data found, starting fresh.")
            else:
                # Skip home-reset if Redis will supply fresher positions
                await restore_world_memories(
                    self.world,
                    skip_position_reset=bool(redis_positions),
                )
                self._log.info("Neo4j: session restored (%d residents).", len(existing))
                neo4j_ok = True
        except Exception as exc:
            self._log.warning("Neo4j restore skipped: %s", exc)

        # --- Step 3: Redis positions (override Neo4j home default) ---
        if redis_positions:
            agent_map = {a.resident.id: a for a in self.world.agents}
            applied = 0
            for rid, (x, y) in redis_positions.items():
                if rid in agent_map:
                    agent_map[rid].resident.x = x
                    agent_map[rid].resident.y = y
                    applied += 1
            self._log.info(
                "Redis: applied cached positions for %d/%d agents%s.",
                applied, len(self.world.agents),
                " (override Neo4j home reset)" if neo4j_ok else "",
            )

    async def _restore_redis_memories(self) -> dict:
        """Re-hydrate short-term memories from Redis; return cached positions dict.

        Returns the positions dict so the caller can apply them after Neo4j.
        Silently skips on failure.
        """
        positions: dict = {}
        try:
            from backend.db.redis import load_agent_positions, load_cached_memories
            from engine.types import Memory

            # Short-term memories
            for agent in self.world.agents:
                cached = await load_cached_memories(agent.resident.id)
                for row in cached:
                    try:
                        mem = Memory(
                            id=row["id"],
                            content=row["content"],
                            timestamp=row["timestamp"],
                            importance=float(row["importance"]),
                            emotion=row["emotion"],
                            source=row.get("source", "system"),
                        )
                        agent.memory_stream.add(mem)
                    except Exception as exc:
                        self._log.warning("Skipping malformed cached memory: %s", exc)

            positions = await load_agent_positions()
        except Exception as exc:
            self._log.debug("Redis memory restore skipped: %s", exc)
        return positions

    # Keep backward-compat alias used by _restore_from_redis callers in tests
    async def _restore_from_redis(self) -> None:
        await self._restore_redis_memories()

    @property
    def pending_events(self) -> list[dict[str, Any]]:
        return self._events

    async def start(self) -> None:
        import logging
        _log = logging.getLogger(__name__)

        async with self._state_lock:
            if self._task is not None and not self._task.done():
                return

            try:
                validate_llm_config()
            except ValueError as exc:
                _log.warning(
                    "%s — starting in rule-only mode (llm_call_probability=0).", exc
                )
                # Patch config so _tick() skips LLM calls gracefully
                object.__setattr__(self.world.config, "llm_call_probability", 0.0)

            self._task = asyncio.create_task(self.loop.start())
            await asyncio.sleep(0)

    async def stop(self) -> None:
        async with self._state_lock:
            await self._stop_unlocked()

    def set_speed(self, speed: int) -> None:
        if speed not in {1, 2, 5, 10, 50}:
            raise ValueError("Input should be 1, 2, 5, 10 or 50")
        self.loop.clock.set_speed(float(speed))

    async def _stop_unlocked(self) -> None:
        """Stop the loop without acquiring _state_lock (caller must hold it)."""
        await self.loop.stop()
        if self._task is not None:
            await self._task
            self._task = None

    def _clear_session_state(self) -> None:
        """Reset all session-level counters and caches (called during reset)."""
        for task in self._pending_dialogues:
            task.cancel()
        self._pending_dialogues.clear()
        self._dialogue_pair_ids.clear()
        self._active_dialogue_pairs.clear()
        self._events.clear()
        self._active_events.clear()
        self._mood_history = []
        self._total_dialogue_count = 0
        self._total_relationship_change_count = 0
        self._dialogue_history = []
        self._achievements_store = {}
        self._buildings_visited = {}
        self._rel_events_fired = set()
        self._world_timeline = []
        self._population_history = []
        self._trade_history = []
        self._active_votes = []
        self._vote_history = []
        self._timeline_id_counter = 0
        self._active_quests = []
        self._completed_quests = []
        self._replay_snapshots = []

    async def reset_with_scene(self, scene_slug: str) -> None:
        """Stop simulation and reload a named preset template.

        Args:
            scene_slug: Template file stem, e.g. ``"seaside_village"``.
                        Falls back to ``"modern_community"`` if the file is
                        not found.
        """
        import pathlib
        from backend.world.town import load_scenario

        templates_dir = pathlib.Path(__file__).parent.parent / "world" / "templates"
        template_path = templates_dir / f"{scene_slug}.json"
        if not template_path.exists():
            self._log.warning(
                "Scene template '%s' not found; using modern_community.", scene_slug
            )
            template_path = templates_dir / "modern_community.json"

        async with self._state_lock:
            await self._stop_unlocked()
            self._clear_session_state()
            self.world = load_scenario(template_path)
            self.loop = SimulationLoop(self.world, tick_handler=self._tick)
            self._task = None

    async def reset_with_scenario(self, scenario_data: dict[str, Any]) -> None:
        """Stop simulation and replace the world with a custom scenario."""
        from backend.world.town import load_scenario_from_dict

        async with self._state_lock:
            await self._stop_unlocked()
            self._clear_session_state()
            self.world = load_scenario_from_dict(scenario_data)
            self.loop = SimulationLoop(self.world, tick_handler=self._tick)
            self._task = None
            self._experiment_history = []
            self._max_experiment_history_ticks = max(200, self.world.config.tick_per_day * 30)

    def save_state(self) -> dict[str, Any]:
        """Serialise the full simulation state to a JSON-compatible dict."""
        from dataclasses import asdict as _asdict
        from engine.types import Relationship

        agents_data = []
        for agent in self.world.agents:
            res = agent.resident
            memories = [_asdict(m) for m in agent.memory_stream.all]
            reflections = [_asdict(r) for r in agent.reflections]
            agents_data.append({
                "resident": _asdict(res),
                "memories": memories,
                "total_added": agent.memory_stream.total_added,
                "last_reflect_at": agent.memory_stream._last_reflect_at,
                "reflections": reflections,
                "current_path": list(agent.current_path),
                "building_ticks_remaining": getattr(agent, "_building_ticks_remaining", None),
            })

        relationships = [
            _asdict(rel)
            for rel in self.world.relationships.values()
        ]

        buildings = [_asdict(b) for b in self.world.buildings]
        grid = [list(row) for row in self.world.grid]
        config = _asdict(self.world.config)

        return {
            "tick": self.world.current_tick,
            "config": config,
            "grid": grid,
            "buildings": buildings,
            "agents": agents_data,
            "relationships": relationships,
            "weather": self.world.weather.value if hasattr(self.world.weather, "value") else str(self.world.weather),
            "season": self.world.season,
            "clock_speed": self.loop.clock.speed,
            "running": self.loop.running,
            "total_dialogue_count": getattr(self, "_total_dialogue_count", 0),
            "total_relationship_change_count": getattr(self, "_total_relationship_change_count", 0),
            "dialogue_history": list(getattr(self, "_dialogue_history", [])),
            "achievements": {k: list(v) for k, v in getattr(self, "_achievements_store", {}).items()},
            "mood_history": list(getattr(self, "_mood_history", [])),
            "active_events": list(getattr(self, "_active_events", [])),
            "world_timeline": list(getattr(self, "_world_timeline", [])),
            "population_history": list(getattr(self, "_population_history", [])),
            "trade_history": list(getattr(self, "_trade_history", [])),
            "active_votes": list(getattr(self, "_active_votes", [])),
            "vote_history": list(getattr(self, "_vote_history", [])),
            "timeline_id_counter": getattr(self, "_timeline_id_counter", 0),
            "rel_events_fired": [list(x) for x in getattr(self, "_rel_events_fired", set())],
            "buildings_visited": {k: list(v) for k, v in getattr(self, "_buildings_visited", {}).items()},
            "active_quests": list(getattr(self, "_active_quests", [])),
            "completed_quests": list(getattr(self, "_completed_quests", [])),
            "replay_snapshots": list(getattr(self, "_replay_snapshots", [])),
        }

    async def load_state(self, data: dict[str, Any]) -> None:
        """Stop simulation and restore world from a previously saved dict."""
        from backend.core.simulation import SimulationLoop
        from engine.generative_agent import GenerativeAgent
        from engine.memory import MemoryStream
        from engine.types import (
            Building, DiaryEntry, Item, Memory, MoodEntry, Reflection, Relationship, RelationType, Resident, WorldConfig,
        )
        from engine.world import World

        await self.stop()
        for task in self._pending_dialogues:
            task.cancel()
        self._pending_dialogues.clear()
        self._dialogue_pair_ids.clear()
        self._active_dialogue_pairs.clear()
        self._events.clear()
        self._active_events.clear()
        self._mood_history = []
        self._total_dialogue_count = 0
        self._total_relationship_change_count = 0
        self._dialogue_history = []
        self._achievements_store = {}
        self._buildings_visited = {}
        self._rel_events_fired = set()
        self._world_timeline = []
        self._population_history = []
        self._trade_history = []
        self._active_votes = []
        self._vote_history = []
        self._timeline_id_counter = 0
        self._active_quests = []
        self._completed_quests = []

        # Rebuild config
        cfg_data = data.get("config", {})
        config = WorldConfig(**{k: v for k, v in cfg_data.items() if hasattr(WorldConfig, k)})

        world = World(config=config)
        world.current_tick = data.get("tick", 0)

        # Restore buildings
        for b in data.get("buildings", []):
            world.add_building(Building(
                id=b["id"], type=b["type"], name=b["name"],
                capacity=b["capacity"], position=tuple(b["position"]),  # type: ignore[arg-type]
            ))

        # Restore grid
        for y, row in enumerate(data.get("grid", [])):
            for x, val in enumerate(row):
                if 0 <= y < config.map_height_tiles and 0 <= x < config.map_width_tiles:
                    world.grid[y][x] = bool(val)

        # Restore agents
        for ad in data.get("agents", []):
            res_data = ad["resident"]
            resident = Resident(
                id=res_data["id"], name=res_data["name"],
                personality=res_data["personality"],
                goals=list(res_data.get("goals", [])),
                mood=res_data.get("mood", "neutral"),
                location=res_data.get("location"),
                x=res_data.get("x", 0), y=res_data.get("y", 0),
                home_building_id=res_data.get("home_building_id"),
                skin_color=res_data.get("skin_color"),
                hair_style=res_data.get("hair_style"),
                hair_color=res_data.get("hair_color"),
                outfit_color=res_data.get("outfit_color"),
                current_goal=res_data.get("current_goal"),
                coins=res_data.get("coins", 100),
                occupation=res_data.get("occupation", "unemployed"),
                skills=dict(res_data.get("skills", {})),
                inventory=[Item(**item) for item in res_data.get("inventory", [])],
                energy=float(res_data.get("energy", 1.0)),
                age_days=int(res_data.get("age_days", 0)),
                mood_history=[MoodEntry(**entry) for entry in res_data.get("mood_history", [])],
                mental_state=res_data.get("mental_state", "stable"),
                low_mood_ticks=int(res_data.get("low_mood_ticks", 0)),
            )
            for d in res_data.get("diary", []):
                resident.diary.append(DiaryEntry(
                    id=d["id"], date=d["date"], tick=d["tick"], summary=d["summary"],
                ))
            agent = GenerativeAgent(resident)

            ms = MemoryStream(config)
            for m in ad.get("memories", []):
                ms._memories.append(Memory(**m))
            ms._total_added = ad.get("total_added", 0)
            ms._last_reflect_at = ad.get("last_reflect_at", 0)
            agent.memory_stream = ms

            agent.reflections = [
                Reflection(**r) for r in ad.get("reflections", [])
            ]
            agent.current_path = [tuple(p) for p in ad.get("current_path", [])]
            if ad.get("building_ticks_remaining") is not None:
                agent._building_ticks_remaining = ad["building_ticks_remaining"]

            world.add_agent(agent)

        # Restore relationships
        for rel_data in data.get("relationships", []):
            world.relationships[(rel_data["from_id"], rel_data["to_id"])] = Relationship(
                from_id=rel_data["from_id"],
                to_id=rel_data["to_id"],
                type=RelationType(rel_data["type"]),
                intensity=rel_data["intensity"],
                reason=rel_data.get("reason", ""),
            )

        self.world = world

        # Restore weather and season
        from engine.types import WeatherType
        weather_val = data.get("weather", "sunny")
        try:
            world.weather = WeatherType(weather_val)
        except ValueError:
            world.weather = WeatherType.sunny
        world.season = data.get("season", "spring")

        # Restore simulation counters and per-session state
        self._total_dialogue_count = data.get("total_dialogue_count", 0)
        self._total_relationship_change_count = data.get("total_relationship_change_count", 0)
        self._dialogue_history = list(data.get("dialogue_history", []))
        self._achievements_store = {k: set(v) for k, v in data.get("achievements", {}).items()}
        self._mood_history = list(data.get("mood_history", []))
        self._active_events = list(data.get("active_events", []))
        self._world_timeline = list(data.get("world_timeline", []))
        self._population_history = list(data.get("population_history", []))
        self._trade_history = list(data.get("trade_history", []))
        self._active_votes = list(data.get("active_votes", []))
        self._vote_history = list(data.get("vote_history", []))
        self._timeline_id_counter = data.get("timeline_id_counter", 0)
        self._rel_events_fired = {tuple(x) for x in data.get("rel_events_fired", [])}
        self._buildings_visited = {k: set(v) for k, v in data.get("buildings_visited", {}).items()}
        self._active_quests = list(data.get("active_quests", []))
        self._completed_quests = list(data.get("completed_quests", []))
        self._replay_snapshots = list(data.get("replay_snapshots", []))

        # Restore loop with saved speed/running state
        saved_speed = float(data.get("clock_speed", 1.0))
        from backend.core.clock import SimulationClock
        clock = SimulationClock(speed=saved_speed if saved_speed in {0.0, 1.0, 2.0, 5.0, 10.0, 50.0} else 1.0)
        self.loop = SimulationLoop(self.world, clock=clock, tick_handler=self._tick)
        self._task = None
        self._experiment_history = []
        self._max_experiment_history_ticks = max(200, self.world.config.tick_per_day * 30)

        # Resume simulation if it was running when saved
        if data.get("running", False):
            await self.start()

    def get_status(self) -> dict[str, Any]:
        return {
            "running": self.loop.running,
            "speed": int(self.loop.clock.speed) if self.loop.clock.speed else 0,
            "tick": self.world.current_tick,
        }

    def _ensure_stats_counters(self) -> None:
        if not hasattr(self, "_total_dialogue_count"):
            self._total_dialogue_count = 0
        if not hasattr(self, "_total_relationship_change_count"):
            self._total_relationship_change_count = 0
        if not hasattr(self, "_dialogue_history"):
            self._dialogue_history = []

    def _ensure_performance_counters(self) -> None:
        if not hasattr(self, "_tick_durations"):
            self._tick_durations = []
        if not hasattr(self, "_max_tick_history"):
            self._max_tick_history = 50
        if not hasattr(self, "_pending_llm_count"):
            self._pending_llm_count = 0
        if not hasattr(self, "_adaptive_throttle_active"):
            self._adaptive_throttle_active = False

    def get_stats(self) -> dict[str, Any]:
        self._ensure_stats_counters()
        residents = [agent.resident for agent in self.world.agents]
        resident_social = {
            resident.id: {"count": 0, "intensity": 0.0, "name": resident.name}
            for resident in residents
        }
        strongest_relationship: dict[str, Any] | None = None

        for relationship in self.world.relationships.values():
            intensity = float(relationship.intensity)
            for resident_id in (relationship.from_id, relationship.to_id):
                if resident_id in resident_social:
                    resident_social[resident_id]["count"] += 1
                    resident_social[resident_id]["intensity"] += intensity

            if strongest_relationship is None or intensity > strongest_relationship["intensity"]:
                strongest_relationship = {
                    "from_id": relationship.from_id,
                    "from_name": resident_social.get(relationship.from_id, {}).get("name", relationship.from_id),
                    "to_id": relationship.to_id,
                    "to_name": resident_social.get(relationship.to_id, {}).get("name", relationship.to_id),
                    "type": relationship.type.value if hasattr(relationship.type, "value") else str(relationship.type),
                    "intensity": intensity,
                }

        most_social_resident = None
        loneliest_resident = None
        if residents:
            ranked_desc = sorted(
                residents,
                key=lambda resident: (
                    -resident_social[resident.id]["count"],
                    -resident_social[resident.id]["intensity"],
                    resident.name,
                    resident.id,
                ),
            )
            ranked_asc = sorted(
                residents,
                key=lambda resident: (
                    resident_social[resident.id]["count"],
                    resident_social[resident.id]["intensity"],
                    resident.name,
                    resident.id,
                ),
            )
            most = ranked_desc[0]
            least = ranked_asc[0]
            most_social_resident = {
                "id": most.id,
                "name": most.name,
                "relationship_count": resident_social[most.id]["count"],
                "relationship_intensity": round(resident_social[most.id]["intensity"], 2),
            }
            loneliest_resident = {
                "id": least.id,
                "name": least.name,
                "relationship_count": resident_social[least.id]["count"],
                "relationship_intensity": round(resident_social[least.id]["intensity"], 2),
            }

        average_mood_score = 0.0
        if residents:
            average_mood_score = round(
                sum(_mood_score(resident.mood) for resident in residents) / len(residents),
                2,
            )

        return {
            "total_ticks": self.world.current_tick,
            "total_dialogues": self._total_dialogue_count,
            "total_relationship_changes": self._total_relationship_change_count,
            "active_events": len(self._events) + len(self._active_events),
            "average_mood_score": average_mood_score,
            "most_social_resident": most_social_resident,
            "loneliest_resident": loneliest_resident,
            "strongest_relationship": strongest_relationship,
            "total_memories": sum(len(agent.memory_stream.all) for agent in self.world.agents),
        }

    def snapshot(self) -> dict[str, Any]:
        tick_state = self.loop.last_tick_state

        return {
            "tick": self.world.current_tick,
            "running": self.loop.running,
            "speed": int(self.loop.clock.speed) if self.loop.clock.speed else 0,
            "weather": self.world.weather.value if hasattr(self.world.weather, "value") else str(self.world.weather),
            "season": self.world.season,
            "residents": [asdict(agent.resident) for agent in self.world.agents],
            "buildings": [
                {
                    **asdict(building),
                    "occupants": len(self.world.get_occupants(building.id)),
                }
                for building in self.world.buildings
            ],
            "pending_events": list(self._events),
            "last_tick": _serialize(tick_state) if tick_state is not None else None,
            # Initial relationship graph — lets the frontend graph populate immediately
            "relationships": [
                {
                    "from_id": rel.from_id,
                    "to_id": rel.to_id,
                    "type": rel.type.value if hasattr(rel.type, "value") else str(rel.type),
                    "intensity": rel.intensity,
                    "familiarity": rel.familiarity,
                    "reason": rel.reason,
                }
                for rel in self.world.relationships.values()
            ],
            "active_votes": list(getattr(self, "_active_votes", [])),
            "vote_history": list(getattr(self, "_vote_history", []))[-20:],
        }

    def _build_replay_snapshot(self) -> dict[str, Any]:
        return {
            "tick": self.world.current_tick,
            "time": self.world.simulation_time(),
            "weather": self.world.weather.value if hasattr(self.world.weather, "value") else str(self.world.weather),
            "season": self.world.season,
            "residents": [asdict(agent.resident) for agent in self.world.agents],
            "relationships": [
                {
                    "from_id": rel.from_id,
                    "to_id": rel.to_id,
                    "type": rel.type.value if hasattr(rel.type, "value") else str(rel.type),
                    "intensity": rel.intensity,
                    "familiarity": rel.familiarity,
                    "reason": rel.reason,
                }
                for rel in self.world.relationships.values()
            ],
        }

    def _maybe_record_replay_snapshot(self) -> dict[str, Any] | None:
        if self.world.current_tick <= 0 or self.world.current_tick % 100 != 0:
            return None

        snapshot = self._build_replay_snapshot()
        existing_index = next(
            (index for index, item in enumerate(self._replay_snapshots) if item["tick"] == snapshot["tick"]),
            None,
        )
        if existing_index is None:
            self._replay_snapshots.append(snapshot)
        else:
            self._replay_snapshots[existing_index] = snapshot
        self._replay_snapshots = self._replay_snapshots[-50:]
        return snapshot

    def get_replay_snapshots(self) -> list[dict[str, Any]]:
        return list(self._replay_snapshots[-50:])

    def get_replay_snapshot(self, tick: int) -> dict[str, Any] | None:
        for snapshot in self._replay_snapshots:
            if snapshot["tick"] == tick:
                return snapshot
        return None

    def _ensure_vote_state(self) -> None:
        if not hasattr(self, "_active_votes"):
            self._active_votes = []
        if not hasattr(self, "_vote_history"):
            self._vote_history = []

    def create_vote(self, issue: str, options: list[str], duration_ticks: int) -> dict[str, Any]:
        self._ensure_vote_state()
        start_tick = self.world.current_tick
        vote = {
            "id": f"vote-{start_tick}-{len(self._active_votes) + len(self._vote_history) + 1}",
            "issue": issue,
            "options": list(options),
            "counts": {option: 0 for option in options},
            "status": "active",
            "start_tick": start_tick,
            "end_tick": start_tick + duration_ticks,
            "winning_option": None,
            "result_announced": False,
            "total_votes": 0,
            "votes_by_resident": {},
            "effects": [],
        }
        self._active_votes.append(vote)
        self._add_timeline_event(
            "vote_started",
            f"社区发起投票：{issue}",
            {"vote_id": vote["id"], "issue": issue, "options": list(options)},
        )
        return self._serialize_vote(vote)

    def get_active_votes(self) -> list[dict[str, Any]]:
        self._ensure_vote_state()
        return [self._serialize_vote(vote) for vote in self._active_votes]

    def get_vote_history(self) -> list[dict[str, Any]]:
        self._ensure_vote_state()
        return [self._serialize_vote(vote) for vote in reversed(self._vote_history)]

    def _serialize_vote(self, vote: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": vote["id"],
            "issue": vote["issue"],
            "options": list(vote["options"]),
            "counts": dict(vote["counts"]),
            "status": vote["status"],
            "start_tick": vote["start_tick"],
            "end_tick": vote["end_tick"],
            "winning_option": vote.get("winning_option"),
            "result_announced": bool(vote.get("result_announced", False)),
            "total_votes": int(vote.get("total_votes", 0)),
            "effects": list(vote.get("effects", [])),
        }

    def _cast_vote_score(self, agent: Any, vote: dict[str, Any], option: str) -> float:
        resident = agent.resident
        issue = vote["issue"]
        option_text = option.lower()
        personality = (resident.personality or "").lower()
        mood = (resident.mood or "").lower()
        score = 0.0

        proactive_keywords = ("建", "扩建", "举办", "开放", "增加", "改善", "支持", "公园", "park")
        conservative_keywords = ("维持", "暂缓", "反对", "取消", "搁置", "现状")

        if any(keyword in option for keyword in proactive_keywords):
            score += 0.8
        if any(keyword in option for keyword in conservative_keywords):
            score -= 0.4
        if "公园" in issue or "park" in issue.lower():
            if "公园" in option or "park" in option_text:
                score += 0.8
            elif any(keyword in option for keyword in conservative_keywords):
                score -= 0.2

        if any(keyword in personality for keyword in ("外向", "热心", "开朗", "社牛", "community")):
            score += 0.4
        if any(keyword in personality for keyword in ("内向", "保守", "谨慎")):
            score -= 0.2

        if mood in {"happy", "excited", "ecstatic", "content"}:
            score += 0.3
        elif mood in {"sad", "tired", "angry", "fearful"}:
            score -= 0.2

        for other_id, other_option in vote.get("votes_by_resident", {}).items():
            rel = self.world.get_relationship(resident.id, other_id)
            reverse = self.world.get_relationship(other_id, resident.id)
            affinity = 0.0
            for candidate in (rel, reverse):
                if candidate is not None:
                    affinity += float(candidate.intensity) + float(candidate.familiarity)
            if affinity == 0.0:
                continue
            if other_option == option:
                score += affinity * 0.08
            else:
                score -= affinity * 0.04

        return score

    def _vote_participation_probability(self, agent: Any, vote: dict[str, Any]) -> float:
        personality = (agent.resident.personality or "").lower()
        mood = (agent.resident.mood or "").lower()
        probability = 0.45
        if any(keyword in personality for keyword in ("外向", "热心", "开朗", "社牛")):
            probability += 0.25
        if any(keyword in personality for keyword in ("内向", "谨慎", "保守")):
            probability -= 0.1
        if mood in {"happy", "excited", "ecstatic", "content"}:
            probability += 0.15
        elif mood in {"sad", "tired", "angry", "fearful"}:
            probability -= 0.05

        ticks_remaining = max(0, vote["end_tick"] - self.world.current_tick)
        if ticks_remaining <= 1:
            probability = 1.0
        return max(0.1, min(1.0, probability))

    def _find_open_building_position(self) -> tuple[int, int]:
        occupied = {tuple(building.position) for building in self.world.buildings}
        width = self.world.config.map_width_tiles
        height = self.world.config.map_height_tiles
        for y in range(1, max(1, height - 2)):
            for x in range(1, max(1, width - 2)):
                if (x, y) in occupied:
                    continue
                if x + 1 >= width or y + 2 >= height:
                    continue
                if any((x + dx, y + dy) in occupied for dx in range(2) for dy in range(3)):
                    continue
                return x, y
        return 1, 1

    def _apply_vote_result(self, vote: dict[str, Any]) -> list[str]:
        effects: list[str] = []
        winning_option = vote.get("winning_option") or ""
        issue = vote.get("issue", "")
        if "公园" not in f"{issue}{winning_option}" and "park" not in f"{issue}{winning_option}".lower():
            return effects

        park_count = sum(1 for building in self.world.buildings if building.type == "park")
        position = self._find_open_building_position()
        building = {
            "id": f"community_park_{park_count + 1}",
            "type": "park",
            "name": f"社区公园 {park_count + 1}",
            "capacity": 24,
            "position": position,
        }
        from engine.types import Building

        self.world.add_building(Building(**building))
        x, y = position
        self.world.grid[y][x] = True
        for dy in range(1, 3):
            for dx in range(0, 2):
                self.world.grid[y + dy][x + dx] = False
        self.world.path_cache.clear()
        self.world.mark_grid_index_dirty()
        effects.append(f"新增建筑：{building['name']}")
        self._add_timeline_event(
            "vote_effect",
            f"投票结果生效：{building['name']} 已建成",
            {"vote_id": vote["id"], "building_id": building["id"]},
        )
        return effects

    def _process_votes_for_tick(self) -> list[dict[str, Any]]:
        self._ensure_vote_state()
        announcements: list[dict[str, Any]] = []
        next_active_votes: list[dict[str, Any]] = []

        for vote in self._active_votes:
            votes_by_resident = vote.setdefault("votes_by_resident", {})
            for agent in self.world.agents:
                resident_id = agent.resident.id
                if resident_id in votes_by_resident:
                    continue
                if random.random() > self._vote_participation_probability(agent, vote):
                    continue

                ranked_options = sorted(
                    vote["options"],
                    key=lambda option: (
                        -self._cast_vote_score(agent, vote, option),
                        vote["options"].index(option),
                    ),
                )
                selected_option = ranked_options[0]
                votes_by_resident[resident_id] = selected_option
                vote["counts"][selected_option] += 1
                vote["total_votes"] = len(votes_by_resident)

            should_finalize = self.world.current_tick >= vote["end_tick"] or len(votes_by_resident) >= len(self.world.agents)
            if should_finalize:
                winning_option = max(
                    vote["options"],
                    key=lambda option: (vote["counts"][option], -vote["options"].index(option)),
                )
                vote["status"] = "completed"
                vote["winning_option"] = winning_option
                vote["effects"] = self._apply_vote_result(vote)
                vote["result_announced"] = True
                self._vote_history.append(vote)
                self._vote_history = self._vote_history[-100:]
                self._add_timeline_event(
                    "vote_completed",
                    f"投票结束：{vote['issue']}，结果为「{winning_option}」",
                    {"vote_id": vote["id"], "winning_option": winning_option, "effects": list(vote.get("effects", []))},
                )
                announcements.append(self._serialize_vote(vote))
            else:
                next_active_votes.append(vote)

        self._active_votes = next_active_votes
        return announcements

    def _add_timeline_event(
        self,
        event_type: str,
        description: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Append an entry to the world timeline (max 500 entries)."""
        if not hasattr(self, "_world_timeline"):
            self._world_timeline = []
        if not hasattr(self, "_timeline_id_counter"):
            self._timeline_id_counter = 0
        self._timeline_id_counter += 1
        self._world_timeline.append({
            "id": f"tl-{self._timeline_id_counter}",
            "event_type": event_type,
            "description": description,
            "tick": self.world.current_tick,
            "time": self.world.simulation_time(),
            "metadata": metadata or {},
        })
        # Keep only the most recent 500 events
        if len(self._world_timeline) > 500:
            self._world_timeline = self._world_timeline[-500:]

    def _record_dialogue_history(self, dialogue_updates: list, agents_by_id: dict[str, Any]) -> None:
        if not dialogue_updates:
            return

        self._ensure_stats_counters()
        for dialogue in dialogue_updates:
            from_agent = agents_by_id.get(dialogue.from_id)
            to_agent = agents_by_id.get(dialogue.to_id)
            self._dialogue_history.append(
                {
                    "id": f"dlg-{self.world.current_tick}-{len(self._dialogue_history) + 1}",
                    "tick": self.world.current_tick,
                    "time": self.world.simulation_time(),
                    "from_id": dialogue.from_id,
                    "from_name": from_agent.resident.name if from_agent is not None else dialogue.from_id,
                    "to_id": dialogue.to_id,
                    "to_name": to_agent.resident.name if to_agent is not None else dialogue.to_id,
                    "text": dialogue.text,
                    "kind": dialogue.kind,
                }
            )

        if len(self._dialogue_history) > 500:
            self._dialogue_history = self._dialogue_history[-500:]

    def enqueue_event(self, event: dict[str, Any]) -> dict[str, Any]:
        self._events.append(event)
        self._add_timeline_event(
            "custom_event",
            event.get("description", "自定义事件"),
            {"source": event.get("source", "user")},
        )
        return event

    def enqueue_preset_event(self, preset_id: str) -> dict[str, Any] | None:
        """Activate a preset event by slug id.

        Instant events (duration=1) are queued normally.  Multi-tick events
        are added to ``_active_events`` so they persist across ticks.
        Returns the activated event dict, or None if the slug is unknown.
        """
        from backend.world.events import get_preset_by_id
        preset = get_preset_by_id(preset_id)
        if preset is None:
            return None

        if preset.get("duration", 1) > 1:
            self._active_events.append({
                "id": preset["id"],
                "name": preset["name"],
                "description": preset["description"],
                "radius": preset.get("radius", -1),
                "remaining_ticks": preset["duration"],
                "source": "user",
            })
        else:
            # Instant — inject directly into the pending queue
            self._events.append({
                "description": preset["description"],
                "source": "user",
            })
        self._add_timeline_event(
            "preset_event",
            f"预设事件「{preset.get('name', preset_id)}」：{preset.get('description', '')}",
            {"preset_id": preset_id, "name": preset.get("name", preset_id)},
        )
        return preset

    def get_active_events(self) -> list[dict[str, Any]]:
        """Return current active (multi-tick) events with remaining duration."""
        return list(self._active_events)

    async def _tick(self) -> Any:
        import inspect
        import random
        import time
        import uuid

        from engine.types import Event as EngineEvent, WeatherType

        tick_start = time.monotonic()

        queued_events = list(self._events)
        weather = self.world.weather
        tick_time = self.world.simulation_time()

        # Inject user-queued events into world.pending_events so agent.perceive() picks them up
        for ev in queued_events:
            self.world.pending_events.append(EngineEvent(
                id=str(uuid.uuid4()),
                description=ev.get("description", ""),
                timestamp=tick_time,
                source="user",
            ))

        # Inject active persistent events (multi-tick) and decrement their counters
        still_active: list[dict[str, Any]] = []
        for active_ev in getattr(self, "_active_events", []):
            self.world.pending_events.append(EngineEvent(
                id=str(uuid.uuid4()),
                description=active_ev["description"],
                timestamp=tick_time,
                source="user",
            ))
            remaining = active_ev["remaining_ticks"] - 1
            if remaining > 0:
                still_active.append({**active_ev, "remaining_ticks": remaining})
        self._active_events = still_active

        # Stormy weather overrides event: inject storm description when active events absent
        if weather is WeatherType.stormy and not self._active_events:
            self.world.pending_events.append(EngineEvent(
                id=str(uuid.uuid4()),
                description="暴风雨仍在持续，所有人都应该找地方避雨。",
                timestamp=tick_time,
                source="system",
            ))

        cfg = self.world.config

        # Select LLM vs rule-based agents (spec §8)
        llm_candidates = [
            a for a in self.world.agents
            if random.random() < cfg.llm_call_probability
        ]
        llm_agents = set(llm_candidates[: cfg.max_concurrent_llm_calls])

        async def _process_agent(agent):
            """Full 6-step loop via Agent methods (spec §4.1).

            Calls agent.perceive / retrieve / reflect / plan / act / memorize
            so that any Agent subclass can override individual steps.
            """
            tick_time = self.world.simulation_time()
            use_llm = agent in llm_agents

            # Step a — agent.perceive(world)
            events = agent.perceive(self.world)

            # Step f (early) — agent.memorize: heartbeat + perceived events
            # Memorise before retrieve/reflect so the threshold can fire this tick
            heartbeat = EngineEvent(
                id=str(uuid.uuid4()),
                description=f"Tick {self.world.current_tick} at {tick_time}: "
                            f"at {agent.resident.location or 'map'}, mood={agent.resident.mood}",
                timestamp=tick_time,
                source="heartbeat",
            )
            agent.memorize(heartbeat)
            for event in events:
                agent.memorize(event)

            # Neo4j: real-time memory persistence (spec §12: "每 tick 实时写入")
            from backend.db.neo4j import save_memory as _neo4j_save_memory
            for mem in agent.memory_stream.all[-len(events) - 1:]:  # heartbeat + events
                asyncio.create_task(_neo4j_save_memory(agent.resident.id, mem)).add_done_callback(_log_task_exception)

            # Step b — agent.retrieve(query)
            query = " ".join(e.description for e in events) if events else tick_time
            memories = agent.retrieve(query)

            # Step c — agent.reflect(memories)  [only when threshold reached]
            if agent.memory_stream.should_reflect():
                result = agent.reflect(memories)
                if inspect.isawaitable(result):
                    result = await result
                if result is not None:
                    agent.reflections.append(result)
                    # Neo4j: real-time reflection persistence (spec §12)
                    from backend.db.neo4j import save_reflection as _neo4j_save_reflection
                    asyncio.create_task(_neo4j_save_reflection(agent.resident.id, result)).add_done_callback(_log_task_exception)

            # Step d — agent.plan(context)
            # Always call agent.plan(); pass use_llm so the Agent subclass
            # decides internally whether to invoke LLM or fall back to rules.
            context = {
                "events": events,
                "memories": memories,
                "reflections": agent.reflections,
                "use_llm": use_llm,
                "world": self.world,   # used by schedule-driven rule path
            }
            result = agent.plan(context)
            if inspect.isawaitable(result):
                p = await result
            else:
                p = result

            # Weather behaviour modifiers (spec §14)
            if weather is WeatherType.stormy and random.random() < 0.70:
                # Stormy: agents flee to their own home building
                home_id = agent.resident.home_building_id
                if home_id and agent.resident.location is None:
                    home_building = self.world.get_building(home_id)
                    if home_building is not None:
                        p = {"action": "move", "target": list(home_building.position)}

            return agent, p

        # Run all agents concurrently (asyncio.gather handles both sync & async plans)
        results = await asyncio.gather(*[_process_agent(a) for a in self.world.agents])

        # Step e — agent.act(plan, world)  [after all plans collected]
        for agent, p in results:
            agent.act(p, self.world)

        # Rebuild the spatial buckets once after movement so nearby lookups
        # in the social phase avoid scanning every resident.
        self.world.rebuild_grid_index()

        # Social phase — spec §8: dialogue LLM must NOT block the tick.
        # Pattern: fire tasks this tick, harvest completed results next tick.
        from engine.social import (
            DialogueResult,
            decay_relationships,
            initiate_dialogue,
            update_relationships_from_dialogue,
        )
        from engine.types import DialogueUpdate, GossipUpdate

        agents_by_id = {agent.resident.id: agent for agent in self.world.agents}

        # --- Harvest completed dialogue tasks from previous tick(s) ---
        dialogue_updates: list = []
        relationship_deltas: list = []
        gossip_updates: list = []
        still_pending: list = []

        for task in self._pending_dialogues:
            if task.done():
                # Look up pair_ids first, clean up in finally
                pair_ids = self._dialogue_pair_ids.get(task)
                try:
                    result: DialogueResult = task.result()
                    if pair_ids is not None:
                        a_id, b_id = pair_ids
                        for msg in result.messages:
                            other_id = b_id if msg["speaker_id"] == a_id else a_id
                            dialogue_updates.append(
                                DialogueUpdate(
                                    from_id=msg["speaker_id"],
                                    to_id=other_id,
                                    text=msg["text"],
                                )
                            )
                        if result.relationship_delta != 0:
                            agent_a = agents_by_id.get(a_id)
                            agent_b = agents_by_id.get(b_id)
                            if agent_a is not None and agent_b is not None:
                                relationship_deltas.extend(
                                    update_relationships_from_dialogue(
                                        self.world,
                                        agent_a,
                                        agent_b,
                                        float(result.relationship_delta),
                                    )
                                )
                        if result.gossip is not None:
                            gossip_updates.append(
                                GossipUpdate(
                                    speaker_id=a_id,
                                    listener_id=b_id,
                                    target_id=result.gossip["target_id"],
                                    target_name=result.gossip["target_name"],
                                    content=result.gossip["content"],
                                    is_positive=result.gossip["is_positive"],
                                )
                            )
                except Exception:
                    _log.warning("Dialogue task failed: %s", task.get_name(), exc_info=True)
                finally:
                    # Clean up after processing — pop dict + discard active pair
                    self._dialogue_pair_ids.pop(task, None)
                    if pair_ids is not None:
                        self._active_dialogue_pairs.discard(frozenset(pair_ids))
            else:
                still_pending.append(task)

        self._pending_dialogues = still_pending

        # --- Fire new dialogue tasks for nearby pairs this tick ---
        # Skip pairs that already have an in-flight task
        seen_pairs: set = set(self._active_dialogue_pairs)
        dialogue_count = 0

        depressed_agents = [agent for agent in self.world.agents if getattr(agent.resident, "mental_state", "stable") == "depressed"]
        for depressed_agent in depressed_agents:
            if dialogue_count >= cfg.max_dialogues_per_tick:
                break
            nearby = self.world.get_social_candidates(depressed_agent)
            comforter = None
            comfort_score = -1.0
            for candidate in nearby:
                relationship = self.world.get_relationship(candidate.resident.id, depressed_agent.resident.id)
                if relationship is None or relationship.type not in {RelationType.friendship, RelationType.trust, RelationType.love}:
                    continue
                score = float(relationship.intensity) + float(relationship.familiarity)
                if score > comfort_score:
                    comforter = candidate
                    comfort_score = score
            if comforter is None:
                continue
            pair = frozenset([comforter.resident.id, depressed_agent.resident.id])
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            task = asyncio.create_task(initiate_dialogue(comforter, depressed_agent, self.world, comfort_target_id=depressed_agent.resident.id))
            self._dialogue_pair_ids[task] = (comforter.resident.id, depressed_agent.resident.id)
            self._active_dialogue_pairs.add(pair)
            self._pending_dialogues.append(task)
            dialogue_count += 1

        for a in self.world.agents:
            if dialogue_count >= cfg.max_dialogues_per_tick:
                break
            nearby = self.world.get_social_candidates(a)
            for b in nearby:
                pair = frozenset([a.resident.id, b.resident.id])
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                if dialogue_count >= cfg.max_dialogues_per_tick:
                    break
                probability = self.world.get_social_probability(a, b)
                if weather is WeatherType.stormy:
                    probability -= 0.30
                elif weather is WeatherType.snowy:
                    in_cafe = (
                        a.resident.location == b.resident.location
                        and a.resident.location is not None
                        and self.world.get_building(a.resident.location) is not None
                        and self.world.get_building(a.resident.location).type == "cafe"
                    )
                    probability += 0.20 if in_cafe else -0.10

                should_start = random.random() < max(0.0, min(0.95, probability))
                if not should_start:
                    continue
                task = asyncio.create_task(initiate_dialogue(a, b, self.world))
                self._dialogue_pair_ids[task] = (a.resident.id, b.resident.id)
                self._active_dialogue_pairs.add(pair)
                self._pending_dialogues.append(task)
                dialogue_count += 1

        # Tick-end relationship decay is applied after dialogue updates have landed.
        relationship_deltas.extend(decay_relationships(self.world, cfg))

        # Advance tick counter and collect movements
        tick_state = self.world.tick()
        vote_announcements = self._process_votes_for_tick()
        tick_state.vote_updates.extend(VoteUpdate(**vote) for vote in self.get_active_votes())
        tick_state.vote_announcements.extend(VoteUpdate(**vote) for vote in vote_announcements)
        if self.world.current_tick % self.world.config.tick_per_day == 0:
            from engine.lifecycle import process_daily_population

            if not hasattr(self, "_population_history"):
                self._population_history = []
            population_events, population_relationship_deltas, population_summary = process_daily_population(
                self.world
            )
            relationship_deltas.extend(population_relationship_deltas)
            tick_state.population_events.extend(population_events)
            self._population_history.append(
                {
                    "tick": tick_state.tick,
                    "time": tick_state.time,
                    "population": len(self.world.agents),
                    "births": population_summary["births"],
                    "deaths": population_summary["deaths"],
                    "summary": (
                        f"人口 {len(self.world.agents)}，新增 {population_summary['births']}，逝去 {population_summary['deaths']}"
                    ),
                }
            )
            self._population_history = self._population_history[-365:]
            for population_event in population_events:
                self._add_timeline_event(
                    f"population_{population_event.event_type}",
                    population_event.summary or population_event.resident_name,
                    {
                        "resident_id": population_event.resident_id,
                        "resident_name": population_event.resident_name,
                        "event_type": population_event.event_type,
                        "parent_ids": list(population_event.parent_ids),
                        "parent_names": list(population_event.parent_names),
                    },
                )
        tick_state.dialogues.extend(dialogue_updates)
        tick_state.relationships.extend(relationship_deltas)
        tick_state.gossips.extend(gossip_updates)
        self._record_dialogue_history(dialogue_updates, agents_by_id)
        self._ensure_stats_counters()
        self._ensure_performance_counters()
        self._total_dialogue_count += len(tick_state.dialogues)
        self._total_relationship_change_count += len(tick_state.relationships)

        # Record mood snapshot every tick (keep last 100 ticks × N agents)
        current_tick = self.world.current_tick
        if not hasattr(self, "_mood_history"):
            self._mood_history = []
        for agent in self.world.agents:
            self._mood_history.append({
                "tick": current_tick,
                "resident_id": agent.resident.id,
                "resident_name": agent.resident.name,
                "mood": agent.resident.mood,
            })
        # Trim to last 100 ticks
        max_agents = max(1, len(self.world.agents))
        self._mood_history = self._mood_history[-(100 * max_agents):]

        # Collect current goals and include in tick diff
        from engine.types import GoalUpdate
        for agent in self.world.agents:
            goal = getattr(agent.resident, "current_goal", None)
            if goal:
                tick_state.goals.append(GoalUpdate(id=agent.resident.id, goal=goal))

        if queued_events:
            tick_state.events.extend(
                EventUpdate(description=event["description"])
                for event in queued_events
            )
            self._events.clear()
            self.world.pending_events.clear()

        # --- Achievement checks ---
        # Ensure tracking dicts exist (guard for test environments)
        if not hasattr(self, "_achievements_store"):
            self._achievements_store = {}
        if not hasattr(self, "_buildings_visited"):
            self._buildings_visited = {}
        # Track buildings entered this tick for the explorer achievement
        for agent in self.world.agents:
            if agent.resident.location is not None:
                self._buildings_visited.setdefault(agent.resident.id, set()).add(
                    agent.resident.location
                )
        dialogue_resident_ids = {d.from_id for d in tick_state.dialogues} | {
            d.to_id for d in tick_state.dialogues
        }
        from backend.api.achievements import check_and_unlock as _check_achievements
        from engine.types import AchievementUnlock
        for unlock in _check_achievements(self, dialogue_resident_ids):
            tick_state.achievement_unlocks.append(AchievementUnlock(**unlock))
            self._add_timeline_event(
                "achievement",
                f"成就解锁：{unlock.get('resident_name', '')} — {unlock.get('achievement_name', '')}",
                {
                    "resident_id": unlock.get("resident_id", ""),
                    "resident_name": unlock.get("resident_name", ""),
                    "achievement_id": unlock.get("achievement_id", ""),
                    "achievement_name": unlock.get("achievement_name", ""),
                },
            )

        # --- Relationship milestone events ---
        if not hasattr(self, "_rel_events_fired"):
            self._rel_events_fired = set()
        from engine.relationship_events import check_relationship_events as _check_rel_events
        from engine.types import RelationshipEvent
        for ev in _check_rel_events(self.world, self):
            tick_state.relationship_events.append(RelationshipEvent(**ev))
            self._add_timeline_event(
                "relationship_milestone",
                ev.get("dialogue", f"{ev.get('from_name', '')} 与 {ev.get('to_name', '')} 发生了重要事件"),
                {
                    "event_type": ev.get("event_type", ""),
                    "from_id": ev.get("from_id", ""),
                    "from_name": ev.get("from_name", ""),
                    "to_id": ev.get("to_id", ""),
                    "to_name": ev.get("to_name", ""),
                },
            )

        # --- Quest progress checks ---
        from backend.api.quests import check_quest_progress as _check_quest_progress
        for quest_ev in _check_quest_progress(self):
            event_type = quest_ev.get("event", "")
            qid = quest_ev.get("quest_id", "")
            if event_type == "completed":
                self._add_timeline_event(
                    "quest_completed",
                    f"任务完成：{qid}",
                    {"quest_id": qid},
                )
            elif event_type == "failed":
                self._add_timeline_event(
                    "quest_failed",
                    f"任务失败：{qid}",
                    {"quest_id": qid},
                )

        # --- Neo4j persistence (spec §12) ---
        # Real-time: persist relationship changes that occurred this tick
        if relationship_deltas:
            asyncio.create_task(self._persist_relationships()).add_done_callback(_log_task_exception)

        # Snapshot every SNAPSHOT_INTERVAL_TICKS (configurable, default 10)
        interval = cfg.snapshot_interval_ticks
        if interval > 0 and self.world.current_tick % interval == 0:
            asyncio.create_task(self._persist_snapshot()).add_done_callback(_log_task_exception)

        # --- Redis cache (spec §4.1 + §12) ---
        asyncio.create_task(self._redis_tick(tick_state)).add_done_callback(_log_task_exception)
        self._record_experiment_frame(tick_state)
        self._maybe_record_replay_snapshot()

        # Performance: record tick duration and apply adaptive throttling
        tick_duration_ms = (time.monotonic() - tick_start) * 1000
        self._tick_durations.append(tick_duration_ms)
        if len(self._tick_durations) > self._max_tick_history:
            self._tick_durations = self._tick_durations[-self._max_tick_history:]
        self._pending_llm_count = len(self._pending_dialogues)

        # Adaptive throttle: slow down tick rate when too many active agents
        active_agents = len(self.world.agents)
        if active_agents > 20 and not self.loop.clock.is_paused():
            # Scale tick interval: add 50ms per agent above 20
            extra_delay = (active_agents - 20) * 0.05
            if not self._adaptive_throttle_active:
                self._log.info("Adaptive throttle: %d agents, adding %.1fs delay", active_agents, extra_delay)
                self._adaptive_throttle_active = True
            await asyncio.sleep(extra_delay)
        elif self._adaptive_throttle_active:
            self._adaptive_throttle_active = False

        return tick_state

    def _record_experiment_frame(self, tick_state: Any) -> None:
        """Capture a compact per-tick summary for longer-horizon experiment reports."""
        if not hasattr(self, "_experiment_history"):
            self._experiment_history = []
        if not hasattr(self, "_max_experiment_history_ticks"):
            self._max_experiment_history_ticks = 200
        building_names = {building.id: building.name for building in self.world.buildings}
        occupancy: dict[str, int] = {}
        moods: list[dict[str, Any]] = []

        for agent in self.world.agents:
            resident = agent.resident
            moods.append(
                {
                    "id": resident.id,
                    "name": resident.name,
                    "mood": resident.mood,
                }
            )

            if resident.location:
                location_label = building_names.get(resident.location, resident.location)
            else:
                location_label = f"街区 {resident.x // 5}-{resident.y // 5}"
            occupancy[location_label] = occupancy.get(location_label, 0) + 1

        relationships = [
            {
                "from_id": relationship.from_id,
                "to_id": relationship.to_id,
                "type": relationship.type.value if hasattr(relationship.type, "value") else str(relationship.type),
                "intensity": relationship.intensity,
                "reason": relationship.reason,
            }
            for relationship in self.world.relationships.values()
        ]

        relationship_deltas = [
            {
                "from_id": delta.from_id,
                "to_id": delta.to_id,
                "type": delta.type,
                "delta": delta.delta,
            }
            for delta in getattr(tick_state, "relationships", [])
        ]

        dialogues = [
            {
                "from_id": dialogue.from_id,
                "to_id": dialogue.to_id,
                "text": dialogue.text,
            }
            for dialogue in getattr(tick_state, "dialogues", [])
        ]

        events = [event.description for event in getattr(tick_state, "events", [])]

        self._experiment_history.append(
            {
                "tick": tick_state.tick,
                "time": tick_state.time,
                "events": events,
                "dialogues": dialogues,
                "relationship_deltas": relationship_deltas,
                "relationships": relationships,
                "moods": moods,
                "occupancy": occupancy,
            }
        )

        if len(self._experiment_history) > self._max_experiment_history_ticks:
            self._experiment_history = self._experiment_history[-self._max_experiment_history_ticks :]

    async def _redis_tick(self, tick_state: Any) -> None:
        """Fire-and-forget Redis updates every tick (non-blocking)."""
        try:
            from backend.db.redis import publish_tick_event, save_agent_positions
            await save_agent_positions(self.world)
            await publish_tick_event(tick_state)
        except Exception as exc:
            self._log.debug("Redis tick update skipped: %s", exc)

    async def _persist_relationships(self) -> None:
        """Write all current relationship edges to Neo4j (non-blocking fire-and-forget)."""
        try:
            from backend.db.neo4j import save_relationship
            for rel in list(self.world.relationships.values()):
                await save_relationship(rel)
        except Exception as exc:
            self._log.debug("Neo4j relationship persist skipped: %s", exc)

    async def _persist_snapshot(self) -> None:
        """Write full world snapshot to Neo4j every N ticks (non-blocking)."""
        try:
            from backend.db.neo4j import persist_world_snapshot
            await persist_world_snapshot(self.world)
            self._log.debug("Neo4j snapshot at tick %d.", self.world.current_tick)
        except Exception as exc:
            self._log.debug("Neo4j snapshot skipped: %s", exc)


def _serialize(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    return value


def get_simulation_state(request: Request) -> SimulationState:
    state = getattr(request.app.state, "simulation_state", None)
    if state is None:
        raise api_error(503, "simulation state not initialized", "simulation_state_unavailable")
    return state


class CustomScenarioRequest(ScenarioDataResponse):
    pass


@router.post(
    "/start-custom",
    response_model=SimulationStatusResponse,
    responses=error_responses(422, 503),
)
async def start_custom_simulation(
    payload: CustomScenarioRequest, request: Request
) -> SimulationStatusResponse:
    """Replace the current world with a custom scenario payload and start ticking."""
    state = get_simulation_state(request)
    scenario_data = payload.model_dump()
    await state.reset_with_scenario(scenario_data)
    await state.start()
    return SimulationStatusResponse(**state.get_status())


@router.post(
    "/start",
    response_model=SimulationStatusResponse,
    responses=error_responses(422, 503),
)
async def start_simulation(
    request: Request,
    payload: StartRequest = Body(default_factory=StartRequest),
) -> SimulationStatusResponse:
    """Start the simulation, optionally loading a specific preset scene.

    Args:
        payload.scene: Template slug — ``"modern_community"`` (default) or
                       ``"seaside_village"``.  Unknown slugs fall back to the
                       default template.
    """
    state = get_simulation_state(request)
    await state.reset_with_scene(payload.scene)
    await state.start()
    return SimulationStatusResponse(**state.get_status())


@router.post(
    "/stop",
    response_model=SimulationStatusResponse,
    responses=error_responses(503),
)
async def stop_simulation(request: Request) -> SimulationStatusResponse:
    """Stop the active simulation loop and return the latest runtime status."""
    state = get_simulation_state(request)
    await state.stop()
    return SimulationStatusResponse(**state.get_status())


@router.post(
    "/speed",
    response_model=SimulationStatusResponse,
    responses=error_responses(400, 422, 503),
)
async def set_simulation_speed(payload: SpeedRequest, request: Request) -> SimulationStatusResponse:
    """Update the simulation clock speed; accepted values are 1x, 2x, 5x, 10x, and 50x."""
    state = get_simulation_state(request)

    try:
        state.set_speed(payload.speed)
    except ValueError as exc:
        raise api_error(400, str(exc), "invalid_speed") from exc

    return SimulationStatusResponse(**state.get_status())


@router.get(
    "/status",
    response_model=SimulationStatusResponse,
    responses=error_responses(503),
)
async def get_simulation_status(request: Request) -> SimulationStatusResponse:
    """Return whether the simulation is running plus the current speed and tick."""
    state = get_simulation_state(request)
    return SimulationStatusResponse(**state.get_status())


@router.get(
    "/stats",
    response_model=SimulationStatsResponse,
    responses=error_responses(503),
)
async def get_simulation_stats(request: Request) -> SimulationStatsResponse:
    """Return aggregate counters for ticks, dialogues, relationship changes, and active events."""
    state = get_simulation_state(request)
    return SimulationStatsResponse(**state.get_stats())


@router.get(
    "/dialogue-history",
    response_model=list[DialogueHistoryEntryResponse],
    responses=error_responses(503),
)
async def get_dialogue_history(request: Request) -> list[DialogueHistoryEntryResponse]:
    state = get_simulation_state(request)
    history = sorted(
        getattr(state, "_dialogue_history", []),
        key=lambda entry: (entry["tick"], entry["id"]),
        reverse=True,
    )[:50]
    return [DialogueHistoryEntryResponse(**entry) for entry in history]


@router.get("/connections", responses=error_responses(503))
async def get_simulation_connections(request: Request) -> dict[str, int]:
    """Return the current number of active WebSocket clients."""
    get_simulation_state(request)
    from backend.api.ws import manager

    return {"count": manager.count}


@router.get("/mood-history", responses=error_responses(503))
async def get_mood_history(request: Request) -> list[dict[str, Any]]:
    """Return mood snapshots for the last 100 ticks across all residents."""
    state = get_simulation_state(request)
    return getattr(state, "_mood_history", [])


@router.get(
    "/population-history",
    response_model=list[PopulationHistoryEntryResponse],
    responses=error_responses(503),
)
async def get_population_history(request: Request) -> list[PopulationHistoryEntryResponse]:
    """Return the recorded day-level population timeline."""
    state = get_simulation_state(request)
    return [PopulationHistoryEntryResponse(**entry) for entry in getattr(state, "_population_history", [])]


@router.get(
    "/market-stats",
    response_model=MarketStatsResponse,
    responses=error_responses(503),
)
async def get_market_stats(request: Request) -> MarketStatsResponse:
    """Return trade volume and the most active market entities."""
    state = get_simulation_state(request)
    trade_history = getattr(state, "_trade_history", [])
    if not trade_history:
        return MarketStatsResponse()

    item_counts: Counter[str] = Counter()
    trader_counts: Counter[str] = Counter()
    total_items = 0

    for entry in trade_history:
        quantity = int(entry.get("quantity", 0))
        total_items += quantity
        item_name = entry.get("item_name")
        if item_name:
            item_counts[item_name] += quantity
        seller_id = entry.get("seller_id")
        if seller_id:
            trader_counts[seller_id] += 1

    hottest_item = None
    if item_counts:
        hottest_item = max(item_counts.items(), key=lambda item: (item[1], item[0]))[0]
    most_active_trader = None
    if trader_counts:
        most_active_trader = max(trader_counts.items(), key=lambda item: (item[1], item[0]))[0]

    return MarketStatsResponse(
        trade_volume=len(trade_history),
        total_items_traded=total_items,
        hottest_item=hottest_item,
        most_active_trader=most_active_trader,
    )


@router.get("/network-analysis", responses=error_responses(503))
async def get_network_analysis(request: Request) -> list[dict[str, Any]]:
    """Return per-resident centrality metrics from the current relationship graph."""
    state = get_simulation_state(request)
    agent_map = {a.resident.id: a for a in state.world.agents}
    result = []
    for agent in state.world.agents:
        rid = agent.resident.id
        # Outgoing + incoming edges
        outgoing = [r for (f, _), r in state.world.relationships.items() if f == rid]
        incoming = [r for (_, t), r in state.world.relationships.items() if t == rid]
        all_rels = outgoing + incoming
        total = len(all_rels)
        avg_intensity = round(sum(r.intensity for r in all_rels) / total, 3) if total else 0.0
        influence = round(sum(r.intensity for r in outgoing), 3)
        result.append({
            "resident_id": rid,
            "name": agent.resident.name,
            "relationship_count": total,
            "outgoing_count": len(outgoing),
            "incoming_count": len(incoming),
            "avg_intensity": avg_intensity,
            "influence_score": influence,
        })
    # Sort by influence descending
    result.sort(key=lambda x: x["influence_score"], reverse=True)
    return result


@router.get("/economy-stats", response_model=EconomyStatsResponse, responses=error_responses(503))
async def get_economy_stats(request: Request) -> EconomyStatsResponse:
    """Return total coins, averages, richest/poorest resident, and occupation distribution."""
    state = get_simulation_state(request)
    agents = state.world.agents
    if not agents:
        return EconomyStatsResponse(total_coins=0, avg_coins=0.0)

    total = sum(a.resident.coins for a in agents)
    avg = round(total / len(agents), 2)
    richest = max(agents, key=lambda a: a.resident.coins).resident.name
    poorest = min(agents, key=lambda a: a.resident.coins).resident.name

    occ_count: dict[str, int] = {}
    for a in agents:
        occ = getattr(a.resident, "occupation", "unemployed")
        occ_count[occ] = occ_count.get(occ, 0) + 1

    dist = [OccupationDistEntry(occupation=k, count=v) for k, v in sorted(occ_count.items())]
    return EconomyStatsResponse(
        total_coins=total,
        avg_coins=avg,
        richest=richest,
        poorest=poorest,
        occupation_distribution=dist,
    )


class PerformanceResponse(BaseModel):
    avg_tick_duration_ms: float = 0.0
    max_tick_duration_ms: float = 0.0
    active_agents_count: int = 0
    pending_llm_calls: int = 0
    memory_usage_mb: float = 0.0
    websocket_connections: int = 0
    adaptive_throttle_active: bool = False
    tick_history: list[float] = []


@router.get("/performance", response_model=PerformanceResponse, responses=error_responses(503))
async def get_performance(request: Request) -> PerformanceResponse:
    """Return real-time performance metrics for the simulation."""
    import os
    state = get_simulation_state(request)
    durations = getattr(state, "_tick_durations", [])
    avg_ms = sum(durations) / len(durations) if durations else 0.0
    max_ms = max(durations) if durations else 0.0

    # Memory usage of current process
    try:
        import psutil
        process = psutil.Process(os.getpid())
        mem_mb = process.memory_info().rss / (1024 * 1024)
    except Exception:
        # Fallback if psutil not available
        try:
            import resource
            mem_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024)
        except Exception:
            mem_mb = 0.0

    # WebSocket connection count
    from backend.api.ws import manager
    ws_count = manager.count

    return PerformanceResponse(
        avg_tick_duration_ms=round(avg_ms, 2),
        max_tick_duration_ms=round(max_ms, 2),
        active_agents_count=len(state.world.agents),
        pending_llm_calls=getattr(state, "_pending_llm_count", 0),
        memory_usage_mb=round(mem_mb, 1),
        websocket_connections=ws_count,
        adaptive_throttle_active=getattr(state, "_adaptive_throttle_active", False),
        tick_history=[round(d, 1) for d in durations[-20:]],
    )


class SocialIndicatorsResponse(BaseModel):
    gini_coefficient: float = 0.0
    social_cohesion: float = 0.0
    happiness_index: float = 0.0
    population: int = 0
    avg_mood_score: float = 0.0
    total_coins: int = 0
    avg_energy: float = 0.0
    total_relationships: int = 0


def _compute_gini(values: list[float]) -> float:
    """Compute the Gini coefficient from a list of values."""
    if not values or all(v == 0 for v in values):
        return 0.0
    n = len(values)
    sorted_vals = sorted(values)
    cumulative = sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(sorted_vals))
    total = sum(sorted_vals)
    if total == 0:
        return 0.0
    return round(cumulative / (n * total), 4)


@router.get("/social-indicators", response_model=SocialIndicatorsResponse, responses=error_responses(503))
async def get_social_indicators(request: Request) -> SocialIndicatorsResponse:
    """Compute society-level indicators: Gini coefficient, social cohesion, happiness index."""
    state = get_simulation_state(request)
    agents = state.world.agents
    if not agents:
        return SocialIndicatorsResponse()

    # Gini coefficient (coin inequality)
    coin_values = [float(a.resident.coins) for a in agents]
    gini = _compute_gini(coin_values)

    # Social cohesion (average relationship intensity)
    all_rels = state.world.relationships if hasattr(state.world, "relationships") else []
    avg_intensity = 0.0
    total_rels = len(all_rels)
    if total_rels > 0:
        avg_intensity = round(sum(r.intensity for r in all_rels) / total_rels, 3)

    # Happiness index: weighted blend of mood(0.5) + energy(0.3) + wealth(0.2)
    mood_scores = [_mood_score(getattr(a.resident, "mood", "neutral")) for a in agents]
    avg_mood = sum(mood_scores) / len(mood_scores) if mood_scores else 0.0
    # Normalize mood from [-1,1] to [0,1]
    norm_mood = (avg_mood + 1) / 2

    energies = [getattr(a.resident, "energy", 50) for a in agents]
    avg_energy = sum(energies) / len(energies) if energies else 50.0
    norm_energy = min(avg_energy / 100.0, 1.0)

    total_coins = sum(a.resident.coins for a in agents)
    avg_coins = total_coins / len(agents)
    # Normalize wealth: log scale capped at 1000 coins
    import math
    norm_wealth = min(math.log1p(avg_coins) / math.log1p(1000), 1.0)

    happiness = round(0.5 * norm_mood + 0.3 * norm_energy + 0.2 * norm_wealth, 3)

    return SocialIndicatorsResponse(
        gini_coefficient=gini,
        social_cohesion=avg_intensity,
        happiness_index=happiness,
        population=len(agents),
        avg_mood_score=round(avg_mood, 3),
        total_coins=total_coins,
        avg_energy=round(avg_energy, 1),
        total_relationships=total_rels,
    )


@router.get("/timeline", response_model=list[TimelineEventResponse], responses=error_responses(503))
async def get_world_timeline(request: Request) -> list[TimelineEventResponse]:
    """Return the world event timeline sorted by tick descending (newest first, max 200)."""
    state = get_simulation_state(request)
    timeline = getattr(state, "_world_timeline", [])
    sorted_timeline = sorted(timeline, key=lambda e: e["tick"], reverse=True)[:200]
    return [TimelineEventResponse(**entry) for entry in sorted_timeline]


@router.get("/snapshots", responses=error_responses(503))
async def get_simulation_snapshots(request: Request) -> list[dict[str, Any]]:
    state = get_simulation_state(request)
    return state.get_replay_snapshots()


@router.post("/replay/{tick}", responses=error_responses(404, 503))
async def replay_simulation_tick(tick: int, request: Request) -> dict[str, Any]:
    state = get_simulation_state(request)
    snapshot = state.get_replay_snapshot(tick)
    if snapshot is None:
        raise api_error(404, f"snapshot for tick {tick} not found", "snapshot_not_found")
    return snapshot


# ---------------------------------------------------------------------------
# What-If Analysis
# ---------------------------------------------------------------------------


def _build_whatif_snapshot(sim: SimulationState) -> WhatIfStateSnapshot:
    """Build a WhatIfStateSnapshot from the current simulation state."""
    agents = sim.world.agents
    residents = [
        WhatIfResidentSnapshot(
            id=a.resident.id,
            name=a.resident.name,
            mood=a.resident.mood or "neutral",
            coins=a.resident.coins,
            energy=float(a.resident.energy),
            occupation=getattr(a.resident, "occupation", "unemployed"),
            x=a.resident.x,
            y=a.resident.y,
        )
        for a in agents
    ]
    relationships = [
        WhatIfRelationshipSnapshot(
            from_id=rel.from_id,
            to_id=rel.to_id,
            type=rel.type.value if hasattr(rel.type, "value") else str(rel.type),
            intensity=rel.intensity,
        )
        for rel in sim.world.relationships.values()
    ]
    mood_scores = [_mood_score(a.resident.mood) for a in agents]
    avg_mood = round(sum(mood_scores) / len(mood_scores), 3) if mood_scores else 0.0
    total_coins = sum(a.resident.coins for a in agents)
    coin_values = [float(a.resident.coins) for a in agents]
    gini = _compute_gini(coin_values) if coin_values else 0.0

    return WhatIfStateSnapshot(
        tick=sim.world.current_tick,
        population=len(agents),
        avg_mood_score=avg_mood,
        total_coins=total_coins,
        total_relationships=len(sim.world.relationships),
        gini_coefficient=gini,
        residents=residents,
        relationships=relationships,
    )


@router.post(
    "/what-if",
    response_model=WhatIfResponse,
    responses=error_responses(400, 503),
)
async def run_what_if(body: WhatIfRequest, request: Request) -> WhatIfResponse:
    """Run a what-if analysis on a branch copy of the current simulation.

    Creates a deep copy of the world state, optionally applies resident
    modifications and injects events, then runs N ticks on the copy.
    Returns current vs predicted state for comparison.
    """
    import copy
    import uuid

    from engine.generative_agent import GenerativeAgent
    from engine.memory import MemoryStream
    from engine.types import (
        Building,
        DiaryEntry,
        Event as EngineEvent,
        Item,
        Memory,
        MoodEntry,
        Reflection,
        Relationship,
        RelationType,
        Resident,
        WeatherType,
        WorldConfig,
    )
    from engine.world import World

    state = get_simulation_state(request)

    # Snapshot current state before branching
    current_snapshot = _build_whatif_snapshot(state)

    # Deep-copy the world via save_state / manual rebuild (avoids mutating main sim)
    saved = state.save_state()

    cfg_data = saved.get("config", {})
    config = WorldConfig(**{k: v for k, v in cfg_data.items() if hasattr(WorldConfig, k)})
    # Disable LLM calls in branch to keep it fast and deterministic
    object.__setattr__(config, "llm_call_probability", 0.0)

    branch_world = World(config=config)
    branch_world.current_tick = saved.get("tick", 0)

    for b in saved.get("buildings", []):
        branch_world.add_building(Building(
            id=b["id"], type=b["type"], name=b["name"],
            capacity=b["capacity"], position=tuple(b["position"]),
        ))

    for y, row in enumerate(saved.get("grid", [])):
        for x, val in enumerate(row):
            if 0 <= y < config.map_height_tiles and 0 <= x < config.map_width_tiles:
                branch_world.grid[y][x] = bool(val)

    for ad in saved.get("agents", []):
        res_data = ad["resident"]
        resident = Resident(
            id=res_data["id"], name=res_data["name"],
            personality=res_data["personality"],
            goals=list(res_data.get("goals", [])),
            mood=res_data.get("mood", "neutral"),
            location=res_data.get("location"),
            x=res_data.get("x", 0), y=res_data.get("y", 0),
            home_building_id=res_data.get("home_building_id"),
            skin_color=res_data.get("skin_color"),
            hair_style=res_data.get("hair_style"),
            hair_color=res_data.get("hair_color"),
            outfit_color=res_data.get("outfit_color"),
            current_goal=res_data.get("current_goal"),
            coins=res_data.get("coins", 100),
            occupation=res_data.get("occupation", "unemployed"),
            skills=dict(res_data.get("skills", {})),
            inventory=[Item(**item) for item in res_data.get("inventory", [])],
            energy=float(res_data.get("energy", 1.0)),
            age_days=int(res_data.get("age_days", 0)),
            mood_history=[MoodEntry(**entry) for entry in res_data.get("mood_history", [])],
            mental_state=res_data.get("mental_state", "stable"),
            low_mood_ticks=int(res_data.get("low_mood_ticks", 0)),
        )
        for d in res_data.get("diary", []):
            resident.diary.append(DiaryEntry(
                id=d["id"], date=d["date"], tick=d["tick"], summary=d["summary"],
            ))
        agent = GenerativeAgent(resident)
        ms = MemoryStream(config)
        for m in ad.get("memories", []):
            ms._memories.append(Memory(**m))
        ms._total_added = ad.get("total_added", 0)
        ms._last_reflect_at = ad.get("last_reflect_at", 0)
        agent.memory_stream = ms
        agent.reflections = [Reflection(**r) for r in ad.get("reflections", [])]
        agent.current_path = [tuple(p) for p in ad.get("current_path", [])]
        if ad.get("building_ticks_remaining") is not None:
            agent._building_ticks_remaining = ad["building_ticks_remaining"]
        branch_world.add_agent(agent)

    for rel_data in saved.get("relationships", []):
        branch_world.relationships[(rel_data["from_id"], rel_data["to_id"])] = Relationship(
            from_id=rel_data["from_id"],
            to_id=rel_data["to_id"],
            type=RelationType(rel_data["type"]),
            intensity=rel_data["intensity"],
            reason=rel_data.get("reason", ""),
        )

    weather_val = saved.get("weather", "sunny")
    try:
        branch_world.weather = WeatherType(weather_val)
    except ValueError:
        branch_world.weather = WeatherType.sunny
    branch_world.season = saved.get("season", "spring")

    # Apply resident modifications
    agent_map = {a.resident.id: a for a in branch_world.agents}
    for mod in body.resident_mods:
        agent = agent_map.get(mod.resident_id)
        if agent is None:
            continue
        if mod.mood is not None:
            branch_world.set_resident_mood(agent, mod.mood, "event")
        if mod.energy is not None:
            agent.resident.energy = mod.energy
        if mod.coins is not None:
            agent.resident.coins = mod.coins

    # Inject events
    tick_time = branch_world.simulation_time()
    for ev in body.events:
        branch_world.pending_events.append(EngineEvent(
            id=str(uuid.uuid4()),
            description=ev.description,
            timestamp=tick_time,
            source="what-if",
        ))

    # Run N ticks on the branch (rule-based only, no LLM, no persistence)
    for _ in range(body.ticks):
        branch_world.tick()

    # Build a temporary SimulationState-like wrapper for snapshot
    class _BranchSim:
        def __init__(self, world):
            self.world = world

    branch_sim = _BranchSim(branch_world)
    predicted_snapshot = _build_whatif_snapshot(branch_sim)

    return WhatIfResponse(
        ticks_simulated=body.ticks,
        current=current_snapshot,
        predicted=predicted_snapshot,
    )


# ---------------------------------------------------------------------------
# Knowledge Graph
# ---------------------------------------------------------------------------


@router.get(
    "/knowledge-graph",
    response_model=KnowledgeGraphResponse,
    responses=error_responses(503),
)
async def get_knowledge_graph(
    request: Request,
    since_tick: int = 0,
    until_tick: int | None = None,
) -> KnowledgeGraphResponse:
    """Return a global knowledge graph of residents, buildings, and events.

    Nodes: residents (circle), buildings (square), events (diamond).
    Edges: relationships, location occupancy, event participation.
    Optional ``since_tick`` / ``until_tick`` params filter events by tick range.
    """
    state = get_simulation_state(request)
    world = state.world
    max_tick = until_tick if until_tick is not None else world.current_tick

    nodes: list[KnowledgeGraphNode] = []
    edges: list[KnowledgeGraphEdge] = []
    node_ids: set[str] = set()

    # --- Resident nodes ---
    for agent in world.agents:
        r = agent.resident
        nodes.append(KnowledgeGraphNode(
            id=r.id,
            label=r.name,
            type="resident",
            metadata={"mood": r.mood or "neutral", "occupation": getattr(r, "occupation", "unemployed")},
        ))
        node_ids.add(r.id)

    # --- Building nodes ---
    for building in world.buildings:
        nodes.append(KnowledgeGraphNode(
            id=building.id,
            label=building.name,
            type="building",
            metadata={"building_type": building.type, "capacity": building.capacity},
        ))
        node_ids.add(building.id)

    # --- Relationship edges ---
    for rel in world.relationships.values():
        if rel.from_id in node_ids and rel.to_id in node_ids:
            rel_type = rel.type.value if hasattr(rel.type, "value") else str(rel.type)
            edges.append(KnowledgeGraphEdge(
                source=rel.from_id,
                target=rel.to_id,
                label=rel_type,
                tick=world.current_tick,
            ))

    # --- Location edges (who is currently in which building) ---
    for agent in world.agents:
        loc = agent.resident.location
        if loc and loc in node_ids:
            edges.append(KnowledgeGraphEdge(
                source=agent.resident.id,
                target=loc,
                label="located_in",
                tick=world.current_tick,
            ))

    # --- Event nodes + edges from dialogue history ---
    dialogue_history = getattr(state, "_dialogue_history", [])
    for entry in dialogue_history:
        tick = entry.get("tick", 0)
        if tick < since_tick or tick > max_tick:
            continue
        ev_id = f"dlg-{entry.get('id', '')}"
        if ev_id not in node_ids:
            nodes.append(KnowledgeGraphNode(
                id=ev_id,
                label=entry.get("text", "")[:40],
                type="event",
                metadata={"kind": "dialogue", "tick": tick},
            ))
            node_ids.add(ev_id)
        from_id = entry.get("from_id", "")
        to_id = entry.get("to_id", "")
        if from_id in node_ids:
            edges.append(KnowledgeGraphEdge(source=from_id, target=ev_id, label="spoke", tick=tick))
        if to_id in node_ids:
            edges.append(KnowledgeGraphEdge(source=to_id, target=ev_id, label="heard", tick=tick))

    # --- Event nodes from world timeline ---
    world_timeline = getattr(state, "_world_timeline", [])
    for entry in world_timeline:
        tick = entry.get("tick", 0)
        if tick < since_tick or tick > max_tick:
            continue
        ev_id = entry.get("id", "")
        if ev_id and ev_id not in node_ids:
            nodes.append(KnowledgeGraphNode(
                id=ev_id,
                label=entry.get("description", "")[:40],
                type="event",
                metadata={
                    "event_type": entry.get("event_type", ""),
                    "tick": tick,
                },
            ))
            node_ids.add(ev_id)

    return KnowledgeGraphResponse(nodes=nodes, edges=edges)
