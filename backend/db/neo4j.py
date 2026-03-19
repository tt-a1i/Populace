from __future__ import annotations

from typing import Any

from neo4j import AsyncDriver, AsyncGraphDatabase

from backend.core.config import settings


_driver: AsyncDriver | None = None

_CONSTRAINT_QUERIES = (
    "CREATE CONSTRAINT resident_id_unique IF NOT EXISTS FOR (n:Resident) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT building_id_unique IF NOT EXISTS FOR (n:Building) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT memory_id_unique IF NOT EXISTS FOR (n:Memory) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT event_id_unique IF NOT EXISTS FOR (n:Event) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT reflection_id_unique IF NOT EXISTS FOR (n:Reflection) REQUIRE n.id IS UNIQUE",
)


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
