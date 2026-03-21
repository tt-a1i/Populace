"""Runtime settings endpoints — allow users to configure the LLM API key via the UI."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from backend.llm import client as llm_client

router = APIRouter(prefix="/api/settings", tags=["settings"])


class LlmKeyRequest(BaseModel):
    api_key: str


class LlmKeyStatusResponse(BaseModel):
    configured: bool


@router.post("/llm-key", response_model=LlmKeyStatusResponse)
async def set_llm_key(payload: LlmKeyRequest) -> LlmKeyStatusResponse:
    """Set the LLM API key at runtime (stored in memory only, not persisted to disk)."""
    key = payload.api_key.strip()
    llm_client.set_runtime_api_key(key if key else None)
    return LlmKeyStatusResponse(configured=bool(key))


@router.get("/llm-key", response_model=LlmKeyStatusResponse)
async def get_llm_key_status() -> LlmKeyStatusResponse:
    """Return whether a usable LLM API key is currently configured (never returns the key itself)."""
    return LlmKeyStatusResponse(configured=llm_client.has_runtime_api_key())
