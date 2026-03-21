"""Tests for memoir generation and world timeline endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Memoir prompt tests
# ---------------------------------------------------------------------------

def test_memoir_prompt_includes_resident_name():
    from backend.llm.prompts import build_memoir_prompt

    prompt = build_memoir_prompt(
        name="Alice",
        personality="热情活泼",
        goals=["交到更多朋友"],
        diary_entries=[{"date": "Day 1", "summary": "今天认识了Bob"}],
        recent_memories=[{"content": "和Bob喝咖啡", "emotion": "happy", "importance": 0.8}],
        relationships=[{"counterpart_name": "Bob", "type": "friendship", "intensity": 0.7, "reason": "一起喝咖啡"}],
    )

    assert isinstance(prompt, list)
    assert len(prompt) == 2
    user_content = prompt[1]["content"]
    assert "Alice" in user_content
    assert "热情活泼" in user_content
    assert "交到更多朋友" in user_content


def test_memoir_prompt_includes_diary_and_memory():
    from backend.llm.prompts import build_memoir_prompt

    prompt = build_memoir_prompt(
        name="Charlie",
        personality="冷静内敛",
        goals=[],
        diary_entries=[{"date": "Day 2", "summary": "在图书馆待了一天"}],
        recent_memories=[{"content": "借了三本书", "emotion": "neutral", "importance": 0.5}],
        relationships=[],
    )

    user_content = prompt[1]["content"]
    assert "图书馆" in user_content
    assert "借了三本书" in user_content


def test_memoir_prompt_fallback_empty_fields():
    from backend.llm.prompts import build_memoir_prompt

    prompt = build_memoir_prompt(
        name="EmptyResident",
        personality="",
        goals=[],
        diary_entries=[],
        recent_memories=[],
        relationships=[],
    )

    user_content = prompt[1]["content"]
    assert "EmptyResident" in user_content
    # Should handle empty gracefully
    assert "（暂无日记记录）" in user_content or "暂无" in user_content


def test_memoir_endpoint_resident_not_found(client):
    resp = client.post("/api/report/memoir/nonexistent-id")
    assert resp.status_code == 404


def test_memoir_endpoint_returns_markdown(client, monkeypatch: pytest.MonkeyPatch):
    from backend.api import report as report_api

    async def fake_completion(*_args, **_kwargs):
        return "# Alice的回忆录\n\n## 关于我自己\n\n我叫Alice。"

    monkeypatch.setattr(report_api, "chat_completion", fake_completion)

    state = _get_state(client)
    if not state.world.agents:
        pytest.skip("no agents in world")

    resident_id = state.world.agents[0].resident.id
    resp = client.post(f"/api/report/memoir/{resident_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "content" in data
    assert "resident_id" in data
    assert "resident_name" in data
    assert "generated_at" in data
    assert len(data["content"]) > 0


# ---------------------------------------------------------------------------
# Timeline tests
# ---------------------------------------------------------------------------

def _get_state(client):
    """Get the simulation state from the running app."""
    return client.app.state.simulation_state


def test_timeline_empty_initially(client):
    """Timeline endpoint should return a list (empty if no events yet)."""
    state = _get_state(client)
    state._world_timeline = []
    state._timeline_id_counter = 0

    resp = client.get("/api/simulation/timeline")
    assert resp.status_code == 200
    assert resp.json() == []


def test_timeline_records_custom_event(client):
    state = _get_state(client)
    state._world_timeline = []
    state._timeline_id_counter = 0

    state.enqueue_event({"description": "测试自定义事件", "source": "user"})

    resp = client.get("/api/simulation/timeline")
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) == 1
    assert events[0]["event_type"] == "custom_event"
    assert "测试自定义事件" in events[0]["description"]


def test_timeline_records_preset_event(client):
    state = _get_state(client)
    state._world_timeline = []
    state._timeline_id_counter = 0

    result = state.enqueue_preset_event("storm")
    assert result is not None, "preset 'storm' should exist"

    resp = client.get("/api/simulation/timeline")
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) >= 1
    assert any(e["event_type"] == "preset_event" for e in events)


def test_timeline_event_schema_fields(client):
    state = _get_state(client)
    state._world_timeline = []
    state._timeline_id_counter = 0

    state.enqueue_event({"description": "schema test event", "source": "test"})

    resp = client.get("/api/simulation/timeline")
    assert resp.status_code == 200
    event = resp.json()[0]
    required_fields = {"id", "event_type", "description", "tick", "time", "metadata"}
    assert required_fields.issubset(event.keys())


def test_timeline_max_200_returned(client):
    state = _get_state(client)
    state._world_timeline = []
    state._timeline_id_counter = 0

    for i in range(250):
        state._add_timeline_event("custom_event", f"event {i}")

    resp = client.get("/api/simulation/timeline")
    assert resp.status_code == 200
    assert len(resp.json()) <= 200


def test_timeline_sorted_newest_first(client):
    state = _get_state(client)
    state._world_timeline = []
    state._timeline_id_counter = 0

    # Manually insert events at different ticks
    state._world_timeline = [
        {"id": "tl-1", "event_type": "custom_event", "description": "old", "tick": 5, "time": "t5", "metadata": {}},
        {"id": "tl-2", "event_type": "custom_event", "description": "new", "tick": 10, "time": "t10", "metadata": {}},
    ]

    resp = client.get("/api/simulation/timeline")
    events = resp.json()
    assert events[0]["tick"] >= events[-1]["tick"]


def test_add_timeline_event_guards_missing_attrs():
    """_add_timeline_event should not crash when called on a state missing the attrs."""
    from backend.api.simulation import SimulationState
    state = SimulationState.__new__(SimulationState)
    # Simulate missing world by providing a stub
    from types import SimpleNamespace
    state.world = SimpleNamespace(current_tick=1, simulation_time=lambda: "T1")
    # Should not raise
    state._add_timeline_event("custom_event", "test without init")
    assert len(state._world_timeline) == 1
