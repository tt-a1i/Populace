"""Tests for GenerativeAgent — lifecycle methods and initialization."""
import pytest

from engine.agent import Agent
from engine.generative_agent import GenerativeAgent
from engine.memory import MemoryStream
from engine.types import Event, Resident

from tests.conftest import MockAgent, make_agent, make_event, make_memory


def test_agent_is_abstract():
    """Agent ABC cannot be instantiated directly."""
    with pytest.raises(TypeError):
        Agent(Resident(id="x", name="test", personality="外向"))  # type: ignore[abstract]


def test_generative_agent_init():
    a = make_agent("r1", "小明")
    assert a.resident.id == "r1"
    assert isinstance(a.memory_stream, MemoryStream)
    assert a.reflections == []
    assert a.current_path == []


def test_generative_agent_perceive(mock_world):
    a = mock_world.agents[0]
    events = a.perceive(mock_world)
    assert isinstance(events, list)


def test_generative_agent_retrieve(mock_world):
    a = mock_world.agents[0]
    mem = make_memory("昨天下雨了")
    a.memory_stream.add(mem)
    results = a.retrieve("雨天")
    assert len(results) >= 1


def test_generative_agent_memorize(mock_world):
    a = mock_world.agents[0]
    event = make_event("遇见了小红")
    count_before = a.memory_stream.total_added
    a.memorize(event)
    assert a.memory_stream.total_added == count_before + 1


def test_generative_agent_act_idle(mock_world):
    a = mock_world.agents[0]
    x, y = a.resident.x, a.resident.y
    a.act({"action": "idle"}, mock_world)
    assert a.resident.x == x and a.resident.y == y


def test_generative_agent_act_move(mock_world):
    a = mock_world.agents[0]
    a.resident.location = None
    a.resident.x, a.resident.y = 5, 5
    a.act({"action": "move"}, mock_world)
    # Should have moved or stayed (depends on random)
    assert 0 <= a.resident.x < 20
    assert 0 <= a.resident.y < 20


@pytest.mark.asyncio
async def test_generative_agent_plan_rule_mode(mock_world):
    from engine.generative_agent import GenerativeAgent
    from tests.conftest import make_resident
    a = GenerativeAgent(make_resident("ga1", "测试"))
    mock_world.add_agent(a)
    result = await a.plan({"use_llm": False, "events": [], "memories": [], "reflections": []})
    assert result.get("action") == "move"
