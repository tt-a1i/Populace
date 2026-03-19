from __future__ import annotations

import argparse
import asyncio
from typing import Any

import httpx
import websockets


async def check_backend_health(client: httpx.AsyncClient, backend_url: str) -> dict[str, Any]:
    response = await client.get(f"{backend_url}/health")
    response.raise_for_status()
    return response.json()


async def check_frontend(client: httpx.AsyncClient, frontend_url: str) -> int:
    response = await client.get(frontend_url)
    response.raise_for_status()
    return response.status_code


async def check_frontend_backend_proxy(client: httpx.AsyncClient, frontend_url: str) -> int:
    response = await client.get(f"{frontend_url}/api/simulation/status")
    response.raise_for_status()
    return response.status_code


async def check_websocket(backend_url: str) -> str:
    websocket_url = backend_url.replace("http://", "ws://").replace("https://", "wss://") + "/ws"
    async with websockets.connect(websocket_url) as websocket:
        message = await websocket.recv()
        return str(message)


async def start_simulation(client: httpx.AsyncClient, backend_url: str) -> dict[str, Any]:
    response = await client.post(f"{backend_url}/api/simulation/start")
    response.raise_for_status()
    return response.json()


async def get_simulation_status(client: httpx.AsyncClient, backend_url: str) -> dict[str, Any]:
    response = await client.get(f"{backend_url}/api/simulation/status")
    response.raise_for_status()
    return response.json()


async def run_smoke_tests(backend_url: str, frontend_url: str) -> None:
    timeout = httpx.Timeout(10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        health = await check_backend_health(client, backend_url)
        frontend_status = await check_frontend(client, frontend_url)
        frontend_proxy_status = await check_frontend_backend_proxy(client, frontend_url)
        websocket_message = await check_websocket(backend_url)
        start_payload = await start_simulation(client, backend_url)
        status_payload = await get_simulation_status(client, backend_url)

    print("backend /health:", health)
    print("frontend status:", frontend_status)
    print("frontend proxy /api/simulation/status:", frontend_proxy_status)
    print("websocket message sample:", websocket_message[:160])
    print("simulation start:", start_payload)
    print("simulation status:", status_payload)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Populace smoke tests")
    parser.add_argument("--backend-url", default="http://localhost:8000")
    parser.add_argument("--frontend-url", default="http://localhost:3000")
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Only validate script wiring and configuration without network calls.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.check_only:
        print(
            {
                "backend_url": args.backend_url,
                "frontend_url": args.frontend_url,
                "checks": [
                    "GET /health",
                    "GET frontend root",
                    "GET frontend /api/simulation/status (proxy to backend)",
                    "CONNECT /ws",
                    "POST /api/simulation/start",
                    "GET /api/simulation/status",
                ],
            }
        )
        return

    asyncio.run(run_smoke_tests(args.backend_url, args.frontend_url))


if __name__ == "__main__":
    main()
