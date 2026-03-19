from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.api.simulation import get_simulation_state
from backend.llm.client import chat_completion
from backend.llm.prompts import build_experiment_report_prompt, build_report_prompt


router = APIRouter(prefix="/api/report", tags=["report"])

EXPERIMENT_SECTION_HEADINGS = [
    "实验摘要",
    "社交网络分析",
    "关键发现",
    "AI 行为观察",
    "伦理思考",
]


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


class ExperimentReportRequest(BaseModel):
    days: int = 3


def _serialize_relationship_snapshot(relationships: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "from_id": item["from_id"],
            "to_id": item["to_id"],
            "type": item["type"].value if hasattr(item["type"], "value") else str(item["type"]),
            "intensity": float(item.get("intensity", 0.0)),
            "reason": item.get("reason", ""),
        }
        for item in relationships
    ]


def _build_current_experiment_frame(state: Any) -> dict[str, Any]:
    building_names = {building.id: building.name for building in state.world.buildings}
    occupancy: dict[str, int] = {}
    moods: list[dict[str, Any]] = []

    for agent in state.world.agents:
        resident = agent.resident
        moods.append({"id": resident.id, "name": resident.name, "mood": resident.mood})
        if resident.location:
            location_label = building_names.get(resident.location, resident.location)
        else:
            location_label = f"街区 {resident.x // 5}-{resident.y // 5}"
        occupancy[location_label] = occupancy.get(location_label, 0) + 1

    tick_state = state.loop.last_tick_state
    return {
        "tick": state.world.current_tick,
        "time": state.world.simulation_time(),
        "events": [event.description for event in getattr(tick_state, "events", [])],
        "dialogues": [
            {"from_id": dialogue.from_id, "to_id": dialogue.to_id, "text": dialogue.text}
            for dialogue in getattr(tick_state, "dialogues", [])
        ],
        "relationship_deltas": [
            {
                "from_id": relationship.from_id,
                "to_id": relationship.to_id,
                "type": relationship.type,
                "delta": relationship.delta,
            }
            for relationship in getattr(tick_state, "relationships", [])
        ],
        "relationships": _serialize_relationship_snapshot(
            [
                {
                    "from_id": relationship.from_id,
                    "to_id": relationship.to_id,
                    "type": relationship.type,
                    "intensity": relationship.intensity,
                    "reason": relationship.reason,
                }
                for relationship in state.world.relationships.values()
            ]
        ),
        "moods": moods,
        "occupancy": occupancy,
    }


def _count_triangles(relationships: list[dict[str, Any]]) -> int:
    adjacency: dict[str, set[str]] = defaultdict(set)
    for relationship in relationships:
        a = relationship["from_id"]
        b = relationship["to_id"]
        if a == b:
            continue
        adjacency[a].add(b)
        adjacency[b].add(a)

    triangles = 0
    nodes = sorted(adjacency.keys())
    for idx, a in enumerate(nodes):
        for b in [node for node in adjacency[a] if node > a]:
            shared = [node for node in adjacency[a].intersection(adjacency[b]) if node > b]
            triangles += len(shared)
    return triangles


def _graph_metrics(relationships: list[dict[str, Any]], node_count: int) -> dict[str, Any]:
    edge_keys = {tuple(sorted((item["from_id"], item["to_id"]))) for item in relationships if item["from_id"] != item["to_id"]}
    edge_count = len(edge_keys)
    density = edge_count / (node_count * (node_count - 1) / 2) if node_count > 1 else 0.0
    relation_type_distribution = dict(Counter(item["type"] for item in relationships))
    return {
        "edge_count": edge_count,
        "density": round(density, 4),
        "triangle_count": _count_triangles(relationships),
        "relation_type_distribution": relation_type_distribution,
    }


