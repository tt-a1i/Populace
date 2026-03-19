from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from backend.api.simulation import get_simulation_state
from backend.llm.client import chat_completion
from backend.llm.prompts import build_report_prompt


router = APIRouter(prefix="/api/report", tags=["report"])


def _extract_report_inputs(state: Any) -> tuple[list[dict[str, Any]], list[str], list[dict[str, Any]], dict[str, Any]]:
    residents = [
        {
            "id": agent.resident.id,
            "name": agent.resident.name,
            "mood": agent.resident.mood,
            "location": agent.resident.location,
            "goals": agent.resident.goals,
        }
        for agent in state.world.agents
    ]

    tick_state = state.loop.last_tick_state
    events = [event.description for event in getattr(tick_state, "events", [])]
    relationships = [
        {
            "from_id": relationship.from_id,
            "to_id": relationship.to_id,
            "type": relationship.type,
            "delta": relationship.delta,
        }
        for relationship in getattr(tick_state, "relationships", [])
    ]
    tick_info = {
        "tick": state.world.current_tick,
        "time": state.world.simulation_time(),
        "running": state.loop.running,
    }
    return residents, events, relationships, tick_info


def _fallback_report(
    residents: list[dict[str, Any]],
    events: list[str],
    relationships: list[dict[str, Any]],
    tick_info: dict[str, Any],
) -> dict[str, Any]:
    resident_names = "、".join(resident["name"] for resident in residents[:4]) or "居民们"
    latest_event = events[0] if events else "今天小镇风平浪静，大家都在悄悄观察彼此。"
    relationship_line = (
        "；".join(
            f"{item['from_id']} 对 {item['to_id']} 的 {item['type']} 波动 {item['delta']:+.0f}"
            for item in relationships[:3]
        )
        or "暂无明显关系波动，暧昧和摩擦都还在酝酿。"
    )
    return {
        "title": f"Populace 小镇日报 - Tick {tick_info['tick']}",
        "sections": [
            {"heading": "标题新闻", "content": f"{resident_names} 成为今天的焦点：{latest_event}"},
            {"heading": "八卦专栏", "content": f"围观者说，{resident_names} 的情绪变化比天气更快，新的故事正在发酵。"},
            {"heading": "关系变动", "content": relationship_line},
            {"heading": "天气预报", "content": f"当前模拟时间 {tick_info['time']}，夜色与传闻一起加深，适合继续观察下一回合。"},
        ],
    }


def _parse_report_response(content: str | None, fallback: dict[str, Any]) -> dict[str, Any]:
    if not content:
        return fallback

    pieces = [segment.strip() for segment in content.split("\n\n") if segment.strip()]
    title = pieces[0] if pieces else fallback["title"]
    headings = ["标题新闻", "八卦专栏", "关系变动", "天气预报"]
    sections = []

    for index, heading in enumerate(headings, start=1):
        text = pieces[index] if index < len(pieces) else fallback["sections"][index - 1]["content"]
        sections.append({"heading": heading, "content": text})

    return {"title": title, "sections": sections}


@router.post("/generate")
async def generate_report(request: Request) -> dict[str, Any]:
    state = get_simulation_state(request)
    residents, events, relationships, tick_info = _extract_report_inputs(state)
    fallback = _fallback_report(residents, events, relationships, tick_info)
    prompt = build_report_prompt(residents, events, relationships, tick_info)
    content = await chat_completion(prompt, max_tokens=400)
    report = _parse_report_response(content, fallback)
    payload = {
        **report,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tick": tick_info["tick"],
    }
    request.app.state.latest_report = payload
    return payload


@router.get("/latest")
async def get_latest_report(request: Request) -> dict[str, Any]:
    latest_report = getattr(request.app.state, "latest_report", None)
    if latest_report is None:
        raise HTTPException(status_code=404, detail="latest report not found")
    return latest_report
