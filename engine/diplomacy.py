from __future__ import annotations

import random
from typing import Iterable

from engine.types import ExternalTown, TradeRoute

_TOWN_BLUEPRINTS: tuple[dict[str, object], ...] = (
    {"name": "海雾港", "specialties": ["海盐", "珍珠"], "relation_score": 0.28},
    {"name": "松风镇", "specialties": ["木材", "草药"], "relation_score": 0.12},
    {"name": "赤陶集", "specialties": ["陶器", "香料"], "relation_score": -0.05},
    {"name": "晨砂驿", "specialties": ["丝绸", "矿石"], "relation_score": 0.18},
    {"name": "月溪城", "specialties": ["果酒", "书卷"], "relation_score": 0.34},
)

_GENERAL_GOODS: tuple[str, ...] = ("coffee", "goods", "book", "silk", "tea")
_SPECIALTY_TO_GOOD = {
    "海盐": "salt",
    "珍珠": "pearl",
    "木材": "timber",
    "草药": "herbs",
    "陶器": "pottery",
    "香料": "spices",
    "丝绸": "silk",
    "矿石": "ore",
    "果酒": "wine",
    "书卷": "books",
}


def clamp(value: float, low: float = -1.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def relation_status(score: float) -> str:
    if score >= 0.35:
        return "friendly"
    if score <= -0.2:
        return "tense"
    return "neutral"


def generate_external_towns(seed: int | None = None) -> list[ExternalTown]:
    rng = random.Random(seed)
    town_count = rng.randint(2, 3)
    selected = rng.sample(list(_TOWN_BLUEPRINTS), k=town_count)
    towns: list[ExternalTown] = []
    for blueprint in selected:
        towns.append(
            ExternalTown(
                name=str(blueprint["name"]),
                relation_score=float(blueprint["relation_score"]),
                specialties=list(blueprint["specialties"]),
            )
        )
    return towns


def route_id(route: TradeRoute) -> str:
    return f"{route.from_town}->{route.to_town}"


def select_trade_goods(town: ExternalTown) -> list[str]:
    goods = ["coffee"]
    translated = [
        _SPECIALTY_TO_GOOD[specialty]
        for specialty in town.specialties
        if specialty in _SPECIALTY_TO_GOOD
    ]
    goods.extend(translated[:2])
    if len(goods) == 1:
        goods.append(_GENERAL_GOODS[sum(ord(char) for char in town.name) % len(_GENERAL_GOODS)])

    deduped: list[str] = []
    for item in goods:
        if item not in deduped:
            deduped.append(item)
    return deduped[:3]


def calculate_trade_profit(
    route: TradeRoute,
    town: ExternalTown,
    trading_skill: float,
    safety_index: float,
) -> float:
    base_profit = max(1.0, float(route.profit_per_tick))
    relation_multiplier = 1.0 + clamp(town.relation_score, -0.7, 0.8) * 0.35
    skill_multiplier = 0.88 + max(0.0, float(trading_skill)) * 0.42
    safety_multiplier = 0.72 + clamp(float(safety_index), 0.0, 1.0) * 0.36
    rare_bonus = 1.0 + min(len(route.rare_goods), 2) * 0.06
    diversity_bonus = 1.0 + max(0, len(route.goods) - 1) * 0.04
    return round(base_profit * relation_multiplier * skill_multiplier * safety_multiplier * rare_bonus * diversity_bonus, 2)


def select_rare_goods(town: ExternalTown, goods: Iterable[str]) -> list[str]:
    rare_goods = [specialty for specialty in town.specialties if _SPECIALTY_TO_GOOD.get(specialty) not in goods]
    return rare_goods[:2] or list(town.specialties[:1])
