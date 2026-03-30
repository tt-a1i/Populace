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
from engine.types import BulletinPost, Disaster, DisasterUpdate, EventUpdate, Festival, FestivalUpdate, Party, RelationType, VoteUpdate


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

_FESTIVAL_BLUEPRINTS: dict[str, dict[str, Any]] = {
    "spring": {
        "name": "春日祭",
        "description": "春日祭开场，全镇居民涌向广场起舞，气氛一下子热了起来。",
        "focus": "全镇集会 + 舞蹈",
        "duration": 12,
        "social_multiplier": 3.0,
        "goal": "参加春日祭",
        "timeline_type": "festival_spring",
    },
    "summer": {
        "name": "夏日烧烤",
        "description": "夏日烧烤已经点火，大家围在户外分享食物和笑声。",
        "focus": "户外聚餐 + 社交加速",
        "duration": 10,
        "social_multiplier": 3.0,
        "goal": "参加夏日烧烤",
        "timeline_type": "festival_summer",
    },
    "autumn": {
        "name": "秋收感恩",
        "description": "秋收感恩开始了，居民们交换收成与礼物，彼此的关系更近一步。",
        "focus": "分享物品 + 友谊加成",
        "duration": 10,
        "social_multiplier": 3.0,
        "goal": "参加秋收感恩",
        "timeline_type": "festival_autumn",
    },
    "winter": {
        "name": "冬日篝火",
        "description": "冬日篝火点亮了夜色，居民围炉夜话，也更愿意回到家人身边。",
        "focus": "围炉夜话 + 家族团聚",
        "duration": 10,
        "social_multiplier": 3.0,
        "goal": "参加冬日篝火",
        "timeline_type": "festival_winter",
    },
    "birthday": {
        "name": "生日小聚",
        "description": "生日小聚开始了，几位亲近的居民围在一起送上祝福。",
        "focus": "生日庆祝",
        "duration": 6,
        "social_multiplier": 2.0,
        "goal": "参加生日小聚",
        "timeline_type": "festival_birthday",
    },
    "achievement": {
        "name": "成就庆典",
        "description": "一场小范围庆典围绕着新的成就展开，朋友和家人都来祝贺。",
        "focus": "成就达成庆祝",
        "duration": 6,
        "social_multiplier": 2.0,
        "goal": "参加成就庆典",
        "timeline_type": "festival_achievement",
    },
}

