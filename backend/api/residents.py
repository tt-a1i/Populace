from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.api.simulation import get_simulation_state


router = APIRouter(prefix="/api/residents", tags=["residents"])


class ResidentUpdateRequest(BaseModel):
    name: Optional[str] = None
    personality: Optional[str] = None
    goals: Optional[list[str]] = None
    mood: Optional[str] = None
    location: Optional[str] = None
    x: Optional[int] = None
    y: Optional[int] = None


@router.get("")
async def list_residents(request: Request) -> list[dict[str, Any]]:
    state = get_simulation_state(request)
    return [asdict(agent.resident) for agent in state.world.agents]


@router.get("/{resident_id}")
async def get_resident(resident_id: str, request: Request) -> dict[str, Any]:
    state = get_simulation_state(request)

    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            return asdict(agent.resident)

    raise HTTPException(status_code=404, detail="resident not found")


@router.patch("/{resident_id}")
async def update_resident(
    resident_id: str,
    payload: ResidentUpdateRequest,
    request: Request,
) -> dict[str, Any]:
    state = get_simulation_state(request)

    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            updates = payload.model_dump(exclude_unset=True)
            for field_name, value in updates.items():
                setattr(agent.resident, field_name, value)
            return asdict(agent.resident)

    raise HTTPException(status_code=404, detail="resident not found")