def _build_experiment_analysis(state: Any, days: int) -> dict[str, Any]:
    max_days = max(1, min(days, 30))
    history = list(getattr(state, "_experiment_history", []))
    if not history:
        history = [_build_current_experiment_frame(state)]

    tick_window = max_days * state.world.config.tick_per_day
    current_tick = state.world.current_tick
    window_start_tick = max(0, current_tick - tick_window + 1)
    frames = [frame for frame in history if frame.get("tick", 0) >= window_start_tick]
    if not frames:
        frames = [history[-1]]

    frames = sorted(frames, key=lambda frame: frame.get("tick", 0))
    start_frame = frames[0]
    end_frame = frames[-1]

    node_count = max(len(end_frame.get("moods", [])), len(state.world.agents))
    start_metrics = _graph_metrics(start_frame.get("relationships", []), max(len(start_frame.get("moods", [])), node_count))
    end_metrics = _graph_metrics(end_frame.get("relationships", []), node_count)

    mood_counter = Counter()
    hotspot_counter: Counter[str] = Counter()
    event_timeline: list[dict[str, Any]] = []

    for frame in frames:
        mood_counter.update(entry.get("mood", "neutral") for entry in frame.get("moods", []))
        hotspot_counter.update(frame.get("occupancy", {}))

        delta_magnitude = round(sum(abs(float(item.get("delta", 0.0))) for item in frame.get("relationship_deltas", [])), 3)
        dialogue_count = len(frame.get("dialogues", []))
        impact_score = round(delta_magnitude + dialogue_count * 0.15 + len(frame.get("events", [])) * 0.1, 3)
        if frame.get("events") or frame.get("relationship_deltas"):
            event_timeline.append(
                {
                    "tick": frame.get("tick"),
                    "time": frame.get("time"),
                    "events": frame.get("events", []),
                    "delta_magnitude": delta_magnitude,
                    "dialogue_count": dialogue_count,
                    "impact_score": impact_score,
                }
            )

    event_timeline = sorted(event_timeline, key=lambda item: (-item["impact_score"], -item["tick"]))[:8]
    social_hotspots = [
        {
            "name": name,
            "visits": visits,
            "interaction_score": round(visits / max(1, len(frames)), 2),
        }
        for name, visits in hotspot_counter.most_common(5)
    ]

    dominant_mood = mood_counter.most_common(1)[0][0] if mood_counter else "neutral"
    behavior_patterns = [
        f"主导情绪为 {dominant_mood}，显示群体整体气候在最近 {max_days} 天内相对集中。",
        f"最高频社交热点是 {social_hotspots[0]['name']}。" if social_hotspots else "暂无明显社交热点。",
        f"最强冲击事件发生在 Tick {event_timeline[0]['tick']}。" if event_timeline else "最近窗口内没有明显冲击事件。",
    ]

    stats = {
        "days": max_days,
        "start_tick": start_frame.get("tick", 0),
        "end_tick": end_frame.get("tick", state.world.current_tick),
        "node_count": node_count,
        "edge_count": end_metrics["edge_count"],
        "density_start": start_metrics["density"],
        "density_end": end_metrics["density"],
        "density_change": round(end_metrics["density"] - start_metrics["density"], 4),
        "triangle_count": end_metrics["triangle_count"],
        "dominant_mood": dominant_mood,
        "relation_type_distribution": end_metrics["relation_type_distribution"],
        "social_hotspots": social_hotspots,
        "recorded_ticks": len(frames),
    }

    return {
        "stats": stats,
        "graph_stats": {
            "node_count": stats["node_count"],
            "edge_count": stats["edge_count"],
            "density_start": stats["density_start"],
            "density_end": stats["density_end"],
            "triangle_count": stats["triangle_count"],
            "relation_type_distribution": stats["relation_type_distribution"],
        },
        "event_timeline": event_timeline,
        "emotion_distribution": dict(mood_counter),
        "social_hotspots": social_hotspots,
        "behavior_patterns": behavior_patterns,
    }


