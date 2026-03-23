from __future__ import annotations

import asyncio
from dataclasses import asdict, is_dataclass
from uuid import uuid4
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.api.simulation import SimulationState


router = APIRouter(tags=["ws"])


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket) -> str:
        await websocket.accept()
        client_id = str(uuid4())
        self._connections[client_id] = {
            "websocket": websocket,
            "viewport": None,
        }
        return client_id

    def disconnect(self, client_id: str) -> None:
        self._connections.pop(client_id, None)

    @property
    def count(self) -> int:
        return len(self._connections)

    def update_viewport(self, client_id: str, viewport: dict[str, Any]) -> None:
        if client_id in self._connections:
            self._connections[client_id]["viewport"] = dict(viewport)

    async def send_json(self, client_id: str, payload: dict[str, Any]) -> None:
        connection = self._connections.get(client_id)
        if connection is None:
            return
        await connection["websocket"].send_json(payload)

    async def broadcast_json(
        self,
        payload: dict[str, Any],
        *,
        exclude_client_id: str | None = None,
    ) -> None:
        stale_client_ids: list[str] = []
        for client_id, connection in list(self._connections.items()):
            if exclude_client_id is not None and client_id == exclude_client_id:
                continue
            try:
                await connection["websocket"].send_json(payload)
            except Exception:
                stale_client_ids.append(client_id)
        for client_id in stale_client_ids:
            self.disconnect(client_id)

    async def broadcast_connections(self) -> None:
        await self.broadcast_json({
            "type": "connections",
            "data": {"count": self.count},
        })

    async def broadcast_operation(
        self,
        operation: str,
        *,
        resident: dict[str, Any],
        source_client_id: str | None = None,
    ) -> None:
        await self.broadcast_json(
            {
                "type": "operation",
                "data": {
                    "operation": operation,
                    "resident": resident,
                    "source_client_id": source_client_id,
                },
            },
            exclude_client_id=source_client_id,
        )


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

    client_id = await manager.connect(websocket)
    await manager.send_json(client_id, {
        "type": "session",
        "data": {
            "client_id": client_id,
            "connection_count": manager.count,
        },
    })
    await manager.send_json(client_id, {"type": "snapshot", "data": build_snapshot(state)})
    await manager.broadcast_connections()

    last_sent_tick = state.world.current_tick

    try:
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=0.1)
            except asyncio.TimeoutError:
                message = None

            if isinstance(message, dict):
                message_type = message.get("type")
                if message_type == "get_snapshot":
                    await manager.send_json(client_id, {"type": "snapshot", "data": build_snapshot(state)})
                elif message_type == "viewport":
                    viewport = message.get("data")
                    if isinstance(viewport, dict):
                        manager.update_viewport(client_id, viewport)

            tick_state = state.loop.last_tick_state
            if tick_state is not None and getattr(tick_state, "tick", None) != last_sent_tick:
                await manager.send_json(client_id, {"type": "tick", "data": _serialize(tick_state)})
                last_sent_tick = tick_state.tick
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        await manager.broadcast_connections()
    except Exception:
        manager.disconnect(client_id)
        await manager.broadcast_connections()
        raise
