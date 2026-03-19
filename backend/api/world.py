from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Request
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


@router.get("/buildings")
async def list_buildings(request: Request) -> list[dict[str, Any]]:
    state = get_simulation_state(request)
    return [asdict(building) for building in state.world.buildings]
