from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_docs_and_openapi_are_available(client: TestClient) -> None:
    docs_response = client.get("/docs")
    assert docs_response.status_code == 200
    assert "Swagger UI" in docs_response.text

    openapi_response = client.get("/openapi.json")
    assert openapi_response.status_code == 200

    payload = openapi_response.json()
    health_schema = payload["paths"]["/health"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    residents_schema = payload["paths"]["/api/residents"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    buildings_schema = payload["paths"]["/api/world/buildings"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]

    assert health_schema["$ref"] == "#/components/schemas/HealthResponse"
    assert residents_schema["items"]["$ref"] == "#/components/schemas/ResidentResponse"
    assert buildings_schema["items"]["$ref"] == "#/components/schemas/BuildingResponse"


def test_invalid_simulation_speed_returns_validation_error(client: TestClient) -> None:
    response = client.post("/api/simulation/speed", json={"speed": 3})

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Input should be 1, 2 or 5",
        "code": "validation_error",
    }


def test_blank_world_event_description_returns_validation_error(client: TestClient) -> None:
    response = client.post("/api/world/events", json={"description": "   ", "source": "user"})

    assert response.status_code == 422
    assert response.json() == {
        "detail": "description is required when preset_id is empty",
        "code": "validation_error",
    }


def test_patch_missing_resident_returns_error_code(client: TestClient) -> None:
    response = client.patch("/api/residents/missing-resident", json={"mood": "sad"})

    assert response.status_code == 404
    assert response.json() == {
        "detail": "resident not found",
        "code": "resident_not_found",
    }


def test_missing_report_returns_error_code(client: TestClient) -> None:
    client.app.state.latest_report = None
    response = client.get("/api/report/latest")

    assert response.status_code == 404
    assert response.json() == {
        "detail": "latest report not found",
        "code": "report_not_found",
    }


def test_missing_save_returns_error_code(client: TestClient) -> None:
    response = client.post("/api/saves/missing-save/load")

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Save 'missing-save' not found",
        "code": "save_not_found",
    }
