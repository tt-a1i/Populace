from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app


def _read_until_type(websocket, message_type: str) -> dict:
    while True:
        payload = websocket.receive_json()
        if payload.get("type") == message_type:
            return payload


def test_connections_endpoint_counts_active_websocket_clients() -> None:
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws_a:
            _read_until_type(ws_a, "session")
            _read_until_type(ws_a, "snapshot")

            with client.websocket_connect("/ws") as ws_b:
                _read_until_type(ws_b, "session")
                _read_until_type(ws_b, "snapshot")

                response = client.get("/api/simulation/connections")

                assert response.status_code == 200
                assert response.json() == {"count": 2}


def test_god_mode_operations_broadcast_to_other_clients_only() -> None:
    with TestClient(app) as client:
        resident_id = client.get("/api/residents").json()[0]["id"]
        with client.websocket_connect("/ws") as ws_a:
            session_a = _read_until_type(ws_a, "session")
            _read_until_type(ws_a, "snapshot")

            with client.websocket_connect("/ws") as ws_b:
                _read_until_type(ws_b, "session")
                _read_until_type(ws_b, "snapshot")

                response = client.post(
                    f"/api/residents/{resident_id}/teleport",
                    json={"x": 7, "y": 8},
                    headers={"x-populace-client-id": session_a["data"]["client_id"]},
                )

                assert response.status_code == 200

                operation = _read_until_type(ws_b, "operation")

                assert operation["data"]["operation"] == "resident_teleported"
                assert operation["data"]["resident"]["id"] == resident_id
                assert operation["data"]["resident"]["x"] == 7
                assert operation["data"]["resident"]["y"] == 8
                assert operation["data"]["source_client_id"] == session_a["data"]["client_id"]
