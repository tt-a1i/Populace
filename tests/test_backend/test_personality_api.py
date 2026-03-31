from fastapi.testclient import TestClient

from backend.main import app


def test_personality_stats_endpoint_returns_four_traits():
    with TestClient(app) as client:
        response = client.get("/api/world/personality_stats")

    assert response.status_code == 200
    payload = response.json()

    assert {"extraversion", "optimism", "thrift", "adventurousness"} == set(payload.keys())
    for key, value in payload.items():
        assert isinstance(value, (int, float)), f"{key} should be numeric"
        assert 0.0 <= value <= 1.0, f"{key} should be in [0, 1]"
