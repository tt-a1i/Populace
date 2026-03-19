"""Neo4j database layer for Populace.

All public functions are async.  Every function that touches Neo4j is
wrapped in a try/except so that the simulation keeps running even when
Neo4j is unavailable (local dev without Docker).

Graph model (spec §4.5):
  (Resident) -[:REMEMBERS]-> (Memory)
  (Resident) -[:REFLECTED]-> (Reflection)
  (Resident) -[:FEELS {type, intensity, ...}]-> (Resident)
"""
from __future__ import annotations

import logging
from typing import Any

from neo4j import AsyncDriver, AsyncGraphDatabase

from backend.core.config import settings

logger = logging.getLogger(__name__)

_driver: AsyncDriver | None = None

_CONSTRAINT_QUERIES = (
    "CREATE CONSTRAINT resident_id_unique IF NOT EXISTS FOR (n:Resident) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT building_id_unique IF NOT EXISTS FOR (n:Building) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT memory_id_unique IF NOT EXISTS FOR (n:Memory) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT event_id_unique IF NOT EXISTS FOR (n:Event) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT reflection_id_unique IF NOT EXISTS FOR (n:Reflection) REQUIRE n.id IS UNIQUE",
)


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

async def get_driver() -> AsyncDriver:
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(settings.neo4j_uri)
    return _driver


async def close_driver() -> None:
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None


