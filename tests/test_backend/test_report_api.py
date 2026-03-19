from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_experiment_report_prompt_includes_required_analysis_inputs():
    from backend.llm.prompts import build_experiment_report_prompt

    prompt = build_experiment_report_prompt(
        graph_stats={
            "node_count": 6,
            "edge_count": 8,
            "density_start": 0.32,
            "density_end": 0.44,
            "triangle_count": 3,
            "relation_type_distribution": {"friendship": 4, "rivalry": 2},
        },
        event_timeline=[
            {"tick": 72, "time": "Day 2, 12:00", "events": ["市集争执"], "impact_score": 0.42},
        ],
        emotion_distribution={"happy": 10, "sad": 4, "angry": 2, "neutral": 8},
        social_hotspots=[
            {"name": "晨曦咖啡馆", "visits": 9, "interaction_score": 5.5},
        ],
    )

    assert prompt[0]["content"].startswith("你是一名研究 AI 社会实验")
    assert "社交网络分析" in prompt[1]["content"]
    assert "关键发现" in prompt[1]["content"]
    assert "AI 行为观察" in prompt[1]["content"]
    assert "伦理思考" in prompt[1]["content"]
    assert "晨曦咖啡馆" in prompt[1]["content"]


def test_generate_experiment_report_returns_structured_payload(client, monkeypatch: pytest.MonkeyPatch):
    from backend.api import report as report_api
    from engine.types import RelationType, Relationship

    async def fake_completion(*_args, **_kwargs):
        return "\n".join(
            [
                "# 群体行为实验报告：双日观察",
                "## 实验摘要",
                "在最近两个模拟日里，网络密度持续上升。",
                "## 社交网络分析",
                "- 友谊边增长快于敌意边。",
                "## 关键发现",
                "咖啡馆是关系升温的核心场所。",
                "## AI 行为观察",
                "代理会围绕热点事件形成短期聚集。",
                "## 伦理思考",
                "高频情绪操纵可能放大群体偏见。",
            ]
        )

    monkeypatch.setattr(report_api, "chat_completion", fake_completion)

    state = client.app.state.simulation_state
    state.world.current_tick = 96
    state.world.relationships = {
        ("a1", "a2"): Relationship(
            from_id="a1",
            to_id="a2",
            type=RelationType.friendship,
            intensity=0.7,
            since="Day 1, 08:00",
            familiarity=0.9,
            reason="共同组织活动",
        ),
        ("a2", "a3"): Relationship(
            from_id="a2",
            to_id="a3",
            type=RelationType.rivalry,
            intensity=0.4,
            since="Day 1, 12:00",
            familiarity=0.6,
            reason="对资源分配有分歧",
        ),
    }
    state._experiment_history = [
        {
            "tick": 60,
            "time": "Day 2, 06:00",
            "events": ["晨曦咖啡馆举办早餐会"],
            "dialogues": [{"from_id": "a1", "to_id": "a2", "text": "一起去吧"}],
            "relationship_deltas": [{"from_id": "a1", "to_id": "a2", "type": "friendship", "delta": 0.1}],
            "relationships": [
                {"from_id": "a1", "to_id": "a2", "type": "friendship", "intensity": 0.5},
            ],
            "moods": [
                {"id": "a1", "name": "甲", "mood": "happy"},
                {"id": "a2", "name": "乙", "mood": "neutral"},
            ],
            "occupancy": {"晨曦咖啡馆": 3, "街区 1-1": 1},
        },
        {
            "tick": 96,
            "time": "Day 3, 00:00",
            "events": ["广场上爆发争执"],
            "dialogues": [{"from_id": "a2", "to_id": "a3", "text": "你不该那样做"}],
            "relationship_deltas": [{"from_id": "a2", "to_id": "a3", "type": "rivalry", "delta": 0.2}],
            "relationships": [
                {"from_id": "a1", "to_id": "a2", "type": "friendship", "intensity": 0.7},
                {"from_id": "a2", "to_id": "a3", "type": "rivalry", "intensity": 0.4},
            ],
            "moods": [
                {"id": "a1", "name": "甲", "mood": "happy"},
                {"id": "a2", "name": "乙", "mood": "angry"},
                {"id": "a3", "name": "丙", "mood": "sad"},
            ],
            "occupancy": {"晨曦咖啡馆": 4, "中央广场": 5},
        },
    ]
    state.loop.last_tick_state = SimpleNamespace(events=[], relationships=[])

    response = client.post("/api/report/experiment", json={"days": 2})

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "群体行为实验报告：双日观察"
    assert payload["generated_at"]
    assert payload["stats"]["node_count"] >= 3
    assert payload["stats"]["edge_count"] >= 2
    assert "density_change" in payload["stats"]
    assert "triangle_count" in payload["stats"]
    assert payload["sections"][0]["heading"] == "实验摘要"
    assert any(section["heading"] == "伦理思考" for section in payload["sections"])
