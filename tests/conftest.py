"""Shared pytest fixtures for Populace tests."""
from __future__ import annotations

import asyncio
import uuid
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from engine.agent import Agent
from engine.generative_agent import GenerativeAgent
from engine.types import Building, Event, Memory, Resident, WorldConfig
from engine.world import World


# ---------------------------------------------------------------------------
# MockAgent — deterministic GenerativeAgent with a fixed plan
# ---------------------------------------------------------------------------

class MockAgent(GenerativeAgent):
    """GenerativeAgent subclass that returns a fixed plan without LLM calls."""

    def __init__(self, resident: Resident, plan_action: str = "idle") -> None:
        super().__init__(resident)
        self._plan_action = plan_action

    async def plan(self, context: dict) -> dict:
        return {"action": self._plan_action}

    async def reflect(self, memories: list) -> None:
        return None


# ---------------------------------------------------------------------------
# Resident / Agent helpers
# ---------------------------------------------------------------------------

def make_resident(
    rid: str = "r1",
    name: str = "测试",
    personality: str = "外向",
    x: int = 5,
    y: int = 5,
) -> Resident:
    return Resident(id=rid, name=name, personality=personality, x=x, y=y)


def make_agent(
    rid: str = "r1",
    name: str = "测试",
    x: int = 5,
    y: int = 5,
    plan_action: str = "idle",
) -> MockAgent:
    return MockAgent(make_resident(rid, name, x=x, y=y), plan_action=plan_action)


# ---------------------------------------------------------------------------
# mock_world fixture — 3 agents + 2 buildings
# ---------------------------------------------------------------------------

@pytest.fixture()
def small_config() -> WorldConfig:
    return WorldConfig(
        map_width_tiles=20,
        map_height_tiles=20,
        interaction_distance=2,
        reflection_threshold=5,
        short_term_memory_size=10,
        llm_call_probability=0.0,
        relationship_decay_rate=0.01,
        max_dialogues_per_tick=1,
    )


@pytest.fixture()
def mock_world(small_config: WorldConfig) -> World:
    world = World(config=small_config)

    # Buildings
    cafe = Building(id="cafe1", type="cafe", name="晨曦咖啡馆", capacity=4, position=(3, 3))
    home = Building(id="home1", type="home", name="阳光公寓", capacity=4, position=(10, 10))
    world.add_building(cafe)
    world.add_building(home)

    # Agents
    world.add_agent(make_agent("a1", "小明", x=5, y=5))
    world.add_agent(make_agent("a2", "小红", x=6, y=5))
    world.add_agent(make_agent("a3", "大强", x=15, y=15))

    return world


# ---------------------------------------------------------------------------
# mock_llm fixture — patches chat_completion to return fixed text
# ---------------------------------------------------------------------------

@pytest.fixture()
def mock_llm():
    """Monkeypatch chat_completion to return a deterministic string."""
    async def _fake_chat(messages: list[dict], max_tokens: int = 200) -> str:
        return "我想在小镇散个步。"

    with patch("backend.llm.client.chat_completion", side_effect=_fake_chat) as m:
        yield m


@pytest.fixture()
def mock_llm_eval():
    """chat_completion mock that returns '3' for eval prompts."""
    async def _fake(messages: list[dict], max_tokens: int = 200) -> str:
        return "3" if max_tokens <= 10 else "你好，很高兴见到你。"

    with patch("backend.llm.client.chat_completion", side_effect=_fake) as m:
        yield m


# ---------------------------------------------------------------------------
# Deterministic helpers
# ---------------------------------------------------------------------------

def make_memory(
    content: str = "遇见了邻居",
    importance: float = 0.5,
    emotion: str = "neutral",
) -> Memory:
    return Memory(
        id=str(uuid.uuid4()),
        content=content,
        timestamp="Day 1, 08:00",
        importance=importance,
        emotion=emotion,
    )


def make_event(description: str = "路过公园", source: str = "system") -> Event:
    return Event(
        id=str(uuid.uuid4()),
        description=description,
        timestamp="Day 1, 08:00",
        source=source,
    )