async def run_query(cypher: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    driver = await get_driver()
    async with driver.session() as session:
        result = await session.run(cypher, params or {})
        return [record.data() async for record in result]


async def initialize_constraints() -> None:
    driver = await get_driver()
    async with driver.session() as session:
        for query in _CONSTRAINT_QUERIES:
            await session.run(query)


def _neo4j_available() -> bool:
    """Return True when a driver is connected (best-effort check)."""
    return _driver is not None


# ---------------------------------------------------------------------------
# Resident CRUD (spec §4.5 Resident node)
# ---------------------------------------------------------------------------

async def save_resident(resident: Any) -> None:
    """Upsert a Resident node.

    Args:
        resident: A :class:`engine.types.Resident` dataclass instance.
    """
    try:
        await run_query(
            """
            MERGE (r:Resident {id: $id})
            SET r.name        = $name,
                r.personality = $personality,
                r.goals       = $goals,
                r.mood        = $mood,
                r.location    = $location,
                r.x           = $x,
                r.y           = $y
            """,
            {
                "id":          resident.id,
                "name":        resident.name,
                "personality": resident.personality,
                "goals":       list(resident.goals),
                "mood":        resident.mood,
                "location":    resident.location,
                "x":           resident.x,
                "y":           resident.y,
            },
        )
    except Exception as exc:
        logger.debug("Neo4j save_resident skipped: %s", exc)


async def load_residents() -> list[dict[str, Any]]:
    """Return all Resident nodes as plain dicts.

    Returns an empty list when Neo4j is unavailable.
    """
    try:
        rows = await run_query("MATCH (r:Resident) RETURN r")
        return [row["r"] for row in rows]
    except Exception as exc:
        logger.debug("Neo4j load_residents skipped: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Memory CRUD (spec §4.5 Memory node + REMEMBERS edge)
# ---------------------------------------------------------------------------

async def save_memory(agent_id: str, memory: Any) -> None:
    """Upsert a Memory node and link it to its Resident.

    Args:
        agent_id: The resident id (REMEMBERS edge source).
        memory:   A :class:`engine.types.Memory` dataclass instance.
    """
    try:
        await run_query(
            """
            MERGE (m:Memory {id: $id})
            SET m.content    = $content,
                m.timestamp  = $timestamp,
                m.importance = $importance,
                m.emotion    = $emotion
            WITH m
            MATCH (r:Resident {id: $agent_id})
            MERGE (r)-[:REMEMBERS]->(m)
            """,
            {
                "id":         memory.id,
                "content":    memory.content,
                "timestamp":  memory.timestamp,
                "importance": memory.importance,
                "emotion":    memory.emotion,
                "agent_id":   agent_id,
            },
        )
    except Exception as exc:
        logger.debug("Neo4j save_memory skipped: %s", exc)


async def load_memories(agent_id: str) -> list[dict[str, Any]]:
    """Return all Memory nodes linked to *agent_id*.

    Returns an empty list when Neo4j is unavailable.
    """
    try:
        rows = await run_query(
            """
            MATCH (r:Resident {id: $agent_id})-[:REMEMBERS]->(m:Memory)
            RETURN m ORDER BY m.timestamp ASC
            """,
            {"agent_id": agent_id},
        )
        return [row["m"] for row in rows]
    except Exception as exc:
        logger.debug("Neo4j load_memories skipped: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Relationship CRUD (spec §4.5 FEELS edge)
# ---------------------------------------------------------------------------

async def save_relationship(rel: Any) -> None:
    """Upsert a directed FEELS relationship edge.

    Args:
        rel: A :class:`engine.types.Relationship` dataclass instance.
    """
    try:
        await run_query(
            """
            MATCH (a:Resident {id: $from_id})
            MATCH (b:Resident {id: $to_id})
            MERGE (a)-[f:FEELS {from_id: $from_id, to_id: $to_id}]->(b)
            SET f.type        = $type,
                f.intensity   = $intensity,
                f.since       = $since,
                f.familiarity = $familiarity,
                f.reason      = $reason
            """,
            {
                "from_id":    rel.from_id,
                "to_id":      rel.to_id,
                "type":       rel.type.value if hasattr(rel.type, "value") else str(rel.type),
                "intensity":  rel.intensity,
                "since":      rel.since,
                "familiarity": rel.familiarity,
                "reason":     rel.reason,
            },
        )
    except Exception as exc:
        logger.debug("Neo4j save_relationship skipped: %s", exc)


async def load_relationships() -> list[dict[str, Any]]:
    """Return all FEELS edges as plain dicts.

    Returns an empty list when Neo4j is unavailable.
    """
    try:
        rows = await run_query(
            "MATCH (a:Resident)-[f:FEELS]->(b:Resident) RETURN f"
        )
        return [row["f"] for row in rows]
    except Exception as exc:
        logger.debug("Neo4j load_relationships skipped: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Reflection CRUD (spec §4.5 Reflection node + REFLECTED edge)
# ---------------------------------------------------------------------------

async def save_reflection(agent_id: str, reflection: Any) -> None:
    """Upsert a Reflection node and link it to its Resident.

    Args:
        agent_id:   The resident id (REFLECTED edge source).
        reflection: A :class:`engine.types.Reflection` dataclass instance.
    """
    try:
        await run_query(
            """
            MERGE (rf:Reflection {id: $id})
            SET rf.summary      = $summary,
                rf.timestamp    = $timestamp,
                rf.derived_from = $derived_from
            WITH rf
            MATCH (r:Resident {id: $agent_id})
            MERGE (r)-[:REFLECTED]->(rf)
            """,
            {
                "id":           reflection.id,
                "summary":      reflection.summary,
                "timestamp":    reflection.timestamp,
                "derived_from": list(reflection.derived_from),
                "agent_id":     agent_id,
            },
        )
    except Exception as exc:
        logger.debug("Neo4j save_reflection skipped: %s", exc)


async def load_reflections(agent_id: str) -> list[dict[str, Any]]:
    """Return all Reflection nodes linked to *agent_id*.

    Returns an empty list when Neo4j is unavailable.
    """
    try:
        rows = await run_query(
            """
            MATCH (r:Resident {id: $agent_id})-[:REFLECTED]->(rf:Reflection)
            RETURN rf ORDER BY rf.timestamp ASC
            """,
            {"agent_id": agent_id},
        )
        return [row["rf"] for row in rows]
    except Exception as exc:
        logger.debug("Neo4j load_reflections skipped: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Bulk helpers used by SimulationState
# ---------------------------------------------------------------------------

async def persist_world_snapshot(world: Any) -> None:
    """Persist every resident, relationship, and memory in *world*.

    Designed to be called every SNAPSHOT_INTERVAL_TICKS.  Any Neo4j failure
    is logged as a warning but does not raise.

    Args:
        world: A :class:`engine.world.World` instance.
    """
    try:
        for agent in world.agents:
            await save_resident(agent.resident)
            for mem in agent.memory_stream.all:
                await save_memory(agent.resident.id, mem)
            for reflection in agent.reflections:
                await save_reflection(agent.resident.id, reflection)
        for rel in world.relationships.values():
            await save_relationship(rel)
    except Exception as exc:
        logger.warning("Neo4j snapshot failed (non-fatal): %s", exc)


async def restore_world_memories(world: Any) -> None:
    """Re-hydrate long-term memories and reflections from Neo4j into *world*.

    Called at startup when Neo4j already contains data from a previous session.
    Agent positions are reset to their home building entrance (spec §12).

    Args:
        world: A :class:`engine.world.World` instance whose agents are
               already populated (residents loaded from the scenario template).
    """
    from engine.types import Memory, Reflection, RelationType, Relationship

    try:
        # Index agents by resident id for fast lookup
        agent_map = {a.resident.id: a for a in world.agents}

        # -- Restore memories --
        for agent in world.agents:
            rows = await load_memories(agent.resident.id)
            for row in rows:
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

        # -- Restore reflections --
        for agent in world.agents:
            rows = await load_reflections(agent.resident.id)
            for row in rows:
                try:
                    rf = Reflection(
                        id=row["id"],
                        summary=row["summary"],
                        timestamp=row["timestamp"],
                        derived_from=list(row.get("derived_from", [])),
                    )
                    agent.reflections.append(rf)
                except Exception:
                    pass

        # -- Restore relationships --
        rel_rows = await load_relationships()
        for row in rel_rows:
            try:
                rel_type = RelationType(row["type"])
                rel = Relationship(
                    from_id=row["from_id"],
                    to_id=row["to_id"],
                    type=rel_type,
                    intensity=float(row["intensity"]),
                    since=row.get("since", ""),
                    familiarity=float(row.get("familiarity", 0.0)),
                    reason=row.get("reason", ""),
                )
                world.set_relationship(rel)
            except Exception:
                pass

        # -- Reset agent positions to home building entrance (spec §12) --
        for agent in world.agents:
            if agent.resident.location is not None:
                home = world.get_building(agent.resident.location)
                if home is not None:
                    agent.resident.x, agent.resident.y = home.position

        logger.info("Neo4j restore: hydrated memories/reflections/relationships for %d agents.",
                    len(world.agents))
    except Exception as exc:
        logger.warning("Neo4j restore failed (non-fatal): %s", exc)
