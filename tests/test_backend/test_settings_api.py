"""Tests for POST/GET /api/settings/llm-key endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.llm import client as llm_client
from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_runtime_key():
    """Ensure the runtime API key is cleared between tests."""
    original = llm_client._runtime_api_key
    yield
    llm_client.set_runtime_api_key(original)


def test_get_llm_key_status_not_configured(client):
    llm_client.set_runtime_api_key(None)
    response = client.get("/api/settings/llm-key")
    assert response.status_code == 200
    assert response.json() == {"configured": False}


def test_set_llm_key_valid(client):
    response = client.post("/api/settings/llm-key", json={"api_key": "sk-test-valid-key"})
    assert response.status_code == 200
    assert response.json() == {"configured": True}


def test_set_llm_key_updates_status(client):
    client.post("/api/settings/llm-key", json={"api_key": "sk-test-key-abc"})
    status = client.get("/api/settings/llm-key")
    assert status.json()["configured"] is True


def test_set_llm_key_empty_string(client):
    response = client.post("/api/settings/llm-key", json={"api_key": ""})
    assert response.status_code == 200
    assert response.json() == {"configured": False}


def test_set_llm_key_whitespace_only(client):
    response = client.post("/api/settings/llm-key", json={"api_key": "   "})
    assert response.status_code == 200
    assert response.json() == {"configured": False}


def test_set_llm_key_invalid_placeholder(client):
    response = client.post("/api/settings/llm-key", json={"api_key": "changeme"})
    assert response.status_code == 200
    # "changeme" is stored but has_runtime_api_key returns False for known invalids
    status = client.get("/api/settings/llm-key")
    assert status.json()["configured"] is False


def test_set_then_clear_key(client):
    client.post("/api/settings/llm-key", json={"api_key": "sk-real-key"})
    assert client.get("/api/settings/llm-key").json()["configured"] is True
    client.post("/api/settings/llm-key", json={"api_key": ""})
    assert client.get("/api/settings/llm-key").json()["configured"] is False


def test_set_llm_key_resets_client(client):
    """Setting a new key should reset the cached LLM client."""
    llm_client._client = object()  # type: ignore[assignment]  # sentinel
    client.post("/api/settings/llm-key", json={"api_key": "sk-fresh"})
    assert llm_client._client is None
