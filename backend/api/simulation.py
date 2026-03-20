from __future__ import annotations

import asyncio
from dataclasses import asdict, is_dataclass
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.core.simulation import SimulationLoop
from backend.llm.client import validate_llm_config
from engine.types import EventUpdate


router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class SpeedRequest(BaseModel):
    speed: int


class StartRequest(BaseModel):
    scene: str = "modern_community"   # template slug, e.g. "seaside_village"


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
        # frozenset pairs of resident ids that have an in-flight dialogue task
        self._active_dialogue_pairs: set[frozenset] = set()
        # Active persistent events: list of dicts with remaining_ticks, radius, description
        self._active_events: list[dict[str, Any]] = []

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
                        )
                        agent.memory_stream.add(mem)
                    except Exception:
                        pass

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
        await self.loop.stop()
        if self._task is not None:
            await self._task
            self._task = None

    def set_speed(self, speed: int) -> None:
        if speed not in {1, 2, 5}:
            raise ValueError("speed must be one of 1, 2, or 5")
        self.loop.clock.set_speed(float(speed))

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

        await self.stop()
        for task in self._pending_dialogues:
            task.cancel()
        self._pending_dialogues.clear()
        self._active_dialogue_pairs.clear()
        self._events.clear()

        self.world = load_scenario(template_path)
        self.loop = SimulationLoop(self.world, tick_handler=self._tick)
        self._task = None

    async def reset_with_scenario(self, scenario_data: dict[str, Any]) -> None:
        """Stop simulation and replace the world with a custom scenario."""
        from backend.world.town import load_scenario_from_dict

        await self.stop()
        for task in self._pending_dialogues:
            task.cancel()
        self._pending_dialogues.clear()
        self._active_dialogue_pairs.clear()
        self._events.clear()

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
            "clock_speed": self.loop.clock.speed,
            "running": self.loop.running,
        }

    async def load_state(self, data: dict[str, Any]) -> None:
        """Stop simulation and restore world from a previously saved dict."""
        from backend.core.simulation import SimulationLoop
        from engine.generative_agent import GenerativeAgent
        from engine.memory import MemoryStream
        from engine.types import (
            Building, Memory, Reflection, Relationship, RelationType, Resident, WorldConfig,
        )
        from engine.world import World

        await self.stop()
        for task in self._pending_dialogues:
            task.cancel()
        self._pending_dialogues.clear()
        self._active_dialogue_pairs.clear()
        self._events.clear()

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
            )
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

        # Restore weather
        from engine.types import WeatherType
        weather_val = data.get("weather", "sunny")
        try:
            world.weather = WeatherType(weather_val)
        except ValueError:
            world.weather = WeatherType.sunny

        # Restore loop with saved speed/running state
        saved_speed = float(data.get("clock_speed", 1.0))
        from backend.core.clock import SimulationClock
        clock = SimulationClock(speed=saved_speed if saved_speed in {0.0, 1.0, 2.0, 5.0} else 1.0)
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

    def snapshot(self) -> dict[str, Any]:
        tick_state = self.loop.last_tick_state

        return {
            "tick": self.world.current_tick,
            "running": self.loop.running,
            "speed": int(self.loop.clock.speed) if self.loop.clock.speed else 0,
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
        }

    def enqueue_event(self, event: dict[str, Any]) -> dict[str, Any]:
        self._events.append(event)
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
        return preset

    def get_active_events(self) -> list[dict[str, Any]]:
        """Return current active (multi-tick) events with remaining duration."""
        return list(self._active_events)

    async def _tick(self) -> Any:
        import inspect
        import random
        import uuid

        from engine.types import Event as EngineEvent, WeatherType

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
                source="system",
            )
            agent.memorize(heartbeat)
            for event in events:
                agent.memorize(event)

            # Neo4j: real-time memory persistence (spec §12: "每 tick 实时写入")
            from backend.db.neo4j import save_memory as _neo4j_save_memory
            for mem in agent.memory_stream.all[-len(events) - 1:]:  # heartbeat + events
                asyncio.create_task(_neo4j_save_memory(agent.resident.id, mem))

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
                    asyncio.create_task(_neo4j_save_reflection(agent.resident.id, result))

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
        from engine.types import DialogueUpdate

        agents_by_id = {agent.resident.id: agent for agent in self.world.agents}

        # --- Harvest completed dialogue tasks from previous tick(s) ---
        dialogue_updates: list = []
        relationship_deltas: list = []
        still_pending: list = []

        for task in self._pending_dialogues:
            if task.done():
                try:
                    result: DialogueResult = task.result()
                    a_id, b_id = task._pair_ids  # type: ignore[attr-defined]
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
                except Exception:
                    pass  # cancelled or failed — discard silently
                finally:
                    # Remove from active set regardless of success/failure
                    a_id, b_id = task._pair_ids  # type: ignore[attr-defined]
                    self._active_dialogue_pairs.discard(frozenset([a_id, b_id]))
            else:
                still_pending.append(task)

        self._pending_dialogues = still_pending

        # --- Fire new dialogue tasks for nearby pairs this tick ---
        # Skip pairs that already have an in-flight task
        seen_pairs: set = set(self._active_dialogue_pairs)
        dialogue_count = 0

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
                task._pair_ids = (a.resident.id, b.resident.id)  # type: ignore[attr-defined]
                self._active_dialogue_pairs.add(pair)
                self._pending_dialogues.append(task)
                dialogue_count += 1

        # Tick-end relationship decay is applied after dialogue updates have landed.
        relationship_deltas.extend(decay_relationships(self.world, cfg))

        # Advance tick counter and collect movements
        tick_state = self.world.tick()
        tick_state.dialogues.extend(dialogue_updates)
        tick_state.relationships.extend(relationship_deltas)

        if queued_events:
            tick_state.events.extend(
                EventUpdate(description=event["description"])
                for event in queued_events
            )
            self._events.clear()
            self.world.pending_events.clear()

        # --- Neo4j persistence (spec §12) ---
        # Real-time: persist relationship changes that occurred this tick
        if relationship_deltas:
            asyncio.create_task(self._persist_relationships())

        # Snapshot every SNAPSHOT_INTERVAL_TICKS (configurable, default 10)
        interval = cfg.snapshot_interval_ticks
        if interval > 0 and self.world.current_tick % interval == 0:
            asyncio.create_task(self._persist_snapshot())

        # --- Redis cache (spec §4.1 + §12) ---
        asyncio.create_task(self._redis_tick(tick_state))
        self._record_experiment_frame(tick_state)

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
        raise HTTPException(status_code=503, detail="simulation state not initialized")
    return state


