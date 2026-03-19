"""Populace simulation engine.

Public API — everything a backend or standalone user needs:

    from engine import Resident, Building, Memory, Agent, World
"""
from engine.types import (
    Building,
    DialogueUpdate,
    Event,
    EventUpdate,
    Memory,
    MovementUpdate,
    Reflection,
    RelationshipDelta,
    RelationType,
    Relationship,
    Resident,
    TickState,
    WorldConfig,
)
from engine.agent import Agent
from engine.generative_agent import GenerativeAgent
from engine.world import World
from engine.memory import MemoryStream

# Submodule functions are intentionally NOT re-exported here to avoid
# shadowing the engine.perceive / engine.act / engine.social submodules.
# Import them directly: from engine.perceive import perceive

__all__ = [
    "Resident",
    "Building",
    "Memory",
    "Event",
    "Reflection",
    "RelationType",
    "Relationship",
    "MovementUpdate",
    "DialogueUpdate",
    "RelationshipDelta",
    "EventUpdate",
    "TickState",
    "WorldConfig",
    "Agent",
    "GenerativeAgent",
    "World",
    "MemoryStream",
]
