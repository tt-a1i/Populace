"""LLM subsystem for the Populace backend.

Public API:
    chat_completion     — async LLM call with fault tolerance (§9)
    build_*_prompt      — prompt template builders for the Agent loop (§4.1)
    TokenBudget         — daily token budget controller (§9)
"""
from backend.llm.client import chat_completion
from backend.llm.prompts import (
    build_dialogue_eval_prompt,
    build_dialogue_prompt,
    build_perceive_prompt,
    build_plan_prompt,
    build_reflect_prompt,
)
from backend.llm.token_budget import TokenBudget

__all__ = [
    "chat_completion",
    "build_perceive_prompt",
    "build_plan_prompt",
    "build_dialogue_prompt",
    "build_reflect_prompt",
    "build_dialogue_eval_prompt",
    "TokenBudget",
]
