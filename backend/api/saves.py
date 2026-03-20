"""Save / load simulation state.

Saves are stored as JSON files in ``backend/saves/``.
Each file is named ``<save_id>.json`` and contains the full serialised
world state produced by :meth:`SimulationState.save_state`.
"""
from __future__ import annotations

import json
import pathlib
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from backend.api.schemas import DeleteSaveResponse, LoadSaveResponse, SaveMetaResponse, api_error, error_responses

from backend.api.simulation import get_simulation_state

router = APIRouter(prefix="/api/saves", tags=["saves"])

SAVES_DIR = pathlib.Path(__file__).parent.parent / "saves"
SAVES_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _save_path(save_id: str) -> pathlib.Path:
    return SAVES_DIR / f"{save_id}.json"


def _read_save(save_id: str) -> dict[str, Any]:
    path = _save_path(save_id)
    if not path.exists():
        raise api_error(404, f"Save '{save_id}' not found", "save_not_found")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _save_meta(save_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Return the lightweight metadata shown in the list endpoint."""
    return {
        "id": save_id,
        "name": data.get("name", f"存档 {save_id[:8]}"),
        "created_at": data.get("created_at", ""),
        "tick": data.get("tick", 0),
    }


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class SaveRequest(BaseModel):
    name: str = Field(default="", max_length=80)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "",
    status_code=201,
    response_model=SaveMetaResponse,
    responses=error_responses(503),
)
async def create_save(payload: SaveRequest, request: Request) -> SaveMetaResponse:
    """Serialise the current simulation state and write it to disk."""
    state = get_simulation_state(request)
    save_id = str(uuid4())
    data = state.save_state()
    data["id"] = save_id
    data["name"] = payload.name.strip() or f"存档 Tick-{data['tick']}"
    data["created_at"] = datetime.now(timezone.utc).isoformat()

    with open(_save_path(save_id), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)

    return SaveMetaResponse(**_save_meta(save_id, data))


@router.get("", response_model=list[SaveMetaResponse])
async def list_saves() -> list[SaveMetaResponse]:
    """Return metadata for all saves, newest first."""
    saves: list[SaveMetaResponse] = []
    for path in sorted(SAVES_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            saves.append(SaveMetaResponse(**_save_meta(path.stem, data)))
        except Exception:
            pass  # Skip corrupt files
    return saves


@router.post(
    "/{save_id}/load",
    response_model=LoadSaveResponse,
    responses=error_responses(404, 503),
)
async def load_save(save_id: str, request: Request) -> LoadSaveResponse:
    """Restore the simulation to the state stored in the given save."""
    state = get_simulation_state(request)
    data = _read_save(save_id)
    await state.load_state(data)
    return LoadSaveResponse(
        ok=True,
        tick=state.world.current_tick,
        agents=len(state.world.agents),
        buildings=len(state.world.buildings),
    )


@router.delete(
    "/{save_id}",
    response_model=DeleteSaveResponse,
    responses=error_responses(404),
)
async def delete_save(save_id: str) -> DeleteSaveResponse:
    """Permanently delete a save file."""
    path = _save_path(save_id)
    if not path.exists():
        raise api_error(404, f"Save '{save_id}' not found", "save_not_found")
    path.unlink()
    return DeleteSaveResponse(ok=True, id=save_id)
