"""Personality traits system: residents have four quantitative trait dimensions.

Each trait is a float in [0.0, 1.0]:
  - extraversion:    willingness to initiate social interactions
  - optimism:        resistance to negative mood accumulation
  - thrift:          reluctance to spend money on non-essentials
  - adventurousness: probability of embarking on travel

Traits are randomly generated at resident initialisation and drift slowly over
time (every 20 ticks, each trait has a 5 % chance of shifting ±0.05).
"""
from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from engine.types import Resident

TRAIT_NAMES = ("extraversion", "optimism", "thrift", "adventurousness")

_DEFAULT_TRAITS: dict[str, float] = {
    "extraversion": 0.5,
    "optimism": 0.5,
    "thrift": 0.5,
    "adventurousness": 0.5,
}

_DRIFT_CHANCE = 0.05
_DRIFT_AMOUNT = 0.05


def generate_personality_traits(rng: random.Random | None = None) -> dict[str, float]:
    """Return a fresh random trait dict with all four traits in [0.1, 0.9]."""
    r = rng if rng is not None else random.Random()
    return {name: round(r.uniform(0.1, 0.9), 3) for name in TRAIT_NAMES}


def get_trait(resident: Any, trait: str) -> float:
    """Return a resident's trait value, falling back to 0.5 if unset."""
    traits: dict[str, float] = getattr(resident, "personality_traits", {}) or {}
    return float(traits.get(trait, 0.5))


def _drift_resident_traits(resident: Any, rng: random.Random) -> None:
    traits: dict[str, float] = getattr(resident, "personality_traits", None)
    if not isinstance(traits, dict):
        return
    for name in TRAIT_NAMES:
        if rng.random() < _DRIFT_CHANCE:
            delta = _DRIFT_AMOUNT if rng.random() < 0.5 else -_DRIFT_AMOUNT
            old = float(traits.get(name, 0.5))
            traits[name] = round(max(0.0, min(1.0, old + delta)), 3)


def drift_traits(state: Any) -> None:
    """Called from world.tick() every 20 ticks to slowly evolve all traits."""
    world = getattr(state, "world", state)
    rng: random.Random = getattr(world, "rng", random.Random())
    for agent in getattr(world, "agents", []):
        _drift_resident_traits(agent.resident, rng)


def get_personality_stats(state: Any) -> dict[str, float]:
    """Return the average value of each trait across all residents."""
    world = getattr(state, "world", state)
    agents = getattr(world, "agents", [])
    if not agents:
        return {name: 0.5 for name in TRAIT_NAMES}

    totals: dict[str, float] = {name: 0.0 for name in TRAIT_NAMES}
    count = len(agents)
    for agent in agents:
        for name in TRAIT_NAMES:
            totals[name] += get_trait(agent.resident, name)

    return {name: round(totals[name] / count, 3) for name in TRAIT_NAMES}
