from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from backend.llm import client as llm_client


def _fake_response(content: str = "ok") -> SimpleNamespace:
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content),
            )
        ]
    )


@pytest.mark.asyncio
async def test_chat_completion_respects_llm_semaphore(monkeypatch: pytest.MonkeyPatch) -> None:
    tracker = {"current": 0, "max_seen": 0}

    async def create(**_: object) -> SimpleNamespace:
        tracker["current"] += 1
        tracker["max_seen"] = max(tracker["max_seen"], tracker["current"])
        await asyncio.sleep(0.02)
        tracker["current"] -= 1
        return _fake_response()

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=create),
        )
    )
    semaphore = asyncio.Semaphore(2)

    monkeypatch.setattr(llm_client, "_client", fake_client)
    monkeypatch.setattr(llm_client, "_get_llm_semaphore", lambda: semaphore)

    await asyncio.gather(
        *(
            llm_client.chat_completion([{"role": "user", "content": f"hello-{index}"}])
            for index in range(6)
        )
    )

    assert tracker["max_seen"] <= 2