class CustomScenarioRequest(BaseModel):
    name: str = ""
    description: str = ""
    buildings: list = []
    residents: list = []
    map: Optional[dict] = None


@router.post("/start-custom")
async def start_custom_simulation(
    payload: CustomScenarioRequest, request: Request
) -> dict[str, Any]:
    """Replace the current world with *payload* scenario and start the simulation."""
    state = get_simulation_state(request)
    scenario_data = payload.model_dump()
    await state.reset_with_scenario(scenario_data)
    await state.start()
    return state.get_status()


@router.post("/start")
async def start_simulation(
    request: Request,
    payload: StartRequest = StartRequest(),
) -> dict[str, Any]:
    """Start the simulation, optionally loading a specific preset scene.

    Args:
        payload.scene: Template slug — ``"modern_community"`` (default) or
                       ``"seaside_village"``.  Unknown slugs fall back to the
                       default template.
    """
    state = get_simulation_state(request)
    await state.reset_with_scene(payload.scene)
    await state.start()
    return state.get_status()


@router.post("/stop")
async def stop_simulation(request: Request) -> dict[str, Any]:
    state = get_simulation_state(request)
    await state.stop()
    return state.get_status()


@router.post("/speed")
async def set_simulation_speed(payload: SpeedRequest, request: Request) -> dict[str, Any]:
    state = get_simulation_state(request)

    try:
        state.set_speed(payload.speed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return state.get_status()


@router.get("/status")
async def get_simulation_status(request: Request) -> dict[str, Any]:
    state = get_simulation_state(request)
    return state.get_status()
