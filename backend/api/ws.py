from __future__ import annotations

import asyncio
from dataclasses import asdict, is_dataclass
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.api.simulation import SimulationState


router = APIRouter(tags=["ws"])


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    @property
    def count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


def _serialize(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    return value


def build_snapshot(state: SimulationState) -> dict[str, Any]:
    return state.snapshot()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    state = getattr(websocket.app.state, "simulation_state", None)
    if state is None:
        await websocket.close(code=1011)
        return

    await manager.connect(websocket)
    await websocket.send_json({"type": "snapshot", "data": build_snapshot(state)})

    last_sent_tick = state.world.current_tick

    try:
        while True:
            tick_state = state.loop.last_tick_state
            if tick_state is not None and getattr(tick_state, "tick", None) != last_sent_tick:
                await websocket.send_json({"type": "tick", "data": _serialize(tick_state)})
                last_sent_tick = tick_state.tick
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
        raise
