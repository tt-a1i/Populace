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


class SimulationState:
    def __init__(self) -> None:
        from backend.world.town import load_scenario
        self.world = load_scenario()
        self.loop = SimulationLoop(self.world, tick_handler=self._tick)
        self._task: Optional[asyncio.Task[None]] = None
        self._events: list[dict[str, Any]] = []
        # Dialogue tasks fired in previous ticks; results are harvested each tick
        self._pending_dialogues: list[asyncio.Task] = []
        # frozenset pairs of resident ids that have an in-flight dialogue task
        self._active_dialogue_pairs: set[frozenset] = set()

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
            "buildings": [asdict(building) for building in self.world.buildings],
            "pending_events": list(self._events),
            "last_tick": _serialize(tick_state) if tick_state is not None else None,
        }

    def enqueue_event(self, event: dict[str, Any]) -> dict[str, Any]:
        self._events.append(event)
        return event

    async def _tick(self) -> Any:
        import inspect
        import random
        import uuid

        from engine.types import Event as EngineEvent

        queued_events = list(self._events)

        # Inject user-queued events into world.pending_events so agent.perceive() picks them up
        for ev in queued_events:
            self.world.pending_events.append(EngineEvent(
                id=str(uuid.uuid4()),
                description=ev.get("description", ""),
                timestamp=self.world.simulation_time(),
                source="user",
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

            # Step d — agent.plan(context)
            # Always call agent.plan(); pass use_llm so the Agent subclass
            # decides internally whether to invoke LLM or fall back to rules.
            context = {
                "events": events,
                "memories": memories,
                "reflections": agent.reflections,
                "use_llm": use_llm,
            }
            result = agent.plan(context)
            if inspect.isawaitable(result):
                p = await result
            else:
                p = result

            return agent, p

        # Run all agents concurrently (asyncio.gather handles both sync & async plans)
        results = await asyncio.gather(*[_process_agent(a) for a in self.world.agents])

        # Step e — agent.act(plan, world)  [after all plans collected]
        for agent, p in results:
            agent.act(p, self.world)

        # Social phase — spec §8: dialogue LLM must NOT block the tick.
        # Pattern: fire tasks this tick, harvest completed results next tick.
        from engine.social import DialogueResult, initiate_dialogue, should_interact
        from engine.types import DialogueUpdate, RelationshipDelta

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
                        d = float(result.relationship_delta)
                        # Both directions (spec §11: "双方更新关系值")
                        relationship_deltas.append(
                            RelationshipDelta(from_id=a_id, to_id=b_id,
                                              type="friendship", delta=d)
                        )
                        relationship_deltas.append(
                            RelationshipDelta(from_id=b_id, to_id=a_id,
                                              type="friendship", delta=d)
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
            nearby = self.world.get_nearby_agents(a.resident.x, a.resident.y)
            for b in nearby:
                pair = frozenset([a.resident.id, b.resident.id])
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                if dialogue_count >= cfg.max_dialogues_per_tick:
                    break
                if not should_interact(a, b, self.world):
                    continue
                task = asyncio.create_task(initiate_dialogue(a, b, self.world))
                task._pair_ids = (a.resident.id, b.resident.id)  # type: ignore[attr-defined]
                self._active_dialogue_pairs.add(pair)
                self._pending_dialogues.append(task)
                dialogue_count += 1

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

        return tick_state


def _serialize(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    return value


def get_simulation_state(request: Request) -> SimulationState:
    state = getattr(request.app.state, "simulation_state", None)
    if state is None:
        raise HTTPException(status_code=503, detail="simulation state not initialized")
    return state


@router.post("/start")
async def start_simulation(request: Request) -> dict[str, Any]:
    state = get_simulation_state(request)
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
