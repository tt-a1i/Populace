"""OpenAI-compatible async LLM client.

Implements the fault-tolerance strategy from spec §9:
- Timeout → return None (no exception raised)
- 500/503 → exponential back-off, max 3 retries, then return None
- Other API errors → return None
"""
from __future__ import annotations

import asyncio
import logging

from openai import AsyncOpenAI, APIStatusError, APITimeoutError

from backend.core.config import settings

logger = logging.getLogger(__name__)

# Module-level client; lazily initialised so import doesn't fail when
# LLM_API_KEY is empty (e.g. during tests that mock the function).
_client: AsyncOpenAI | None = None
_llm_semaphore: asyncio.Semaphore | None = None
_llm_semaphore_limit: int | None = None


def validate_llm_config() -> bool:
    api_key = settings.llm_api_key.strip()
    invalid_tokens = {"", "changeme", "placeholder", "your-api-key", "sk-placeholder"}

    if not api_key or api_key.lower() in invalid_tokens or "placeholder" in api_key.lower():
        raise ValueError("LLM_API_KEY is missing or invalid. Please configure LLM before starting simulation.")
    return True


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        validate_llm_config()
        _client = AsyncOpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url or None,
            timeout=settings.llm_timeout_seconds,
        )
    return _client


def _get_llm_semaphore() -> asyncio.Semaphore:
    global _llm_semaphore, _llm_semaphore_limit

    # Only create a new semaphore if none exists yet; honour monkeypatched values.
    if _llm_semaphore is None:
        limit = max(1, settings.max_concurrent_llm_calls)
        _llm_semaphore = asyncio.Semaphore(limit)
        _llm_semaphore_limit = limit
    return _llm_semaphore


async def chat_completion(
    messages: list[dict],
    max_tokens: int = 200,
) -> str | None:
    """Send a chat completion request and return the reply text.

    Args:
        messages:   OpenAI-format message list, e.g.
                    ``[{"role": "user", "content": "..."}]``.
        max_tokens: Maximum tokens in the response (spec §4.1: ≤ 200).

    Returns:
        The assistant reply string, or *None* on any failure (timeout,
        server error after retries, or other API error).
    """
    model = settings.llm_model_name or "gpt-4o-mini"

    max_retries = 3
    backoff = 1.0  # seconds

    async with _get_llm_semaphore():
        for attempt in range(1, max_retries + 1):
            try:
                client = _get_client()  # raises ValueError when no API key configured
                response = await client.chat.completions.create(
                    model=model,
                    messages=messages,  # type: ignore[arg-type]
                    max_tokens=max_tokens,
                )
                return response.choices[0].message.content

            except APITimeoutError:
                logger.warning("LLM timeout (attempt %d/%d)", attempt, max_retries)
                # Spec §9: timeout → fall back to rule engine, do not retry
                return None

            except APIStatusError as exc:
                if exc.status_code in (500, 503) and attempt < max_retries:
                    logger.warning(
                        "LLM %d error (attempt %d/%d), retrying in %.1fs",
                        exc.status_code, attempt, max_retries, backoff,
                    )
                    await asyncio.sleep(backoff)
                    backoff *= 2  # exponential back-off
                    continue
                logger.error(
                    "LLM API error %d after %d attempt(s): %s",
                    exc.status_code, attempt, exc.message,
                )
                return None

            except ValueError as exc:
                # LLM not configured (no API key) — silently return None
                logger.debug("LLM not configured, skipping call: %s", exc)
                return None

            except Exception as exc:  # noqa: BLE001
                logger.error("Unexpected LLM error: %s", exc)
                return None

    return None