def _fallback_experiment_report(analysis: dict[str, Any]) -> dict[str, Any]:
    stats = analysis["stats"]
    hotspots = analysis["social_hotspots"]
    event_timeline = analysis["event_timeline"]
    patterns = analysis["behavior_patterns"]
    top_event = event_timeline[0] if event_timeline else None

    return {
        "title": f"群体行为实验报告：最近 {stats['days']} 天观察",
        "sections": [
            {
                "heading": "实验摘要",
                "content": (
                    f"在最近 {stats['days']} 个模拟日里，社交网络密度从 {stats['density_start']:.2f} 上升到 "
                    f"{stats['density_end']:.2f}，共记录 {stats['recorded_ticks']} 个有效 tick。"
                ),
            },
            {
                "heading": "社交网络分析",
                "content": (
                    f"- 当前节点数：{stats['node_count']}\n"
                    f"- 当前边数：{stats['edge_count']}\n"
                    f"- 三角关系数：{stats['triangle_count']}\n"
                    f"- 关系类型分布：{stats['relation_type_distribution']}"
                ),
            },
            {
                "heading": "关键发现",
                "content": top_event["events"][0] if top_event and top_event["events"] else "最近窗口内暂无高冲击事件。",
            },
            {
                "heading": "AI 行为观察",
                "content": "\n".join(f"- {pattern}" for pattern in patterns),
            },
            {
                "heading": "伦理思考",
                "content": (
                    f"热点地点 {hotspots[0]['name']} 持续吸引居民聚集，意味着环境设计会显著影响代理互动机会。"
                    if hotspots
                    else "当数据窗口较短时，任何关于群体行为的结论都应被视作暂时观察，而非稳定规律。"
                ),
            },
        ],
    }


def _parse_experiment_report_response(content: str | None, fallback: dict[str, Any]) -> dict[str, Any]:
    if not content:
        return fallback

    title = fallback["title"]
    sections_by_heading: dict[str, str] = {}
    current_heading: str | None = None
    buffer: list[str] = []

    for raw_line in content.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if not stripped:
            if current_heading is not None:
                buffer.append("")
            continue

        if stripped.startswith("# "):
            title = stripped[2:].strip() or fallback["title"]
            continue

        if stripped.startswith("## "):
            if current_heading is not None:
                sections_by_heading[current_heading] = "\n".join(buffer).strip()
            current_heading = stripped[3:].strip()
            buffer = []
            continue

        if current_heading is not None:
            buffer.append(line)

    if current_heading is not None:
        sections_by_heading[current_heading] = "\n".join(buffer).strip()

    fallback_lookup = {section["heading"]: section["content"] for section in fallback["sections"]}
    sections = [
        {
            "heading": heading,
            "content": sections_by_heading.get(heading, fallback_lookup[heading]),
        }
        for heading in EXPERIMENT_SECTION_HEADINGS
    ]
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


@router.post("/experiment")
async def generate_experiment_report(
    payload: ExperimentReportRequest,
    request: Request,
) -> dict[str, Any]:
    state = get_simulation_state(request)
    analysis = _build_experiment_analysis(state, payload.days)
    fallback = _fallback_experiment_report(analysis)
    prompt = build_experiment_report_prompt(
        graph_stats=analysis["graph_stats"],
        event_timeline=analysis["event_timeline"],
        emotion_distribution=analysis["emotion_distribution"],
        social_hotspots=analysis["social_hotspots"],
    )
    content = await chat_completion(prompt, max_tokens=900)
    report = _parse_experiment_report_response(content, fallback)
    experiment_payload = {
        **report,
        "stats": analysis["stats"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    request.app.state.latest_experiment_report = experiment_payload
    return experiment_payload


@router.get("/latest")
async def get_latest_report(request: Request) -> dict[str, Any]:
    latest_report = getattr(request.app.state, "latest_report", None)
    if latest_report is None:
        raise HTTPException(status_code=404, detail="latest report not found")
    return latest_report
