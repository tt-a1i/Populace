from __future__ import annotations

import json
import re
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.api.simulation import get_simulation_state


router = APIRouter(prefix="/api/world", tags=["world"])


class WorldEventRequest(BaseModel):
    description: str = Field(min_length=1)
    source: str = Field(default="user")


@router.post("/events")
async def create_world_event(payload: WorldEventRequest, request: Request) -> dict[str, Any]:
    state = get_simulation_state(request)
    event = {
        "id": str(uuid4()),
        "description": payload.description,
        "source": payload.source,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return state.enqueue_event(event)


class GenerateScenarioRequest(BaseModel):
    description: str = Field(min_length=1, max_length=500)


@router.post("/generate-scenario")
async def generate_scenario(payload: GenerateScenarioRequest) -> dict[str, Any]:
    """Generate a scenario from a user description using LLM (or mock fallback).

    Returns the scenario JSON preview without starting the simulation.
    The caller can then pass this data to ``/api/simulation/start-custom``.
    """
    from backend.llm.client import chat_completion
    from backend.llm.prompts import build_scenario_prompt

    messages = build_scenario_prompt(payload.description)
    raw = await chat_completion(messages, max_tokens=1000)

    scenario: dict[str, Any] | None = None

    if raw:
        scenario = _parse_scenario_json(raw)

    if scenario is None:
        # LLM unavailable or returned unparseable text — use mock generator
        scenario = _mock_scenario(payload.description)

    # Basic structural validation
    if not scenario.get("buildings") or not scenario.get("residents"):
        scenario = _mock_scenario(payload.description)

    return scenario


def _parse_scenario_json(raw: str) -> dict[str, Any] | None:
    """Extract the first valid JSON object from an LLM response string."""
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Try to extract a JSON object with brace matching
    start = cleaned.find("{")
    if start == -1:
        return None
    depth = 0
    for i, ch in enumerate(cleaned[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(cleaned[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _mock_scenario(description: str) -> dict[str, Any]:
    """Return a minimal valid scenario when LLM is unavailable."""
    nums = re.findall(r"\d+", description)
    n = max(2, min(int(nums[0]), 10)) if nums else 4

    name = description[:16].rstrip("，。, ") if description else "自定义小镇"

    buildings: list[dict[str, Any]] = [
        {"id": "home_1", "type": "home", "name": "民居A", "capacity": 4, "position": [5, 8]},
        {"id": "home_2", "type": "home", "name": "民居B", "capacity": 4, "position": [12, 8]},
        {"id": "cafe_1", "type": "cafe", "name": "茶馆", "capacity": 4, "position": [22, 8]},
        {"id": "park_1", "type": "park", "name": "广场", "capacity": 10, "position": [30, 8]},
    ]
    home_ids = ["home_1", "home_2"]
    residents: list[dict[str, Any]] = [
        {
            "id": f"r{i + 1}",
            "name": f"居民{i + 1}",
            "personality": "和善，乐于助人",
            "goals": ["探索小镇", "结交朋友"],
            "mood": "neutral",
            "home_id": home_ids[i % 2],
            "x": 5 + (i % 8) * 4,
            "y": 14,
        }
        for i in range(n)
    ]
    return {
        "name": name,
        "description": description,
        "map": {
            "width": 40,
            "height": 30,
            "roads": [{"x": 0, "y": 14, "width": 40, "height": 2}],
            "water": [],
        },
        "buildings": buildings,
        "residents": residents,
    }


@router.get("/buildings")
async def list_buildings(request: Request) -> list[dict[str, Any]]:
    state = get_simulation_state(request)
    return [asdict(building) for building in state.world.buildings]
