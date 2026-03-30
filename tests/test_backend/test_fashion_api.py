from fastapi.testclient import TestClient

from backend.main import app


def test_world_fashion_endpoint_returns_trends_rankings_and_consumption():
    with TestClient(app) as client:
        response = client.get("/api/world/fashion")

    assert response.status_code == 200
    payload = response.json()

    assert {"current_trend", "trend_history", "rankings", "consumption"} <= set(payload)
    assert {"color_name", "color", "style", "category"} <= set(payload["current_trend"])
    assert isinstance(payload["rankings"], list)
    assert isinstance(payload["consumption"]["recent_purchases"], list)