_DISASTER_BLUEPRINTS: dict[str, dict[str, Any]] = {
    "flood": {
        "duration": 14,
        "goal": "撤离洪水区域",
        "description": "连续暴雨引发洪水，低洼建筑和道路都在告急。",
    },
    "fire": {
        "duration": 8,
        "goal": "远离火场",
        "description": "火势突然蔓延，附近居民需要立刻撤离。",
    },
    "earthquake": {
        "duration": 6,
        "goal": "前往空旷地避险",
        "description": "地震震动了整座小镇，多处建筑出现裂缝。",
    },
    "drought": {
        "duration": 16,
        "goal": "节约资源并支援受影响区域",
        "description": "干旱持续扩大，储备物资和水源都变得紧张。",
    },
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
        # Maps dialogue task → dialogue metadata used when harvesting results.
        self._dialogue_pair_ids: dict[asyncio.Task, dict[str, Any]] = {}
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
        self._zones_visited: dict[str, set[str]] = {}
        self._achievement_unlock_meta: dict[tuple[str, str], int] = {}
        self._mood_positive_streaks: dict[str, int] = {}
        self._work_streaks: dict[str, int] = {}
        self._comfort_counts: dict[str, int] = {}
        self._rel_events_fired: set = set()
        # World timeline: list of timeline event dicts (max 500)
        self._world_timeline: list[dict[str, Any]] = []
        self._population_history: list[dict[str, Any]] = []
        self._trade_history: list[dict[str, Any]] = []
        self._diplomacy_ledger: list[dict[str, Any]] = []
        self._diplomacy_last_route_tick: dict[str, int] = {}
        self._diplomacy_event_log: list[dict[str, Any]] = []
        self._bulletin_posts: list[dict[str, Any]] = []
        self._bulletin_hot_topics: list[dict[str, Any]] = []
        self._bulletin_last_post_tick: dict[str, int] = {}
        self._active_votes: list[dict[str, Any]] = []
        self._vote_history: list[dict[str, Any]] = []
        self._current_mayor: dict[str, Any] | None = None
        self._political_satisfaction: float = 0.5
        self._political_satisfaction_history: list[dict[str, Any]] = []
        self._low_satisfaction_ticks: int = 0
        self._last_policy_tick: int = 0
        self._active_festivals: list[dict[str, Any]] = []
        self._festival_history: list[dict[str, Any]] = []
        self._active_disasters: list[dict[str, Any]] = []
        self._disaster_history: list[dict[str, Any]] = []
        self._consecutive_rainy_ticks: int = 0
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
        self._zones_visited = {}
        self._achievement_unlock_meta = {}
        self._mood_positive_streaks = {}
        self._work_streaks = {}
        self._comfort_counts = {}
        self._rel_events_fired = set()
        self._world_timeline = []
        self._population_history = []
        self._trade_history = []
        self._diplomacy_ledger = []
        self._diplomacy_last_route_tick = {}
        self._diplomacy_event_log = []
        self._bulletin_posts = []
        self._bulletin_hot_topics = []
        self._bulletin_last_post_tick = {}
        self._active_votes = []
        self._vote_history = []
        self._current_mayor = None
        self._political_satisfaction = 0.5
        self._political_satisfaction_history = []
        self._low_satisfaction_ticks = 0
        self._last_policy_tick = 0
        self._active_festivals = []
        self._festival_history = []
        self._active_disasters = []
        self._disaster_history = []
        self._consecutive_rainy_ticks = 0
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
            job = getattr(res, "job", None)
            if job is not None and getattr(res, "occupation", "") and getattr(job, "title", "") != getattr(res, "occupation", ""):
                job.title = str(res.occupation)
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
            "achievement_unlock_meta": {
                f"{resident_id}::{achievement_id}": tick
                for (resident_id, achievement_id), tick in getattr(self, "_achievement_unlock_meta", {}).items()
            },
            "mood_history": list(getattr(self, "_mood_history", [])),
            "active_events": list(getattr(self, "_active_events", [])),
            "world_timeline": list(getattr(self, "_world_timeline", [])),
            "population_history": list(getattr(self, "_population_history", [])),
            "trade_history": list(getattr(self, "_trade_history", [])),
            "diplomacy_ledger": list(getattr(self, "_diplomacy_ledger", [])),
            "diplomacy_last_route_tick": {
                key: int(value) for key, value in getattr(self, "_diplomacy_last_route_tick", {}).items()
            },
            "diplomacy_event_log": list(getattr(self, "_diplomacy_event_log", [])),
            "economic_output": float(getattr(self.world, "economic_output", 0.0)),
            "gdp_history": list(getattr(self.world, "gdp_history", [])),
            "fashion_trend": dict(getattr(self.world, "fashion_trend", {})),
            "fashion_trend_history": list(getattr(self.world, "fashion_trend_history", [])),
            "fashion_purchase_history": list(getattr(self.world, "fashion_purchase_history", [])),
            "fashion_design_history": list(getattr(self.world, "fashion_design_history", [])),
            "external_towns": [
                _asdict(item) if is_dataclass(item) else dict(item)
                for item in getattr(self.world, "external_towns", [])
            ],
            "trade_routes": [
                _asdict(item) if is_dataclass(item) else dict(item)
                for item in getattr(self.world, "trade_routes", [])
            ],
            "bulletin_posts": list(getattr(self, "_bulletin_posts", [])),
            "bulletin_hot_topics": list(getattr(self, "_bulletin_hot_topics", [])),
            "bulletin_last_post_tick": dict(getattr(self, "_bulletin_last_post_tick", {})),
            "active_votes": list(getattr(self, "_active_votes", [])),
            "vote_history": list(getattr(self, "_vote_history", [])),
            "current_mayor": getattr(self, "_current_mayor", None),
            "political_satisfaction": float(getattr(self, "_political_satisfaction", 0.5)),
            "political_satisfaction_history": list(getattr(self, "_political_satisfaction_history", [])),
            "low_satisfaction_ticks": int(getattr(self, "_low_satisfaction_ticks", 0)),
            "last_policy_tick": int(getattr(self, "_last_policy_tick", 0)),
            "active_festivals": list(getattr(self, "_active_festivals", [])),
            "festival_history": list(getattr(self, "_festival_history", [])),
            "active_disasters": list(getattr(self, "_active_disasters", [])),
            "disaster_history": list(getattr(self, "_disaster_history", [])),
            "consecutive_rainy_ticks": int(getattr(self, "_consecutive_rainy_ticks", 0)),
            "timeline_id_counter": getattr(self, "_timeline_id_counter", 0),
            "rel_events_fired": [list(x) for x in getattr(self, "_rel_events_fired", set())],
            "buildings_visited": {k: list(v) for k, v in getattr(self, "_buildings_visited", {}).items()},
            "zones_visited": {k: list(v) for k, v in getattr(self, "_zones_visited", {}).items()},
            "mood_positive_streaks": dict(getattr(self, "_mood_positive_streaks", {})),
            "work_streaks": dict(getattr(self, "_work_streaks", {})),
            "comfort_counts": dict(getattr(self, "_comfort_counts", {})),
            "active_quests": list(getattr(self, "_active_quests", [])),
            "completed_quests": list(getattr(self, "_completed_quests", [])),
            "replay_snapshots": list(getattr(self, "_replay_snapshots", [])),
            "stray_pets": [_asdict(pet) for pet in getattr(self.world, "stray_pets", [])],
            "cultural_events": [_asdict(event) for event in getattr(self.world, "cultural_events", [])],
            "culture_prosperity_history": list(getattr(self.world, "culture_prosperity_history", [])),
            "religious_events": [_asdict(event) for event in getattr(self.world, "religious_events", [])],
            "morality_history": list(getattr(self.world, "morality_history", [])),
        }

    async def load_state(self, data: dict[str, Any]) -> None:
        """Stop simulation and restore world from a previously saved dict."""
        from backend.core.simulation import SimulationLoop
        from engine.generative_agent import GenerativeAgent
        from engine.memory import MemoryStream
        from engine.types import (
            Achievement, Appearance, Building, ClothingItem, Course, CourseHistoryEntry, CulturalEvent, DiaryEntry, Education, ExternalTown, Health, Illness, Item, JealousyEntry, Job, LifeGoal, Memory, MoodEntry, Reflection,
            Pet, Party, Religion, Relationship, RelationType, ReligiousEvent, Resident, TradeRoute, Wish, WorldConfig,
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
        self._zones_visited = {}
        self._achievement_unlock_meta = {}
        self._mood_positive_streaks = {}
        self._work_streaks = {}
        self._comfort_counts = {}
        self._rel_events_fired = set()
        self._world_timeline = []
        self._population_history = []
        self._trade_history = []
        self._diplomacy_ledger = []
        self._diplomacy_last_route_tick = {}
        self._diplomacy_event_log = []
        self._bulletin_posts = []
        self._bulletin_hot_topics = []
        self._bulletin_last_post_tick = {}
        self._active_votes = []
        self._vote_history = []
        self._active_festivals = []
        self._festival_history = []
        self._active_disasters = []
        self._disaster_history = []
        self._consecutive_rainy_ticks = 0
        self._timeline_id_counter = 0
        self._active_quests = []
        self._completed_quests = []

        # Rebuild config
        cfg_data = data.get("config", {})
        config = WorldConfig(**{k: v for k, v in cfg_data.items() if hasattr(WorldConfig, k)})

        world = World(config=config)
        world.current_tick = data.get("tick", 0)
        world.fashion_trend = dict(data.get("fashion_trend", getattr(world, "fashion_trend", {})))
        world.fashion_trend_history = list(data.get("fashion_trend_history", getattr(world, "fashion_trend_history", [])))
        world.fashion_purchase_history = list(data.get("fashion_purchase_history", []))
        world.fashion_design_history = list(data.get("fashion_design_history", []))

        # Restore buildings
        for b in data.get("buildings", []):
            world.add_building(Building(
                id=b["id"], type=b["type"], name=b["name"],
                capacity=b["capacity"], position=tuple(b["position"]),  # type: ignore[arg-type]
                level=int(b.get("level", 1)),
                upgrades=list(b.get("upgrades", [])),
                decoration_score=float(b.get("decoration_score", 0.0)),
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
                appearance=Appearance(**res_data.get("appearance", {})) if res_data.get("appearance") else Appearance(),
                wardrobe=[ClothingItem(**item) for item in res_data.get("wardrobe", [])],
                current_goal=res_data.get("current_goal"),
                coins=res_data.get("coins", 100),
                occupation=res_data.get("occupation", "unemployed"),
                wallet=float(res_data.get("wallet", 0.0)),
                job=Job(**res_data.get("job", {})) if res_data.get("job") else Job(),
                skills=dict(res_data.get("skills", {})),
                inventory=[Item(**item) for item in res_data.get("inventory", [])],
                pets=[Pet(**pet) for pet in res_data.get("pets", [])],
                energy=float(res_data.get("energy", 1.0)),
                age_days=int(res_data.get("age_days", 0)),
                mood_history=[MoodEntry(**entry) for entry in res_data.get("mood_history", [])],
                mental_state=res_data.get("mental_state", "stable"),
                low_mood_ticks=int(res_data.get("low_mood_ticks", 0)),
                party=res_data.get("party", Party.neutral),
                religion=Religion(res_data.get("religion", "none")),
                piety=float(res_data.get("piety", 0.0)),
                morality_score=float(res_data.get("morality_score", 0.5)),
                health=Health(
                    hp=float(res_data.get("health", {}).get("hp", 1.0)),
                    illness=Illness(**res_data["health"]["illness"]) if res_data.get("health", {}).get("illness") else None,
                    recovery_tick=int(res_data.get("health", {}).get("recovery_tick", 0)),
                    work_streak=int(res_data.get("health", {}).get("work_streak", 0)),
                ),
                education=Education(
                    courses=[Course(**course) for course in res_data.get("education", {}).get("courses", [])],
                    knowledge_level=dict(res_data.get("education", {}).get("knowledge_level", {})),
                    course_history=[
                        CourseHistoryEntry(**entry)
                        for entry in res_data.get("education", {}).get("course_history", [])
                    ],
                ),
                artistic_talent=float(res_data.get("artistic_talent", 0.0)),
                life_goal=LifeGoal(**res_data["life_goal"]) if res_data.get("life_goal") else None,
                wishlist=[Wish(**w) for w in res_data.get("wishlist", [])],
                jealousy_targets=[JealousyEntry(**j) for j in res_data.get("jealousy_targets", [])],
            )
            resident.achievements = [Achievement(**entry) for entry in res_data.get("achievements", [])]
            for d in res_data.get("diary", []):
                resident.diary.append(DiaryEntry(**d))
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

        world.stray_pets = [Pet(**pet) for pet in data.get("stray_pets", [])]
        world.cultural_events = [CulturalEvent(**event) for event in data.get("cultural_events", [])]
        world.culture_prosperity_history = list(data.get("culture_prosperity_history", []))
        world.religious_events = [ReligiousEvent(**event) for event in data.get("religious_events", [])]
        world.morality_history = list(data.get("morality_history", []))
        world._rebuild_pet_registry()
        world.economic_output = float(data.get("economic_output", 0.0))
        world.gdp_history = list(data.get("gdp_history", []))
        world.external_towns = [ExternalTown(**town) for town in data.get("external_towns", [])]
        world.trade_routes = [TradeRoute(**route) for route in data.get("trade_routes", [])]

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
        self._achievement_unlock_meta = {}
        for key, tick in data.get("achievement_unlock_meta", {}).items():
            resident_id, _, achievement_id = key.partition("::")
            if resident_id and achievement_id:
                self._achievement_unlock_meta[(resident_id, achievement_id)] = int(tick)
        self._mood_history = list(data.get("mood_history", []))
        self._active_events = list(data.get("active_events", []))
        self._world_timeline = list(data.get("world_timeline", []))
        self._population_history = list(data.get("population_history", []))
        self._trade_history = list(data.get("trade_history", []))
        self._diplomacy_ledger = list(data.get("diplomacy_ledger", []))
        self._diplomacy_last_route_tick = {
            key: int(value) for key, value in data.get("diplomacy_last_route_tick", {}).items()
        }
        self._diplomacy_event_log = list(data.get("diplomacy_event_log", []))
        self._bulletin_posts = list(data.get("bulletin_posts", []))
        self._bulletin_hot_topics = list(data.get("bulletin_hot_topics", []))
        self._bulletin_last_post_tick = {k: int(v) for k, v in data.get("bulletin_last_post_tick", {}).items()}
        self._active_votes = list(data.get("active_votes", []))
        self._vote_history = list(data.get("vote_history", []))
        self._current_mayor = data.get("current_mayor")
        self._political_satisfaction = float(data.get("political_satisfaction", 0.5))
        self._political_satisfaction_history = list(data.get("political_satisfaction_history", []))
        self._low_satisfaction_ticks = int(data.get("low_satisfaction_ticks", 0))
        self._last_policy_tick = int(data.get("last_policy_tick", 0))
        self._active_festivals = list(data.get("active_festivals", []))
        self._festival_history = list(data.get("festival_history", []))
        self._active_disasters = list(data.get("active_disasters", []))
        self._disaster_history = list(data.get("disaster_history", []))
        self._consecutive_rainy_ticks = int(data.get("consecutive_rainy_ticks", 0))
        self._timeline_id_counter = data.get("timeline_id_counter", 0)
        self._rel_events_fired = {tuple(x) for x in data.get("rel_events_fired", [])}
        self._buildings_visited = {k: set(v) for k, v in data.get("buildings_visited", {}).items()}
        self._zones_visited = {k: set(v) for k, v in data.get("zones_visited", {}).items()}
        self._mood_positive_streaks = {k: int(v) for k, v in data.get("mood_positive_streaks", {}).items()}
        self._work_streaks = {k: int(v) for k, v in data.get("work_streaks", {}).items()}
        self._comfort_counts = {k: int(v) for k, v in data.get("comfort_counts", {}).items()}
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
            "politics": self.get_politics_overview(),
            "active_festivals": list(getattr(self, "_active_festivals", [])),
            "festival_history": list(getattr(self, "_festival_history", []))[-20:],
            "active_disasters": list(getattr(self, "_active_disasters", [])),
            "disaster_history": list(getattr(self, "_disaster_history", []))[-20:],
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

    def _ensure_politics_state(self) -> None:
        if not hasattr(self, "_current_mayor"):
            self._current_mayor = None
        if not hasattr(self, "_political_satisfaction"):
            self._political_satisfaction = 0.5
        if not hasattr(self, "_political_satisfaction_history"):
            self._political_satisfaction_history = []
        if not hasattr(self, "_low_satisfaction_ticks"):
            self._low_satisfaction_ticks = 0
        if not hasattr(self, "_last_policy_tick"):
            self._last_policy_tick = 0

        for agent in self.world.agents:
            self.world._ensure_resident_party(agent.resident)

        if (
            self._current_mayor is None
            and self.world.agents
            and not self._political_satisfaction_history
            and self._active_political_vote() is None
            and not any(
                vote.get("category") in {"mayor_election", "impeachment"}
                for vote in getattr(self, "_vote_history", [])
            )
            and int(self.world.current_tick) < 500
        ):
            current_tick = int(self.world.current_tick)
            cycle_start = current_tick - (current_tick % 500)
            candidates = self._rank_political_candidates(limit=1)
            if candidates:
                self._appoint_mayor(candidates[0]["resident_id"], start_tick=cycle_start, term_length=500)

    def _rank_political_candidates(self, *, limit: int = 3) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for agent in self.world.agents:
            resident = agent.resident
            self.world._ensure_resident_party(resident)
            social_trust = sum(
                float(rel.intensity) + float(rel.familiarity)
                for rel in self.world.relationships.values()
                if rel.to_id == resident.id and rel.type in {RelationType.friendship, RelationType.trust, RelationType.love}
            )
            score = (
                float(getattr(resident, "reputation", 0.0)) * 0.6
                + max(0.0, _mood_score(getattr(resident, "mood", "neutral"))) * 0.12
                + float(getattr(getattr(resident, "job", None), "satisfaction", 0.5)) * 0.18
                + min(0.25, social_trust * 0.05)
            )
            rows.append(
                {
                    "resident_id": resident.id,
                    "resident_name": resident.name,
                    "party": resident.party.value if hasattr(resident.party, "value") else str(resident.party),
                    "reputation": round(float(getattr(resident, "reputation", 0.0)), 3),
                    "score": round(score, 4),
                }
            )
        rows.sort(key=lambda item: (-item["score"], -item["reputation"], item["resident_name"], item["resident_id"]))
        return rows[:limit]

    def _serialize_policy(self, policy: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": str(policy.get("type", "")),
            "effect": {
                str(key): round(float(value), 3)
                for key, value in dict(policy.get("effect", {})).items()
            },
            "duration": max(0, int(policy.get("duration", 0))),
            "issued_tick": int(policy.get("issued_tick", 0)),
        }

    def _serialize_mayor(self) -> dict[str, Any] | None:
        self._ensure_politics_state()
        mayor = self._current_mayor
        if mayor is None:
            return None
        agent = self.world.get_agent(str(mayor.get("resident_id", "")))
        if agent is None:
            return None
        self.world._ensure_resident_party(agent.resident)
        return {
            "resident_id": agent.resident.id,
            "resident_name": agent.resident.name,
            "party": str(mayor.get("party") or agent.resident.party.value),
            "term_start": int(mayor.get("term_start", 0)),
            "term_end": int(mayor.get("term_end", 0)),
            "approval": round(float(self._political_satisfaction), 3),
        }

    def _appoint_mayor(self, resident_id: str, *, start_tick: int | None = None, term_length: int = 500) -> dict[str, Any] | None:
        agent = self.world.get_agent(resident_id)
        if agent is None:
            return None
        self.world._ensure_resident_party(agent.resident)
        start = int(self.world.current_tick if start_tick is None else start_tick)
        self._current_mayor = {
            "resident_id": resident_id,
            "term_start": start,
            "term_end": start + term_length,
            "party": agent.resident.party.value,
            "policies": [],
        }
        self._add_timeline_event(
            "mayor_appointed",
            f"{agent.resident.name} 成为新一任镇长。",
            {"resident_id": resident_id, "party": agent.resident.party.value},
        )
        return self._current_mayor

    def _active_political_vote(self) -> dict[str, Any] | None:
        for vote in getattr(self, "_active_votes", []):
            if vote.get("category") in {"mayor_election", "impeachment"}:
                return vote
        return None

    def _compute_public_satisfaction(self) -> float:
        residents = [agent.resident for agent in self.world.agents]
        if not residents:
            return 0.5
        avg_mood = sum(_mood_score(getattr(resident, "mood", "neutral")) for resident in residents) / len(residents)
        avg_safety = sum(float(getattr(resident, "safety_feeling", 1.0)) for resident in residents) / len(residents)
        economic_buffer = min(1.0, float(getattr(self.world, "economic_output", 0.0)) / 200.0)
        unresolved_crimes = sum(1 for event in self.world.get_crime_log() if not event.resolved)
        policy_delta = 0.0
        if self._current_mayor is not None:
            for policy in self._current_mayor.get("policies", []):
                policy_delta += float(policy.get("effect", {}).get("satisfaction_delta", 0.0))
        raw = 0.45 + avg_mood * 0.18 + avg_safety * 0.22 + economic_buffer * 0.08 + policy_delta - min(0.22, unresolved_crimes * 0.03)
        return round(max(0.0, min(1.0, raw)), 3)

    def _stabilize_public_satisfaction(self) -> float:
        target = self._compute_public_satisfaction()
        current = max(0.0, min(1.0, float(getattr(self, "_political_satisfaction", target))))
        delta = max(-0.08, min(0.08, target - current))
        self._political_satisfaction = round(max(0.0, min(1.0, current + delta)), 3)
        return self._political_satisfaction

    def _schedule_political_vote(
        self,
        *,
        issue: str,
        options: list[str],
        category: str,
        duration_ticks: int,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._ensure_vote_state()
        start_tick = self.world.current_tick
        vote = {
            "id": f"{category}-{start_tick}-{len(self._active_votes) + len(self._vote_history) + 1}",
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
            "category": category,
            "metadata": metadata or {},
        }
        self._active_votes.append(vote)
        self._add_timeline_event(
            category,
            issue,
            {"options": list(options), **(metadata or {})},
        )
        return vote

    def _maybe_start_mayor_election(self, *, reason: str = "term_end", duration_ticks: int = 12) -> dict[str, Any] | None:
        self._ensure_politics_state()
        if self._active_political_vote() is not None:
            return None
        candidates = self._rank_political_candidates(limit=min(3, len(self.world.agents)))
        if len(candidates) < 2:
            return None
        options = [candidate["resident_name"] for candidate in candidates]
        candidate_map = {candidate["resident_name"]: candidate["resident_id"] for candidate in candidates}
        candidate_parties = {candidate["resident_id"]: candidate["party"] for candidate in candidates}
        issue = "镇长选举" if reason != "impeachment" else "镇长补选"
        return self._schedule_political_vote(
            issue=issue,
            options=options,
            category="mayor_election",
            duration_ticks=duration_ticks,
            metadata={
                "candidate_map": candidate_map,
                "candidate_parties": candidate_parties,
                "trigger": reason,
            },
        )

    def _maybe_start_impeachment_vote(self, *, duration_ticks: int = 8) -> dict[str, Any] | None:
        self._ensure_politics_state()
        if self._current_mayor is None or self._active_political_vote() is not None:
            return None
        mayor_id = str(self._current_mayor.get("resident_id", ""))
        mayor = self.world.get_agent(mayor_id)
        mayor_name = mayor.resident.name if mayor is not None else mayor_id
        return self._schedule_political_vote(
            issue=f"是否弹劾现任镇长 {mayor_name}",
            options=["支持弹劾", "维持现任"],
            category="impeachment",
            duration_ticks=duration_ticks,
            metadata={
                "mayor_id": mayor_id,
                "mayor_name": mayor_name,
                "party": str(self._current_mayor.get("party", "neutral")),
            },
        )

    def _issue_policy(self) -> dict[str, Any] | None:
        self._ensure_politics_state()
        mayor = self._current_mayor
        if mayor is None:
            return None

        unresolved_crimes = sum(1 for event in self.world.get_crime_log() if not event.resolved)
        if unresolved_crimes >= 2:
            policy_type = "security"
        elif self._political_satisfaction < 0.45:
            policy_type = "welfare"
        elif float(getattr(self.world, "economic_output", 0.0)) < 80:
            policy_type = "tax"
        else:
            party = str(mayor.get("party", "neutral"))
            policy_type = "welfare" if party == Party.progressive.value else "tax" if party == Party.conservative.value else "security"

        effect_map: dict[str, dict[str, float]] = {
            "tax": {"reserve_delta": 22.0, "satisfaction_delta": -0.08},
            "welfare": {"reserve_delta": -18.0, "mood_delta": 0.12, "satisfaction_delta": 0.06},
            "security": {"safety_delta": 0.16, "crime_delta": -0.2, "satisfaction_delta": 0.03},
        }
        policy = {
            "type": policy_type,
            "effect": effect_map[policy_type],
            "duration": 100,
            "issued_tick": int(self.world.current_tick),
        }
        mayor.setdefault("policies", []).insert(0, policy)
        mayor["policies"] = mayor["policies"][:6]
        self._last_policy_tick = int(self.world.current_tick)

        if policy_type == "tax":
            self.world.economic_output = round(float(getattr(self.world, "economic_output", 0.0)) + 22.0, 2)
        elif policy_type == "welfare":
            self.world.economic_output = round(max(0.0, float(getattr(self.world, "economic_output", 0.0)) - 18.0), 2)
            for agent in self.world.agents:
                if _mood_score(agent.resident.mood) < 0.8:
                    self.world.shift_resident_mood(agent, 1, "policy:welfare")
        elif policy_type == "security":
            for agent in self.world.agents:
                agent.resident.safety_feeling = min(1.0, float(getattr(agent.resident, "safety_feeling", 1.0)) + 0.08)
            unresolved = [event for event in self.world.crime_log if not event.resolved]
            if unresolved:
                unresolved[0].resolved = True

        self._add_timeline_event(
            "policy_issued",
            f"镇长发布新政策：{policy_type}",
            {"policy_type": policy_type, "effect": dict(policy["effect"])},
        )
        return policy

    def _tick_political_policies(self) -> None:
        mayor = self._current_mayor
        if mayor is None:
            return
        next_policies: list[dict[str, Any]] = []
        for policy in mayor.get("policies", []):
            next_policy = dict(policy)
            next_policy["duration"] = max(0, int(next_policy.get("duration", 0)) - 1)
            policy_type = str(next_policy.get("type", ""))
            if policy_type == "tax" and self.world.current_tick % 20 == 0:
                self.world.economic_output = round(float(getattr(self.world, "economic_output", 0.0)) + 2.0, 2)
            elif policy_type == "welfare" and self.world.current_tick % 20 == 0:
                for agent in self.world.agents:
                    if _mood_score(agent.resident.mood) < 0.3:
                        self.world.shift_resident_mood(agent, 1, "policy:welfare")
            elif policy_type == "security" and self.world.current_tick % 25 == 0:
                unresolved = [event for event in self.world.crime_log if not event.resolved]
                if unresolved:
                    unresolved[0].resolved = True
            if next_policy["duration"] > 0:
                next_policies.append(next_policy)
        mayor["policies"] = next_policies

    def _update_politics_for_tick(self, tick_state: Any) -> None:
        self._ensure_politics_state()
        self._tick_political_policies()

        satisfaction = self._stabilize_public_satisfaction()
        self._political_satisfaction_history.append(
            {"tick": int(self.world.current_tick), "satisfaction": satisfaction}
        )
        self._political_satisfaction_history = self._political_satisfaction_history[-120:]

        if satisfaction < 0.3:
            self._low_satisfaction_ticks += 1
        else:
            self._low_satisfaction_ticks = 0

        if (
            self._current_mayor is None
            and self.world.current_tick > 0
            and self._active_political_vote() is None
            and not self._active_votes
        ):
            election = self._maybe_start_mayor_election(reason="impeachment", duration_ticks=10)
            if election is not None:
                tick_state.events.append(EventUpdate(description="镇长席位空缺，补选已经启动。"))

        if (
            self._current_mayor is not None
            and self.world.current_tick > 0
            and self.world.current_tick % 100 == 0
            and self.world.current_tick - self._last_policy_tick >= 100
            and self._active_political_vote() is None
        ):
            policy = self._issue_policy()
            if policy is not None:
                tick_state.events.append(EventUpdate(description=f"新政策发布：{policy['type']}"))

        if (
            self._current_mayor is not None
            and int(self._current_mayor.get("term_end", 0)) <= int(self.world.current_tick)
            and self._active_political_vote() is None
        ):
            election = self._maybe_start_mayor_election()
            if election is not None:
                tick_state.events.append(EventUpdate(description="新一轮镇长选举已经启动。"))

        if self._low_satisfaction_ticks >= 120 and self._active_political_vote() is None:
            impeachment = self._maybe_start_impeachment_vote()
            if impeachment is not None:
                self._low_satisfaction_ticks = 0
                tick_state.events.append(EventUpdate(description="居民因长期不满发起了弹劾投票。"))

        if self.world.current_tick % 50 == 0:
            if self._active_political_vote() is not None:
                tick_state.events.append(EventUpdate(description="镇上居民围绕选举和政策争论不休。"))
            elif self._current_mayor is not None and self._current_mayor.get("policies"):
                current_policy = self._current_mayor["policies"][0]
                tick_state.events.append(EventUpdate(description=f"居民们正在讨论最新的 {current_policy['type']} 政策。"))

    def get_politics_overview(self) -> dict[str, Any]:
        self._ensure_politics_state()
        active_election = self._active_political_vote()
        party_distribution = Counter(
            agent.resident.party.value if hasattr(agent.resident.party, "value") else str(agent.resident.party)
            for agent in self.world.agents
        )
        mayor = self._serialize_mayor()
        election_countdown = 500 - (self.world.current_tick % 500)
        if mayor is not None:
            election_countdown = max(0, int(mayor["term_end"]) - int(self.world.current_tick))
        if active_election is not None:
            election_countdown = max(0, int(active_election.get("end_tick", self.world.current_tick)) - int(self.world.current_tick))
        return {
            "mayor": mayor,
            "active_policies": [] if self._current_mayor is None else [self._serialize_policy(policy) for policy in self._current_mayor.get("policies", [])],
            "election_countdown": election_countdown,
            "public_satisfaction": round(float(self._political_satisfaction), 3),
            "party_distribution": {
                Party.progressive.value: int(party_distribution.get(Party.progressive.value, 0)),
                Party.conservative.value: int(party_distribution.get(Party.conservative.value, 0)),
                Party.neutral.value: int(party_distribution.get(Party.neutral.value, 0)),
            },
            "active_election": None if active_election is None else {
                "issue": str(active_election.get("issue", "")),
                "total_votes": int(active_election.get("total_votes", 0)),
                "status": str(active_election.get("status", "active")),
            },
            "impeachment_risk": self._political_satisfaction < 0.3 or any(
                vote.get("category") == "impeachment" for vote in getattr(self, "_active_votes", [])
            ),
        }

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
        category = str(vote.get("category", "community"))

        if category == "mayor_election":
            candidate_map = dict(vote.get("metadata", {}).get("candidate_map", {}))
            candidate_id = candidate_map.get(option)
            if candidate_id is None:
                return 0.0
            candidate_agent = self.world.get_agent(candidate_id)
            if candidate_agent is None:
                return 0.0
            self.world._ensure_resident_party(resident)
            self.world._ensure_resident_party(candidate_agent.resident)
            score = float(getattr(candidate_agent.resident, "reputation", 0.0)) * 1.4
            if resident.party == candidate_agent.resident.party:
                score += 0.7
            relationship = self.world.get_relationship(resident.id, candidate_id)
            reverse = self.world.get_relationship(candidate_id, resident.id)
            for current in (relationship, reverse):
                if current is not None:
                    score += float(current.intensity) * 0.55 + float(current.familiarity) * 0.18
            if candidate_agent.resident.party == Party.progressive and any(keyword in personality for keyword in ("外向", "热心", "开放", "开朗")):
                score += 0.25
            if candidate_agent.resident.party == Party.conservative and any(keyword in personality for keyword in ("保守", "谨慎", "秩序", "稳定")):
                score += 0.25
            if mood in {"happy", "excited", "ecstatic", "content"}:
                score += 0.1
            elif mood in {"sad", "tired", "angry", "fearful"}:
                score -= 0.08
            return score

        if category == "impeachment":
            mayor_id = str(vote.get("metadata", {}).get("mayor_id", ""))
            support_impeachment = "弹劾" in option
            score = (0.45 - float(self._political_satisfaction)) * 1.8 if support_impeachment else float(self._political_satisfaction) * 1.4
            if mayor_id:
                relationship = self.world.get_relationship(resident.id, mayor_id)
                reverse = self.world.get_relationship(mayor_id, resident.id)
                affinity = 0.0
                for current in (relationship, reverse):
                    if current is not None:
                        affinity += float(current.intensity) + float(current.familiarity) * 0.5
                score += -affinity * 0.35 if support_impeachment else affinity * 0.3
            return score

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
        category = str(vote.get("category", "community"))
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
        if category in {"mayor_election", "impeachment"}:
            probability += 0.2
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
        category = str(vote.get("category", "community"))
        combined = f"{issue}{winning_option}"
        combined_lower = combined.lower()
        support_markers = ("同意", "通过", "批准", "支持", "升级", "扩建", "豪华", "approve", "upgrade", "expand", "luxury")

        if category == "mayor_election":
            candidate_map = dict(vote.get("metadata", {}).get("candidate_map", {}))
            winner_id = candidate_map.get(str(winning_option))
            if winner_id:
                mayor = self._appoint_mayor(winner_id, start_tick=int(self.world.current_tick), term_length=500)
                if mayor is not None:
                    winner = self.world.get_agent(winner_id)
                    winner_name = winner.resident.name if winner is not None else str(winning_option)
                    effects.append(f"{winner_name} 当选镇长")
                    self._political_satisfaction = min(0.85, max(0.35, self._political_satisfaction + 0.05))
            return effects

        if category == "impeachment":
            if "弹劾" in str(winning_option):
                mayor_name = str(vote.get("metadata", {}).get("mayor_name", "现任镇长"))
                self._current_mayor = None
                self._last_policy_tick = int(self.world.current_tick)
                effects.append(f"{mayor_name} 被弹劾下台")
            else:
                effects.append("现任镇长暂时保住职位")
                self._political_satisfaction = max(0.2, self._political_satisfaction - 0.02)
            return effects

        if "公园" in combined or "park" in combined_lower:
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

        if ("升级" in combined or "扩建" in combined or "豪华" in combined or "upgrade" in combined_lower) and any(
            marker in str(winning_option).lower() for marker in support_markers
        ):
            target_level = 3 if ("lv3" in combined_lower or "三级" in combined or "豪华" in combined) else 2
            for building in self.world.buildings:
                if building.id not in issue and building.name not in issue:
                    continue
                while building.level < target_level:
                    cost = self.world.get_building_upgrade_cost(building)
                    upgraded = self.world.upgrade_building(
                        building.id,
                        town_funds=self.world.economic_output,
                        vote_passed=True,
                    )
                    if not upgraded:
                        break
                    self.world.economic_output = round(max(0.0, self.world.economic_output - cost), 2)
                    effects.append(f"{building.name} 升至 Lv.{building.level}")
                    self._add_timeline_event(
                        "building_upgrade",
                        f"投票结果生效：{building.name} 升至 Lv.{building.level}",
                        {"vote_id": vote["id"], "building_id": building.id, "level": building.level},
                    )
                break
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
                self.world.adjust_resident_reputation(resident_id, 0.02, "vote_participation")

            should_finalize = self.world.current_tick >= vote["end_tick"]
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
        dialogue_counts: dict[str, int] = {}
        for dialogue in dialogue_updates:
            from_agent = agents_by_id.get(dialogue.from_id)
            to_agent = agents_by_id.get(dialogue.to_id)
            dialogue_counts[dialogue.from_id] = dialogue_counts.get(dialogue.from_id, 0) + 1
            dialogue_counts[dialogue.to_id] = dialogue_counts.get(dialogue.to_id, 0) + 1
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

        for resident_id, count in dialogue_counts.items():
            if count >= 2:
                self.world.adjust_resident_reputation(resident_id, 0.01, "social_active")

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

    def _ensure_festival_state(self) -> None:
        if not hasattr(self, "_active_festivals"):
            self._active_festivals = []
        if not hasattr(self, "_festival_history"):
            self._festival_history = []
        if not hasattr(self, "_active_disasters"):
            self._active_disasters = []
        if not hasattr(self, "_disaster_history"):
            self._disaster_history = []
        if not hasattr(self, "_consecutive_rainy_ticks"):
            self._consecutive_rainy_ticks = 0

    def _ensure_disaster_state(self) -> None:
        if not hasattr(self, "_active_disasters"):
            self._active_disasters = []
        if not hasattr(self, "_disaster_history"):
            self._disaster_history = []
        if not hasattr(self, "_consecutive_rainy_ticks"):
            self._consecutive_rainy_ticks = 0

    def _ensure_bulletin_state(self) -> None:
        if not hasattr(self, "_bulletin_posts"):
            self._bulletin_posts = []
        if not hasattr(self, "_bulletin_hot_topics"):
            self._bulletin_hot_topics = []
        if not hasattr(self, "_bulletin_last_post_tick"):
            self._bulletin_last_post_tick = {}

    def _update_bulletin_board(self) -> None:
        from engine.bulletin import (
            build_bulletin_post,
            infer_bulletin_experience,
            process_bulletin_reactions,
            serialize_posts,
            summarize_hot_topics,
        )

        self._ensure_bulletin_state()
        current_tick = self.world.current_tick
        interval = max(8, self.world.config.tick_per_day // 4)
        new_posts = []

        for agent in self.world.agents:
            resident = agent.resident
            if current_tick - self._bulletin_last_post_tick.get(resident.id, -10_000) < interval:
                continue
            experience = infer_bulletin_experience(self, resident)
            if experience is None:
                continue
            post = build_bulletin_post(resident, tick=current_tick, experience=experience)
            if post is None:
                continue
            self._bulletin_last_post_tick[resident.id] = current_tick
            new_posts.append(post)

        if new_posts:
            process_bulletin_reactions(self.world, new_posts)
            resident_names = {agent.resident.id: agent.resident.name for agent in self.world.agents}
            existing_posts = [dict(item) for item in self._bulletin_posts]
            self._bulletin_posts = serialize_posts(
                [*new_posts, *[
                    BulletinPost(**item)
                    for item in existing_posts
                ]],
                resident_names,
            )[:120]

        topic_source = [
            BulletinPost(**item)
            for item in self._bulletin_posts
            if current_tick - int(item.get("tick", 0)) <= max(interval * 4, self.world.config.tick_per_day)
        ]
        self._bulletin_hot_topics = summarize_hot_topics(topic_source)

    def get_bulletin_board(self) -> dict[str, Any]:
        self._ensure_bulletin_state()
        return {
            "posts": list(self._bulletin_posts),
            "hot_topics": list(self._bulletin_hot_topics),
        }

    def _ensure_diplomacy_state(self) -> None:
        from engine.diplomacy import generate_external_towns

        if not hasattr(self, "_diplomacy_ledger"):
            self._diplomacy_ledger = []
        if not hasattr(self, "_diplomacy_last_route_tick"):
            self._diplomacy_last_route_tick = {}
        if not hasattr(self, "_diplomacy_event_log"):
            self._diplomacy_event_log = []
        if not hasattr(self.world, "external_towns"):
            self.world.external_towns = []
        if not hasattr(self.world, "trade_routes"):
            self.world.trade_routes = []
        if not self.world.external_towns:
            seed = getattr(self.world.config, "seed", None)
            self.world.external_towns = generate_external_towns(seed=seed)

    def _assign_diplomatic_roles(self) -> None:
        from engine.diplomacy import clamp

        self._ensure_diplomacy_state()
        residents = [agent.resident for agent in self.world.agents]
        if not residents:
            return

        resident_ids = {resident.id for resident in residents}
        ambassador_pool = sorted(
            residents,
            key=lambda resident: (
                resident.skills.get("social", 0.0) + resident.reputation * 0.6,
                resident.name,
            ),
            reverse=True,
        )
        assigned: set[str] = set()
        for town in self.world.external_towns:
            if town.ambassador_id in resident_ids and town.ambassador_id is not None:
                assigned.add(town.ambassador_id)
                continue
            ambassador = next(
                (resident for resident in ambassador_pool if resident.id not in assigned),
                ambassador_pool[0],
            )
            town.ambassador_id = ambassador.id
            assigned.add(ambassador.id)

        for town in self.world.external_towns:
            ambassador = next((resident for resident in residents if resident.id == town.ambassador_id), None)
            if ambassador is None:
                continue
            relation_gain = ambassador.skills.get("social", 0.0) * 0.018 + ambassador.reputation * 0.012
            town.relation_score = round(clamp(town.relation_score + relation_gain), 3)

    def _open_trade_routes_if_needed(self) -> None:
        from engine.diplomacy import select_rare_goods, select_trade_goods
        from engine.types import TradeRoute

        self._ensure_diplomacy_state()
        if not self.world.external_towns:
            return

        routed_towns = {route.to_town for route in self.world.trade_routes}
        available_towns = [town for town in self.world.external_towns if town.name not in routed_towns]
        if not available_towns:
            return

        merchant_pool = [
            agent.resident
            for agent in self.world.agents
            if getattr(agent.resident, "occupation", "") in {"merchant", "shopkeeper", "trader"}
            or getattr(agent.resident.job, "title", "") in {"merchant", "shopkeeper", "trader"}
            or agent.resident.skills.get("trading", 0.0) >= 0.45
        ]
        if not merchant_pool:
            return

        merchant = max(
            merchant_pool,
            key=lambda resident: (resident.skills.get("trading", 0.0), resident.reputation, resident.name),
        )
        town = max(
            available_towns,
            key=lambda candidate: (candidate.relation_score, len(candidate.specialties), candidate.name),
        )
        goods = select_trade_goods(town)
        rare_goods = select_rare_goods(town, goods)
        base_profit = round(10.0 + len(goods) * 1.2 + max(0.0, town.relation_score) * 4.5, 2)
        self.world.trade_routes.append(
            TradeRoute(
                from_town="Populace",
                to_town=town.name,
                goods=goods,
                profit_per_tick=base_profit,
                merchant_id=merchant.id,
                rare_goods=rare_goods,
            )
        )

    def _update_diplomacy(self, tick_state: Any | None = None) -> None:
        from engine.diplomacy import calculate_trade_profit, clamp, relation_status, route_id

        self._ensure_diplomacy_state()
        self._assign_diplomatic_roles()
        self._open_trade_routes_if_needed()

        if not self.world.trade_routes:
            return

        current_tick = int(self.world.current_tick)
        safety_stats = self.world.get_safety_stats() if hasattr(self.world, "get_safety_stats") else {"safety_index": 0.8}
        safety_index = float(safety_stats.get("safety_index", 0.8))
        town_map = {town.name: town for town in self.world.external_towns}
        resident_map = {agent.resident.id: agent.resident for agent in self.world.agents}
        rng = getattr(self.world, "rng", random)

        for route in self.world.trade_routes:
            current_route_id = route_id(route)
            last_tick = self._diplomacy_last_route_tick.get(current_route_id)
            if last_tick is not None and current_tick - last_tick < 6:
                continue

            town = town_map.get(route.to_town)
            if town is None:
                continue
            merchant = resident_map.get(route.merchant_id or "")
            trading_skill = merchant.skills.get("trading", 0.3) if merchant is not None else 0.3
            amount = calculate_trade_profit(route, town, trading_skill=trading_skill, safety_index=safety_index)
            event_type = "profit"
            description = f"{town.name} 本轮送来了稳定货运，路线盈利 {amount:.1f}。"

            roll = rng.random()
            relation_label = relation_status(town.relation_score)
            if safety_index < 0.5 and roll < 0.18:
                amount = round(amount * 0.58, 2)
                event_type = "raided"
                description = f"{town.name} 路线遭遇劫掠，本轮利润降至 {amount:.1f}。"
                town.relation_score = round(clamp(town.relation_score - 0.03), 3)
            elif relation_label == "friendly" and roll < 0.3:
                amount = round(amount * 1.2, 2)
                event_type = "harvest_bonus"
                featured = town.specialties[0] if town.specialties else route.goods[-1]
                description = f"{town.name} 本轮送来了高利润{featured}订单。"
            elif relation_label != "tense" and roll < 0.22:
                amount = round(amount * 1.08, 2)
                event_type = "delegation"
                description = f"{town.name} 派出访问代表团，推动了新一轮贸易合作。"
                town.relation_score = round(clamp(town.relation_score + 0.02), 3)

            town.trade_balance = round(town.trade_balance + amount, 2)
            self.world._register_gdp(amount)
            if merchant is not None:
                merchant.wallet = round(merchant.wallet + amount * 0.35, 2)
                if route.rare_goods:
                    self.world.add_inventory_item(
                        merchant,
                        item_name=route.rare_goods[0],
                        quantity=1,
                        value=max(6, int(round(amount / 2))),
                    )

            ledger_entry = {
                "tick": current_tick,
                "type": event_type,
                "town_name": town.name,
                "route_id": current_route_id,
                "amount": amount,
                "description": description,
            }
            self._diplomacy_ledger.insert(0, ledger_entry)
            self._diplomacy_ledger = self._diplomacy_ledger[:120]
            self._diplomacy_event_log.insert(0, ledger_entry)
            self._diplomacy_event_log = self._diplomacy_event_log[:120]
            self._diplomacy_last_route_tick[current_route_id] = current_tick
            if tick_state is not None:
                tick_state.events.append(EventUpdate(description=description))

    def get_diplomacy_overview(self) -> dict[str, Any]:
        from engine.diplomacy import relation_status, route_id

        self._ensure_diplomacy_state()
        resident_map = {agent.resident.id: agent.resident.name for agent in self.world.agents}

        towns = [
            {
                "name": town.name,
                "relation_score": round(float(town.relation_score), 3),
                "relation_status": relation_status(float(town.relation_score)),
                "trade_balance": round(float(town.trade_balance), 2),
                "ambassador_id": town.ambassador_id,
                "ambassador_name": resident_map.get(town.ambassador_id or ""),
                "specialties": list(town.specialties),
            }
            for town in sorted(self.world.external_towns, key=lambda item: item.name)
        ]
        trade_routes = [
            {
                "id": route_id(route),
                "from_town": route.from_town,
                "to_town": route.to_town,
                "goods": list(route.goods),
                "profit_per_tick": round(float(route.profit_per_tick), 2),
                "merchant_id": route.merchant_id,
                "merchant_name": resident_map.get(route.merchant_id or ""),
                "relation_status": relation_status(float(next((town.relation_score for town in self.world.external_towns if town.name == route.to_town), 0.0))),
                "rare_goods": list(route.rare_goods),
            }
            for route in self.world.trade_routes
        ]
        ledger = [
            {
                "tick": int(entry.get("tick", 0)),
                "type": str(entry.get("type", "profit")),
                "town_name": str(entry.get("town_name", "")),
                "route_id": str(entry.get("route_id", "")),
                "amount": round(float(entry.get("amount", 0.0)), 2),
                "description": str(entry.get("description", "")),
            }
            for entry in list(self._diplomacy_ledger)[:20]
        ]
        return {
            "towns": towns,
            "trade_routes": trade_routes,
            "summary": {
                "active_routes": len(trade_routes),
                "total_profit": round(sum(entry["amount"] for entry in ledger), 2),
                "total_trade_balance": round(sum(town["trade_balance"] for town in towns), 2),
            },
            "ledger": ledger,
        }

    def get_festivals(self) -> dict[str, list[dict[str, Any]]]:
        self._ensure_festival_state()
        current = sorted(
            [dict(item) for item in self._active_festivals],
            key=lambda item: item.get("start_tick", 0),
            reverse=True,
        )
        history = sorted(
            [dict(item) for item in self._festival_history],
            key=lambda item: item.get("start_tick", 0),
            reverse=True,
        )
        return {"current": current, "history": history}

    def get_disasters(self) -> dict[str, Any]:
        self._ensure_disaster_state()
        current = sorted(
            [dict(item) for item in self._active_disasters],
            key=lambda item: item.get("tick_start", 0),
            reverse=True,
        )
        history = sorted(
            [dict(item) for item in self._disaster_history],
            key=lambda item: item.get("tick_start", 0),
            reverse=True,
        )
        combined = [*current, *history]
        affected_buildings = {
            building_id
            for entry in combined
            for building_id in entry.get("affected_buildings", [])
        }
        reserve_spent = round(sum(float(entry.get("reserve_spent", 0.0)) for entry in combined), 2)
        by_type = Counter(str(entry.get("type", "unknown")) for entry in combined)
        return {
            "current": current,
            "history": history,
            "summary": {
                "active_count": len(current),
                "history_count": len(history),
                "affected_buildings": len(affected_buildings),
                "total_casualties": sum(int(entry.get("casualties", 0)) for entry in combined),
                "reserve_spent": reserve_spent,
                "by_type": dict(by_type),
            },
        }

    def _disaster_candidate_buildings(self, disaster_type: str) -> list[str]:
        preferred = {
            "flood": {"home", "house", "residence", "shop", "school", "cafe"},
            "fire": {"home", "house", "residence", "cafe", "shop", "clinic"},
            "earthquake": {"home", "house", "residence", "school", "clinic", "hospital", "shop"},
            "drought": {"home", "house", "residence", "school", "shop", "cafe"},
        }.get(disaster_type, set())
        candidates = [
            building
            for building in self.world.buildings
            if not preferred or building.type in preferred
        ]
        candidates.sort(key=lambda building: (-getattr(building, "level", 1), building.id))
        return [building.id for building in candidates]

    def _has_overlapping_disaster(self, disaster_type: str, start_tick: int) -> bool:
        self._ensure_disaster_state()
        for disaster in [*self._active_disasters, *self._disaster_history]:
            if disaster.get("type") != disaster_type:
                continue
            duration = max(1, int(disaster.get("duration", 1)))
            if abs(int(disaster.get("tick_start", 0)) - start_tick) <= duration:
                return True
        return False

    def _start_disaster(
        self,
        disaster_type: str,
        *,
        start_tick: int,
        severity: float | None = None,
    ) -> dict[str, Any] | None:
        blueprint = _DISASTER_BLUEPRINTS.get(disaster_type)
        if blueprint is None or self._has_overlapping_disaster(disaster_type, start_tick):
            return None
        self._ensure_disaster_state()

        rng = getattr(self.world, "rng", random)
        severity_value = round(max(0.35, min(1.0, severity if severity is not None else 0.45 + rng.random() * 0.45)), 2)
        candidate_ids = self._disaster_candidate_buildings(disaster_type)
        if not candidate_ids:
            return None
        affected_count = min(len(candidate_ids), 1 if severity_value < 0.6 else 2 if severity_value < 0.82 else 3)
        affected_buildings = candidate_ids[:affected_count]

        damage_reports = [
            self.world.apply_disaster_damage(building_id, severity_value)
            for building_id in affected_buildings
        ]
        evacuations = self.world.evacuate_residents_from_buildings(affected_buildings, severity_value)
        casualty_threshold = 0.38 if severity_value >= 0.75 else 0.28
        casualties = 0
        evacuated_ids = {str(evacuation.get("resident_id")) for evacuation in evacuations}
        for resident_id in evacuated_ids:
            agent = self.world.get_agent(resident_id)
            if agent is not None and agent.resident.health.hp <= casualty_threshold:
                casualties += 1

        reserve_spent = round(min(float(self.world.economic_output), max(8.0, len(affected_buildings) * severity_value * 18.0)), 2)
        self.world.economic_output = round(max(0.0, float(self.world.economic_output) - reserve_spent), 2)

        for agent in self.world.agents:
            agent.resident.safety_feeling = max(0.0, float(getattr(agent.resident, "safety_feeling", 1.0)) - min(0.45, severity_value * 0.18))
            if agent.resident.id in evacuated_ids:
                self.world.shift_resident_mood(agent, -2, "disaster")
            elif severity_value >= 0.65:
                self.world.shift_resident_mood(agent, -1, "disaster")

        disaster = Disaster(
            type=disaster_type,
            severity=severity_value,
            affected_buildings=affected_buildings,
            tick_start=start_tick,
            duration=int(blueprint["duration"]),
            casualties=casualties,
        )
        payload = asdict(disaster)
        payload["status"] = "active"
        payload["end_tick"] = start_tick + disaster.duration
        payload["reserve_spent"] = reserve_spent
        payload["evacuations"] = len(evacuations)
        payload["damage_reports"] = damage_reports
        payload["goal"] = blueprint["goal"]
        payload["description"] = blueprint["description"]
        self._active_disasters.append(payload)

        self._add_timeline_event(
            f"disaster_{disaster_type}",
            str(blueprint["description"]),
            {
                "type": disaster_type,
                "severity": severity_value,
                "affected_buildings": list(affected_buildings),
                "casualties": casualties,
            },
        )
        return payload

    def _close_finished_disasters(self, tick_state: Any) -> None:
        self._ensure_disaster_state()
        remaining: list[dict[str, Any]] = []
        for disaster in self._active_disasters:
            if self.world.current_tick < int(disaster.get("end_tick", 0)):
                remaining.append(disaster)
                continue

            rebuild_spent = 0.0
            for damage_report in disaster.get("damage_reports", []):
                spent = self.world.rebuild_disaster_damage(
                    str(damage_report.get("building_id", "")),
                    damage_report,
                    reserve_budget=float(self.world.economic_output),
                )
                rebuild_spent += spent
                self.world.economic_output = round(max(0.0, float(self.world.economic_output) - spent), 2)

            memorial = f"{disaster.get('type', 'disaster')} 已结束，居民们开始统计损失并重建受灾区域。"
            completed = dict(disaster)
            completed["status"] = "completed"
            completed["end_tick"] = self.world.current_tick
            completed["reserve_spent"] = round(float(disaster.get("reserve_spent", 0.0)) + rebuild_spent, 2)
            completed["memorial"] = memorial
            self._disaster_history.append(completed)
            self._disaster_history = self._disaster_history[-100:]
            tick_state.events.append(EventUpdate(description=memorial))
            tick_state.disaster_updates.append(
                DisasterUpdate(
                    disaster=Disaster(
                        type=str(completed["type"]),
                        severity=float(completed["severity"]),
                        affected_buildings=list(completed.get("affected_buildings", [])),
                        tick_start=int(completed["tick_start"]),
                        duration=int(completed["duration"]),
                        casualties=int(completed.get("casualties", 0)),
                    ),
                    status="ended",
                    memorial=memorial,
                )
            )

        self._active_disasters = remaining

    def _maybe_start_disaster_for_tick(self, tick_state: Any) -> None:
        self._ensure_disaster_state()
        weather_value = self.world.weather.value if hasattr(self.world.weather, "value") else str(self.world.weather)
        if weather_value in {"rainy", "stormy"}:
            self._consecutive_rainy_ticks += 1
        else:
            self._consecutive_rainy_ticks = 0

        rng = getattr(self.world, "rng", random)
        day_gate = self.world.current_tick % max(6, self.world.config.tick_per_day // 2) == 0
        season_value = self.world.season.value if hasattr(self.world.season, "value") else str(self.world.season)
        started: list[dict[str, Any]] = []

        if self._consecutive_rainy_ticks >= self.world.config.tick_per_day * 5 and rng.random() < 0.4:
            flood = self._start_disaster("flood", start_tick=self.world.current_tick, severity=0.62 + rng.random() * 0.22)
            if flood is not None:
                started.append(flood)
                self._consecutive_rainy_ticks = 0

        if day_gate and rng.random() < 0.05:
            fire = self._start_disaster("fire", start_tick=self.world.current_tick)
            if fire is not None:
                started.append(fire)

        if day_gate and season_value in {"spring", "autumn"} and rng.random() < 0.03:
            quake = self._start_disaster("earthquake", start_tick=self.world.current_tick, severity=0.58 + rng.random() * 0.18)
            if quake is not None:
                started.append(quake)

        if day_gate and season_value in {"summer", "autumn"} and rng.random() < 0.04:
            drought = self._start_disaster("drought", start_tick=self.world.current_tick, severity=0.48 + rng.random() * 0.2)
            if drought is not None:
                started.append(drought)

        for disaster in started:
            tick_state.events.append(EventUpdate(description=str(disaster.get("description", disaster.get("type", "灾害进行中")))))
            tick_state.disaster_updates.append(
                DisasterUpdate(
                    disaster=Disaster(
                        type=str(disaster["type"]),
                        severity=float(disaster["severity"]),
                        affected_buildings=list(disaster.get("affected_buildings", [])),
                        tick_start=int(disaster["tick_start"]),
                        duration=int(disaster["duration"]),
                        casualties=int(disaster.get("casualties", 0)),
                    ),
                    status="started",
                )
            )

    def _festival_location_id(self, festival_type: str) -> str:
        preferred_building_types = {
            "spring": ["park", "plaza", "cafe", "school"],
            "summer": ["park", "cafe", "market", "plaza"],
            "autumn": ["market", "farm", "park", "cafe"],
            "winter": ["home", "cafe", "school", "plaza"],
            "birthday": ["home", "cafe", "park"],
            "achievement": ["school", "cafe", "park", "plaza"],
        }.get(festival_type, ["plaza", "park", "cafe", "home"])
        for building_type in preferred_building_types:
            building = next((item for item in self.world.buildings if item.type == building_type), None)
            if building is not None:
                return building.id
        return self.world.buildings[0].id if self.world.buildings else "town-square"

    def _festival_participants_for_type(
        self,
        festival_type: str,
        anchor_resident_id: str | None = None,
    ) -> list[str]:
        if festival_type in {"spring", "summer", "autumn", "winter"}:
            return [agent.resident.id for agent in self.world.agents]
        if anchor_resident_id is None:
            return []

        participant_ids = {anchor_resident_id}
        anchor_agent = self.world.get_agent(anchor_resident_id)
        if anchor_agent is None:
            return sorted(participant_ids)

        family_members = self.world.get_family_members(anchor_agent.resident)
        participant_ids.update(member.id for member in family_members)
        related = [
            rel
            for rel in self.world.relationships.values()
            if rel.from_id == anchor_resident_id
            and rel.type in {RelationType.friendship, RelationType.trust, RelationType.love}
        ]
        related.sort(key=lambda rel: rel.intensity + rel.familiarity, reverse=True)
        participant_ids.update(rel.to_id for rel in related[:3])
        return sorted(participant_ids)

    def _has_overlapping_festival(self, festival_type: str, start_tick: int) -> bool:
        self._ensure_festival_state()
        all_festivals = list(self._active_festivals) + list(self._festival_history)
        for festival in all_festivals:
            if festival.get("type") != festival_type:
                continue
            if festival_type in {"spring", "summer", "autumn", "winter"} and festival.get("start_tick") // 100 == start_tick // 100:
                return True
            if festival.get("start_tick") == start_tick:
                return True
        return False

    def _start_festival(
        self,
        festival_type: str,
        *,
        start_tick: int,
        anchor_resident_id: str | None = None,
        custom_name: str | None = None,
    ) -> dict[str, Any] | None:
        blueprint = _FESTIVAL_BLUEPRINTS.get(festival_type)
        if blueprint is None or self._has_overlapping_festival(festival_type, start_tick):
            return None
        self._ensure_festival_state()

        participant_ids = self._festival_participants_for_type(festival_type, anchor_resident_id)
        if not participant_ids:
            return None

        festival = Festival(
            name=custom_name or str(blueprint["name"]),
            type=festival_type,
            start_tick=start_tick,
            duration=int(blueprint["duration"]),
            location=self._festival_location_id(festival_type),
            participants=participant_ids,
        )
        festival_payload = asdict(festival)
        festival_payload["status"] = "active"
        festival_payload["end_tick"] = start_tick + festival.duration
        festival_payload["focus"] = blueprint["focus"]
        festival_payload["social_multiplier"] = blueprint["social_multiplier"]
        festival_payload["goal"] = blueprint["goal"]
        festival_payload["description"] = blueprint["description"]
        self._active_festivals.append(festival_payload)

        for resident_id in participant_ids:
            agent = self.world.get_agent(resident_id)
            if agent is None:
                continue
            agent.resident.current_goal = str(blueprint["goal"])
            self.world.shift_resident_mood(agent, 1, "festival")

        self._add_timeline_event(
            str(blueprint["timeline_type"]),
            str(blueprint["description"]),
            {
                "name": festival.name,
                "type": festival.type,
                "location": festival.location,
                "participants": list(festival.participants),
            },
        )
        return festival_payload

    def _close_finished_festivals(self, tick_state: Any) -> None:
        self._ensure_festival_state()
        remaining: list[dict[str, Any]] = []
        for festival in self._active_festivals:
            if self.world.current_tick < int(festival.get("end_tick", 0)):
                remaining.append(festival)
                continue

            completed = dict(festival)
            completed["status"] = "completed"
            completed["end_tick"] = int(completed.get("end_tick", self.world.current_tick))
            memorial = f"{completed['name']} 落幕，居民把这段庆典余温写进了小镇记忆。"
            completed["memorial"] = memorial
            self._festival_history.append(completed)
            tick_state.events.append(EventUpdate(description=memorial))
            tick_state.festival_updates.append(
                FestivalUpdate(
                    festival=Festival(
                        name=completed["name"],
                        type=completed["type"],
                        start_tick=int(completed["start_tick"]),
                        duration=int(completed["duration"]),
                        location=completed["location"],
                        participants=list(completed.get("participants", [])),
                    ),
                    status="ended",
                    memorial=memorial,
                )
            )
            self._add_timeline_event(
                "festival_memorial",
                memorial,
                {"name": completed["name"], "type": completed["type"], "location": completed["location"]},
            )
        self._festival_history = self._festival_history[-100:]
        self._active_festivals = remaining

    def _festival_social_multiplier(self, resident_ids: tuple[str, str] | None = None) -> float:
        self._ensure_festival_state()
        multiplier = 1.0
        for festival in self._active_festivals:
            participants = set(festival.get("participants", []))
            if resident_ids is not None and not set(resident_ids).issubset(participants):
                continue
            multiplier = max(multiplier, float(festival.get("social_multiplier", 1.0)))
        return multiplier

    async def _tick(self) -> Any:
        import inspect
        import random
        import time
        import uuid

        from engine.types import Event as EngineEvent, WeatherType

        tick_start = time.monotonic()
        if not hasattr(self, "_events"):
            self._events = []
        if not hasattr(self, "_active_events"):
            self._active_events = []
        if not hasattr(self, "_pending_dialogues"):
            self._pending_dialogues = []
        if not hasattr(self, "_dialogue_pair_ids"):
            self._dialogue_pair_ids = {}
        if not hasattr(self, "_active_dialogue_pairs"):
            self._active_dialogue_pairs = set()
        if not hasattr(self, "_dialogue_history"):
            self._dialogue_history = []
        if not hasattr(self, "_population_history"):
            self._population_history = []
        if not hasattr(self, "_trade_history"):
            self._trade_history = []
        if not hasattr(self, "_diplomacy_ledger"):
            self._diplomacy_ledger = []
        if not hasattr(self, "_diplomacy_last_route_tick"):
            self._diplomacy_last_route_tick = {}
        if not hasattr(self, "_diplomacy_event_log"):
            self._diplomacy_event_log = []
        if not hasattr(self, "_bulletin_posts"):
            self._bulletin_posts = []
        if not hasattr(self, "_bulletin_hot_topics"):
            self._bulletin_hot_topics = []
        if not hasattr(self, "_bulletin_last_post_tick"):
            self._bulletin_last_post_tick = {}
        if not hasattr(self, "_world_timeline"):
            self._world_timeline = []
        if not hasattr(self, "_timeline_id_counter"):
            self._timeline_id_counter = 0
        if not hasattr(self, "_replay_snapshots"):
            self._replay_snapshots = []
        if not hasattr(self, "_mood_history"):
            self._mood_history = []
        if not hasattr(self, "_active_votes"):
            self._active_votes = []
        if not hasattr(self, "_vote_history"):
            self._vote_history = []
        if not hasattr(self, "_current_mayor"):
            self._current_mayor = None
        if not hasattr(self, "_political_satisfaction"):
            self._political_satisfaction = 0.5
        if not hasattr(self, "_political_satisfaction_history"):
            self._political_satisfaction_history = []
        if not hasattr(self, "_low_satisfaction_ticks"):
            self._low_satisfaction_ticks = 0
        if not hasattr(self, "_last_policy_tick"):
            self._last_policy_tick = 0
        if not hasattr(self, "_achievement_unlock_meta"):
            self._achievement_unlock_meta = {}
        if not hasattr(self, "_buildings_visited"):
            self._buildings_visited = {}
        if not hasattr(self, "_zones_visited"):
            self._zones_visited = {}
        if not hasattr(self, "_mood_positive_streaks"):
            self._mood_positive_streaks = {}
        if not hasattr(self, "_work_streaks"):
            self._work_streaks = {}
        if not hasattr(self, "_comfort_counts"):
            self._comfort_counts = {}
        if not hasattr(self, "_rel_events_fired"):
            self._rel_events_fired = set()
        if not hasattr(self, "_active_festivals"):
            self._active_festivals = []
        if not hasattr(self, "_festival_history"):
            self._festival_history = []

        queued_events = list(self._events)
        weather = self.world.weather
        tick_time = self.world.simulation_time()
        world_rng = getattr(self.world, "rng", random)

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

        active_festival = getattr(self, "_active_festivals", [None])[0] if getattr(self, "_active_festivals", []) else None
        if active_festival is not None:
            self.world.pending_events.append(
                EngineEvent(
                    id=str(uuid.uuid4()),
                    description=str(active_festival.get("description", active_festival.get("name", "庆典进行中"))),
                    timestamp=tick_time,
                    source="system",
                )
            )
            for resident_id in active_festival.get("participants", []):
                agent = self.world.get_agent(resident_id)
                if agent is not None:
                    agent.resident.current_goal = str(active_festival.get("goal", f"参加{active_festival.get('name', '庆典')}"))

        active_disasters = list(getattr(self, "_active_disasters", []))
        for disaster in active_disasters:
            self.world.pending_events.append(
                EngineEvent(
                    id=str(uuid.uuid4()),
                    description=str(disaster.get("description", f"{disaster.get('type', '灾害')} 正在持续")),
                    timestamp=tick_time,
                    source="system",
                )
            )
            affected_buildings = set(disaster.get("affected_buildings", []))
            for agent in self.world.agents:
                occupation = getattr(agent.resident, "occupation", "")
                if agent.resident.location in affected_buildings:
                    agent.resident.current_goal = "撤离到安全区域"
                elif occupation in {"doctor", "emergency"}:
                    agent.resident.current_goal = f"前往{disaster.get('type', '灾害')}现场救援"

        cfg = self.world.config

        # Select LLM vs rule-based agents (spec §8)
        llm_candidates = [
            a for a in self.world.agents
            if world_rng.random() < cfg.llm_call_probability
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
            if weather is WeatherType.stormy and world_rng.random() < 0.70:
                # Stormy: agents flee to their own home building
                home_id = agent.resident.home_building_id
                if home_id and agent.resident.location is None:
                    home_building = self.world.get_building(home_id)
                    if home_building is not None:
                        p = {"action": "move", "target": list(home_building.position)}
            elif active_festival is not None and agent.resident.id in active_festival.get("participants", []):
                festival_building = self.world.get_building(str(active_festival.get("location", "")))
                if festival_building is not None:
                    p = {"action": "move", "target": list(festival_building.position)}

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
                dialogue_meta = self._dialogue_pair_ids.get(task)
                if isinstance(dialogue_meta, tuple):
                    pair_ids = dialogue_meta
                else:
                    pair_ids = None if dialogue_meta is None else dialogue_meta.get("pair")
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
                        if isinstance(dialogue_meta, dict) and dialogue_meta.get("comforter_id"):
                            from engine.achievements import record_comfort_action

                            record_comfort_action(self, dialogue_meta["comforter_id"])
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
        max_dialogues_this_tick = max(1, int(round(cfg.max_dialogues_per_tick * self._festival_social_multiplier())))

        depressed_agents = [agent for agent in self.world.agents if getattr(agent.resident, "mental_state", "stable") == "depressed"]
        for depressed_agent in depressed_agents:
            if dialogue_count >= max_dialogues_this_tick:
                break
            nearby = self.world.get_social_candidates(depressed_agent)
            comforter = None
            comfort_score = -1.0
            for candidate in nearby:
                relationship = self.world.get_relationship(candidate.resident.id, depressed_agent.resident.id)
                if relationship is None or relationship.type not in {RelationType.friendship, RelationType.trust, RelationType.love}:
                    continue
                score = float(relationship.intensity) + float(relationship.familiarity)
                if self.world.are_family(candidate.resident, depressed_agent.resident):
                    score += 0.45
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
            self._dialogue_pair_ids[task] = {
                "pair": (comforter.resident.id, depressed_agent.resident.id),
                "comforter_id": comforter.resident.id,
            }
            self._active_dialogue_pairs.add(pair)
            self._pending_dialogues.append(task)
            dialogue_count += 1

        for a in self.world.agents:
            if dialogue_count >= max_dialogues_this_tick:
                break
            nearby = self.world.get_social_candidates(a)
            for b in nearby:
                pair = frozenset([a.resident.id, b.resident.id])
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                if dialogue_count >= max_dialogues_this_tick:
                    break
                probability = self.world.get_social_probability(a, b) * self._festival_social_multiplier((a.resident.id, b.resident.id))
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

                should_start = world_rng.random() < max(0.0, min(0.95, probability))
                if not should_start:
                    continue
                task = asyncio.create_task(initiate_dialogue(a, b, self.world))
                self._dialogue_pair_ids[task] = {"pair": (a.resident.id, b.resident.id)}
                self._active_dialogue_pairs.add(pair)
                self._pending_dialogues.append(task)
                dialogue_count += 1

        # Tick-end relationship decay is applied after dialogue updates have landed.
        relationship_deltas.extend(decay_relationships(self.world, cfg))

        # Advance tick counter and collect movements
        tick_state = self.world.tick()
        self._update_politics_for_tick(tick_state)
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
            for agent in self.world.agents:
                if agent.resident.age_days > 0 and agent.resident.age_days % 360 == 0:
                    birthday_festival = self._start_festival(
                        "birthday",
                        start_tick=self.world.current_tick,
                        anchor_resident_id=agent.resident.id,
                        custom_name=f"{agent.resident.name}的生日小聚",
                    )
                    if birthday_festival is None:
                        continue
                    tick_state.events.append(EventUpdate(description=f"{agent.resident.name} 迎来了生日小聚。"))
                    tick_state.festival_updates.append(
                        FestivalUpdate(
                            festival=Festival(
                                name=birthday_festival["name"],
                                type=birthday_festival["type"],
                                start_tick=int(birthday_festival["start_tick"]),
                                duration=int(birthday_festival["duration"]),
                                location=birthday_festival["location"],
                                participants=list(birthday_festival.get("participants", [])),
                            ),
                            status="started",
                        )
                    )
        # Romance lifecycle processing (every 5 ticks — confession/proposal/quarrel checks)
        if self.world.current_tick % 5 == 0:
            from engine.romance import process_romance_tick
            romance_events, romance_deltas = process_romance_tick(self.world, getattr(self.world, "rng", None))
            for rev in romance_events:
                tick_state.events.append(EventUpdate(description=rev.description))
            relationship_deltas.extend(romance_deltas)

        # Travel processing (every 3 ticks)
        if self.world.current_tick % 3 == 0:
            from engine.travel import process_travel_tick
            travel_events = process_travel_tick(self.world, getattr(self.world, "rng", None))
            for tev in travel_events:
                tick_state.events.append(EventUpdate(description=tev.description))

        seasonal_festival = self._start_festival(
            str(self.world.season.value if hasattr(self.world.season, "value") else self.world.season),
            start_tick=self.world.current_tick,
        )
        if seasonal_festival is not None:
            tick_state.events.append(EventUpdate(description=str(seasonal_festival.get("description", seasonal_festival["name"]))))
            tick_state.festival_updates.append(
                FestivalUpdate(
                    festival=Festival(
                        name=seasonal_festival["name"],
                        type=seasonal_festival["type"],
                        start_tick=int(seasonal_festival["start_tick"]),
                        duration=int(seasonal_festival["duration"]),
                        location=seasonal_festival["location"],
                        participants=list(seasonal_festival.get("participants", [])),
                    ),
                    status="started",
                )
            )
        self._maybe_start_disaster_for_tick(tick_state)
        tick_state.dialogues.extend(dialogue_updates)
        tick_state.relationships.extend(relationship_deltas)
        tick_state.gossips.extend(gossip_updates)
        self._record_dialogue_history(dialogue_updates, agents_by_id)
        self._ensure_stats_counters()
        self._ensure_performance_counters()
        self._total_dialogue_count += len(tick_state.dialogues)
        self._total_relationship_change_count += len(tick_state.relationships)

        eod_tick_in_day = 22 * max(1, self.world.config.tick_per_day // 24)
        if self.world.current_tick % self.world.config.tick_per_day == eod_tick_in_day:
            from engine.diary import build_state_diary_context, generate_diary_entry

            day_number = self.world.current_tick // self.world.config.tick_per_day + 1
            for agent in self.world.agents:
                generate_diary_entry(
                    agent,
                    self.world,
                    day_context=build_state_diary_context(self, agent.resident.id, day_number),
                )

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
        from engine.achievements import check_and_unlock as _check_achievements
        from engine.achievements import sync_tracking_for_tick as _sync_achievement_tracking
        from engine.types import AchievementUnlock

        _sync_achievement_tracking(self)
        for unlock in _check_achievements(self):
            tick_state.achievement_unlocks.append(AchievementUnlock(**unlock))
            tick_state.events.append(
                EventUpdate(
                    description=f"全镇公告：{unlock.get('resident_name', '')} 解锁了成就「{unlock.get('achievement_name', '')}」"
                )
            )
            self._add_timeline_event(
                "achievement",
                f"成就解锁：{unlock.get('resident_name', '')} — {unlock.get('achievement_name', '')}",
                {
                    "resident_id": unlock.get("resident_id", ""),
                    "resident_name": unlock.get("resident_name", ""),
                    "achievement_id": unlock.get("achievement_id", ""),
                    "achievement_name": unlock.get("achievement_name", ""),
                    "category": unlock.get("category", ""),
                    "unlocked_at_tick": unlock.get("unlocked_at_tick", 0),
                },
            )
            achievement_festival = self._start_festival(
                "achievement",
                start_tick=self.world.current_tick,
                anchor_resident_id=unlock.get("resident_id", ""),
                custom_name=f"{unlock.get('resident_name', '居民')}的成就庆典",
            )
            if achievement_festival is not None:
                tick_state.events.append(EventUpdate(description=f"{achievement_festival['name']} 已开始。"))
                tick_state.festival_updates.append(
                    FestivalUpdate(
                        festival=Festival(
                            name=achievement_festival["name"],
                            type=achievement_festival["type"],
                            start_tick=int(achievement_festival["start_tick"]),
                            duration=int(achievement_festival["duration"]),
                            location=achievement_festival["location"],
                            participants=list(achievement_festival.get("participants", [])),
                        ),
                        status="started",
                    )
                )
        # --- Life goal tracking ---
        from engine.goals import track_goals, apply_goal_completions
        goal_completions = track_goals(self)
        if goal_completions:
            apply_goal_completions(self, goal_completions)
            for gc in goal_completions:
                tick_state.events.append(
                    EventUpdate(description=f"🎯 {gc['resident_name']}达成了人生目标！")
                )

        # --- Wishlist processing ---
        from engine.wishes import process_wishes
        process_wishes(self)

        # --- Jealousy & rivalry processing ---
        from engine.jealousy import process_jealousy
        process_jealousy(self)

        family_event_descriptions: list[str] = []
        current_tick = self.world.current_tick
        families = self.world.list_families()
        if current_tick % 50 == 0:
            for family in families:
                if family["member_count"] < 3:
                    continue
                description = f"{family['family_name']} 举办了家庭聚餐，家人们短暂放下分歧围坐交流。"
                family_event_descriptions.append(description)
                self._add_timeline_event("family_dinner", description, {"family_name": family["family_name"]})
                for member in family["members"]:
                    agent = self.world.get_agent(member["id"])
                    if agent is not None:
                        self.world.shift_resident_mood(agent, 1, "family_event")

        for unlock in tick_state.achievement_unlocks:
            agent = self.world.get_agent(unlock.resident_id)
            if agent is None or not agent.resident.family.family_name:
                continue
            family_name = agent.resident.family.family_name
            description = f"{family_name} 为 {agent.resident.name} 的成就举行了家族庆祝。"
            family_event_descriptions.append(description)
            self._add_timeline_event("family_celebration", description, {"family_name": family_name, "resident_id": unlock.resident_id})
            for member in self.world.get_family_members(agent.resident):
                related_agent = self.world.get_agent(member.id)
                if related_agent is not None:
                    self.world.shift_resident_mood(related_agent, 1, "family_event")

        dispute_triggered = False
        for family in families:
            if dispute_triggered:
                break
            member_ids = [member["id"] for member in family["members"]]
            for from_id in member_ids:
                for to_id in member_ids:
                    if from_id == to_id:
                        continue
                    relationship = self.world.get_relationship(from_id, to_id)
                    if relationship is None:
                        continue
                    if relationship.type.value in {"rivalry", "dislike"} or relationship.intensity < 0.15:
                        description = f"{family['family_name']} 爆发家族纷争，{from_id} 与 {to_id} 的旧矛盾再次被提起。"
                        family_event_descriptions.append(description)
                        self._add_timeline_event("family_dispute", description, {"family_name": family["family_name"], "from_id": from_id, "to_id": to_id})
                        for resident_id in {from_id, to_id}:
                            agent = self.world.get_agent(resident_id)
                            if agent is not None:
                                self.world.shift_resident_mood(agent, -1, "family_event")
                        dispute_triggered = True
                        break
                if dispute_triggered:
                    break

        tick_state.events.extend(EventUpdate(description=description) for description in family_event_descriptions)
        self._close_finished_festivals(tick_state)
        self._close_finished_disasters(tick_state)
        self._update_diplomacy(tick_state)
        self._update_bulletin_board()

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

    culture_bonus = float(getattr(state.world, "culture_prosperity_index", lambda: 0.0)())
    happiness = round(min(1.0, 0.5 * norm_mood + 0.3 * norm_energy + 0.2 * norm_wealth + culture_bonus * 0.1), 3)

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
        Achievement,
        Appearance,
        Building,
        ClothingItem,
        Course,
        CourseHistoryEntry,
        CulturalEvent,
        DiaryEntry,
        Education,
        Event as EngineEvent,
        ExternalTown,
        Health,
        Illness,
        Item,
        Job,
        LifeGoal,
        Memory,
        MoodEntry,
        Party,
        Pet,
        Reflection,
        Religion,
        Relationship,
        RelationType,
        ReligiousEvent,
        JealousyEntry,
        Resident,
        TradeRoute,
        WeatherType,
        Wish,
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
    branch_world.fashion_trend = dict(saved.get("fashion_trend", getattr(branch_world, "fashion_trend", {})))
    branch_world.fashion_trend_history = list(saved.get("fashion_trend_history", getattr(branch_world, "fashion_trend_history", [])))
    branch_world.fashion_purchase_history = list(saved.get("fashion_purchase_history", []))
    branch_world.fashion_design_history = list(saved.get("fashion_design_history", []))

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
            appearance=Appearance(**res_data.get("appearance", {})) if res_data.get("appearance") else Appearance(),
            wardrobe=[ClothingItem(**item) for item in res_data.get("wardrobe", [])],
            current_goal=res_data.get("current_goal"),
            coins=res_data.get("coins", 100),
            occupation=res_data.get("occupation", "unemployed"),
            wallet=float(res_data.get("wallet", 0.0)),
            job=Job(**res_data.get("job", {})) if res_data.get("job") else Job(),
            skills=dict(res_data.get("skills", {})),
            inventory=[Item(**item) for item in res_data.get("inventory", [])],
            pets=[Pet(**pet) for pet in res_data.get("pets", [])],
            energy=float(res_data.get("energy", 1.0)),
            age_days=int(res_data.get("age_days", 0)),
            mood_history=[MoodEntry(**entry) for entry in res_data.get("mood_history", [])],
            mental_state=res_data.get("mental_state", "stable"),
            low_mood_ticks=int(res_data.get("low_mood_ticks", 0)),
            party=res_data.get("party", Party.neutral),
            religion=Religion(res_data.get("religion", "none")),
            piety=float(res_data.get("piety", 0.0)),
            morality_score=float(res_data.get("morality_score", 0.5)),
            health=Health(
                hp=float(res_data.get("health", {}).get("hp", 1.0)),
                illness=Illness(**res_data["health"]["illness"]) if res_data.get("health", {}).get("illness") else None,
                recovery_tick=int(res_data.get("health", {}).get("recovery_tick", 0)),
                work_streak=int(res_data.get("health", {}).get("work_streak", 0)),
            ),
            education=Education(
                courses=[Course(**course) for course in res_data.get("education", {}).get("courses", [])],
                knowledge_level=dict(res_data.get("education", {}).get("knowledge_level", {})),
                course_history=[
                    CourseHistoryEntry(**entry)
                    for entry in res_data.get("education", {}).get("course_history", [])
                ],
            ),
            artistic_talent=float(res_data.get("artistic_talent", 0.0)),
            life_goal=LifeGoal(**res_data["life_goal"]) if res_data.get("life_goal") else None,
            wishlist=[Wish(**w) for w in res_data.get("wishlist", [])],
            jealousy_targets=[JealousyEntry(**j) for j in res_data.get("jealousy_targets", [])],
        )
        resident.achievements = [Achievement(**entry) for entry in res_data.get("achievements", [])]
        for d in res_data.get("diary", []):
            resident.diary.append(DiaryEntry(**d))
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

    branch_world.stray_pets = [Pet(**pet) for pet in saved.get("stray_pets", [])]
    branch_world.cultural_events = [CulturalEvent(**event) for event in saved.get("cultural_events", [])]
    branch_world.culture_prosperity_history = list(saved.get("culture_prosperity_history", []))
    branch_world.religious_events = [ReligiousEvent(**event) for event in saved.get("religious_events", [])]
    branch_world.morality_history = list(saved.get("morality_history", []))
    branch_world.external_towns = [ExternalTown(**town) for town in saved.get("external_towns", [])]
    branch_world.trade_routes = [TradeRoute(**route) for route in saved.get("trade_routes", [])]
    branch_world._rebuild_pet_registry()

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
