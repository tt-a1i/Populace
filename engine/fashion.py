from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING, Any

from engine.types import Appearance, ClothingItem

if TYPE_CHECKING:
    from engine.types import Resident


TREND_COLORS: tuple[tuple[str, str], ...] = (
    ("sky", "#38BDF8"),
    ("rose", "#FB7185"),
    ("emerald", "#34D399"),
    ("amber", "#F59E0B"),
    ("violet", "#A78BFA"),
    ("slate", "#94A3B8"),
)
TREND_STYLES: tuple[str, ...] = ("classic", "tailored", "street", "heritage", "minimal", "artisan")
CLOTHING_CATEGORIES: tuple[str, ...] = ("work", "formal", "casual", "festive")
STYLE_FOLLOWER_KEYWORDS: tuple[str, ...] = (
    "时尚",
    "爱美",
    "潮",
    "精致",
    "艺术",
    "设计",
    "fashion",
    "style",
    "trend",
)
CATEGORY_LABELS: dict[str, str] = {
    "work": "工作装",
    "formal": "正装",
    "casual": "休闲装",
    "festive": "节日装",
}
STYLE_LABELS: dict[str, str] = {
    "classic": "经典",
    "tailored": "利落",
    "street": "街头",
    "heritage": "复古",
    "minimal": "极简",
    "artisan": "手作",
}


def _clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def _checksum(value: str) -> int:
    return sum(ord(char) for char in value)


def _color_pair(index: int) -> tuple[str, str]:
    return TREND_COLORS[index % len(TREND_COLORS)]


def _current_hour(world: Any) -> float:
    tick_per_day = max(1, int(getattr(world.config, "tick_per_day", 48)))
    return (int(getattr(world, "current_tick", 0)) % tick_per_day) * 24.0 / tick_per_day


def ensure_world_fashion_state(world: Any) -> None:
    current_trend = getattr(world, "fashion_trend", None)
    if not isinstance(current_trend, dict) or not {"color_name", "color", "style", "category"} <= set(current_trend):
        color_name, color_hex = _color_pair(_checksum(f"{getattr(world.config, 'seed', 0)}:{len(getattr(world, 'agents', []))}"))
        world.fashion_trend = {
            "color_name": color_name,
            "color": color_hex,
            "style": TREND_STYLES[_checksum(color_name) % len(TREND_STYLES)],
            "category": "casual",
            "started_tick": int(getattr(world, "current_tick", 0)),
        }
    if not hasattr(world, "fashion_trend_history") or not getattr(world, "fashion_trend_history"):
        world.fashion_trend_history = [dict(world.fashion_trend)]
    if not hasattr(world, "fashion_purchase_history"):
        world.fashion_purchase_history = []
    if not hasattr(world, "fashion_design_history"):
        world.fashion_design_history = []


def _resident_base_style_score(world: Any, resident: Resident) -> float:
    skills = getattr(resident, "skills", {}) or {}
    art = float(skills.get("art", 0.0))
    crafting = float(skills.get("crafting", 0.0))
    social = float(skills.get("social", 0.0))
    reputation = max(0.0, float(getattr(resident, "reputation", 0.0)))
    artistic_talent = float(getattr(resident, "artistic_talent", 0.0))
    personality = str(getattr(resident, "personality", "")).lower()
    style_affinity = 0.08 if any(keyword in personality for keyword in STYLE_FOLLOWER_KEYWORDS) else 0.0
    return round(
        _clamp(
            0.24
            + art * 0.22
            + crafting * 0.18
            + social * 0.1
            + reputation * 0.08
            + artistic_talent * 0.18
            + style_affinity
        ),
        3,
    )


def _build_clothing_item(
    resident: Resident,
    category: str,
    slot: int,
    *,
    prefer_trend: bool = False,
    trend: dict[str, Any] | None = None,
    designed_by: str | None = None,
) -> ClothingItem:
    seed = _checksum(f"{resident.id}:{resident.name}:{category}:{slot}:{designed_by or 'default'}")
    style = TREND_STYLES[(seed // 7) % len(TREND_STYLES)]
    color_name, color_hex = _color_pair(seed)
    if prefer_trend and trend:
        color_name = str(trend.get("color_name", color_name))
        color_hex = str(trend.get("color", color_hex))
        style = str(trend.get("style", style))
    quality = round(_clamp(0.35 + ((seed % 45) / 100) + (0.08 if designed_by else 0.0)), 3)
    price = round(8.0 + quality * 12 + (3.0 if designed_by else 0.0), 2)
    return ClothingItem(
        id=f"{resident.id}-{category}-{slot}-{seed % 997}",
        name=f"{color_name.title()} {STYLE_LABELS.get(style, style)}{CATEGORY_LABELS.get(category, category)}",
        category=category,
        color_name=color_name,
        color=color_hex,
        style=style,
        price=price,
        quality=quality,
        designed_by=designed_by,
    )


def ensure_resident_fashion(world: Any, resident: Resident) -> None:
    ensure_world_fashion_state(world)

    appearance = getattr(resident, "appearance", None)
    if isinstance(appearance, dict):
        resident.appearance = Appearance(**appearance)
    elif not isinstance(appearance, Appearance):
        resident.appearance = Appearance()

    wardrobe = getattr(resident, "wardrobe", [])
    if wardrobe and isinstance(wardrobe[0], dict):
        resident.wardrobe = [ClothingItem(**item) for item in wardrobe]
    else:
        resident.wardrobe = list(wardrobe)

    if not resident.wardrobe:
        resident.wardrobe = [
            _build_clothing_item(resident, "casual", 0),
            _build_clothing_item(resident, "work", 1),
            _build_clothing_item(resident, "formal", 2),
            _build_clothing_item(resident, "festive", 3, prefer_trend=True, trend=world.fashion_trend),
        ]

    resident.appearance.hair = str(getattr(resident, "hair_style", None) or resident.appearance.hair or "short")
    resident.appearance.style_score = max(
        float(getattr(resident.appearance, "style_score", 0.0)),
        _resident_base_style_score(world, resident),
    )
    if not resident.appearance.clothing:
        resident.appearance.clothing = "casual"


def _trend_match_score(item: ClothingItem, trend: dict[str, Any]) -> float:
    score = 0.0
    if item.color_name == trend.get("color_name"):
        score += 0.45
    if item.style == trend.get("style"):
        score += 0.35
    if item.category == trend.get("category"):
        score += 0.2
    return round(_clamp(score), 3)


def _fashion_forward(resident: Resident) -> bool:
    personality = str(getattr(resident, "personality", "")).lower()
    if any(keyword in personality for keyword in STYLE_FOLLOWER_KEYWORDS):
        return True
    occupation = str(getattr(resident, "occupation", "") or getattr(getattr(resident, "job", None), "title", ""))
    return occupation in {"artist", "tailor"}


def _occasion_for_resident(world: Any, resident: Resident) -> str:
    if getattr(world, "active_festival", None) or int(getattr(world, "active_festival_ticks_remaining", 0)) > 0:
        return "festive"
    hour = _current_hour(world)
    occupation = str(getattr(getattr(resident, "job", None), "title", getattr(resident, "occupation", "unemployed")))
    if occupation not in {"unemployed", "student", "infant"} and (8.0 <= hour < 12.0 or 13.0 <= hour < 17.0):
        return "work"
    if occupation in {"doctor", "teacher", "guard"} or float(getattr(resident, "reputation", 0.0)) >= 0.7:
        return "formal"
    return "casual"


def current_clothing_item(world: Any, resident: Resident) -> ClothingItem:
    ensure_resident_fashion(world, resident)
    target_category = resident.appearance.clothing or "casual"
    current_color = str(getattr(resident, "outfit_color", "") or "")
    for item in resident.wardrobe:
        if item.category == target_category and (not current_color or item.color == current_color):
            return item
    for item in resident.wardrobe:
        if item.category == target_category:
            return item
    return resident.wardrobe[0]


def apply_outfit_for_occasion(world: Any, resident: Resident, occasion: str | None = None) -> ClothingItem:
    ensure_world_fashion_state(world)
    ensure_resident_fashion(world, resident)
    target_category = occasion or _occasion_for_resident(world, resident)
    candidates = [item for item in resident.wardrobe if item.category == target_category] or list(resident.wardrobe)
    trend = world.fashion_trend
    selected = max(
        candidates,
        key=lambda item: (
            _trend_match_score(item, trend),
            item.quality,
            1 if item.designed_by else 0,
            item.price,
        ),
    )
    trend_match = _trend_match_score(selected, trend)
    style_bonus = 0.12 if _fashion_forward(resident) and trend_match >= 0.45 else 0.0
    resident.appearance.clothing = selected.category
    resident.appearance.style_score = round(
        _clamp(
            _resident_base_style_score(world, resident) * 0.55
            + selected.quality * 0.35
            + trend_match * 0.18
            + style_bonus
        ),
        3,
    )
    resident.outfit_color = selected.color
    resident.hair_style = resident.appearance.hair or getattr(resident, "hair_style", None) or "short"
    return selected


def fashion_social_bonus(world: Any, resident: Resident, *, first_impression: bool = False) -> float:
    ensure_resident_fashion(world, resident)
    current_item = current_clothing_item(world, resident)
    trend_match = _trend_match_score(current_item, world.fashion_trend)
    style_score = float(getattr(resident.appearance, "style_score", 0.0))
    boost = max(0.0, (style_score - 0.55) * 0.22)
    if _fashion_forward(resident) and trend_match >= 0.45:
        boost += 0.1
    if first_impression and style_score >= 0.68:
        boost += 0.15
    return round(_clamp(boost, 0.0, 0.35), 3)


def _pick_trend(world: Any) -> dict[str, Any]:
    color_name, color_hex = world.rng.choice(TREND_COLORS)
    style = world.rng.choice(TREND_STYLES)
    category = world.rng.choice(CLOTHING_CATEGORIES)
    return {
        "color_name": color_name,
        "color": color_hex,
        "style": style,
        "category": category,
        "started_tick": int(getattr(world, "current_tick", 0)),
    }


def sync_fashion_for_tick(world: Any) -> list[str]:
    ensure_world_fashion_state(world)
    events: list[str] = []
    if int(getattr(world, "current_tick", 0)) > 0 and int(getattr(world, "current_tick", 0)) % 200 == 0:
        world.fashion_trend = _pick_trend(world)
        world.fashion_trend_history.append(dict(world.fashion_trend))
        world.fashion_trend_history = world.fashion_trend_history[-24:]
        events.append(
            f"新潮流来袭：{world.fashion_trend['color_name']}色 {world.fashion_trend['style']} 风 {CATEGORY_LABELS.get(world.fashion_trend['category'], world.fashion_trend['category'])} 正在流行。"
        )
    for agent in getattr(world, "agents", []):
        apply_outfit_for_occasion(world, agent.resident)
    return events


def _tailor_candidates(world: Any) -> list[Any]:
    return [
        agent
        for agent in getattr(world, "agents", [])
        if str(getattr(getattr(agent, "resident", None), "occupation", "") or getattr(getattr(getattr(agent, "resident", None), "job", None), "title", "")) == "tailor"
    ]


def maybe_tailor_design(world: Any, tailor_agent: Any) -> ClothingItem | None:
    ensure_world_fashion_state(world)
    resident = tailor_agent.resident
    ensure_resident_fashion(world, resident)
    recent_tick = max(
        (
            int(entry.get("tick", -999))
            for entry in world.fashion_design_history
            if entry.get("designer_id") == resident.id
        ),
        default=-999,
    )
    if recent_tick >= int(getattr(world, "current_tick", 0)) - 24:
        return None
    category = str(world.fashion_trend.get("category", "formal"))
    design = _build_clothing_item(
        resident,
        category,
        slot=int(getattr(world, "current_tick", 0)),
        prefer_trend=True,
        trend=world.fashion_trend,
        designed_by=resident.name,
    )
    world.fashion_design_history.append(
        {
            "tick": int(getattr(world, "current_tick", 0)),
            "designer_id": resident.id,
            "designer_name": resident.name,
            "item": {
                "id": design.id,
                "name": design.name,
                "category": design.category,
                "color_name": design.color_name,
                "color": design.color,
                "style": design.style,
                "price": design.price,
                "quality": design.quality,
                "designed_by": design.designed_by,
            },
        }
    )
    world.fashion_design_history = world.fashion_design_history[-40:]
    return design


def maybe_purchase_clothing(world: Any, resident: Resident) -> ClothingItem | None:
    ensure_world_fashion_state(world)
    ensure_resident_fashion(world, resident)
    if float(getattr(resident, "wallet", 0.0)) < 8.0:
        return None
    from engine.personality import get_trait
    thrift = get_trait(resident, "thrift")
    purchase_threshold = 0.35 * (1.0 - thrift * 0.4)  # thrifty residents buy less often
    if world.rng.random() >= purchase_threshold:
        return None

    tailors = _tailor_candidates(world)
    designed_item = None
    if tailors:
        designed_item = maybe_tailor_design(world, tailors[0])
    preferred_category = str(world.fashion_trend.get("category", "casual"))
    purchase_slot = int(getattr(world, "current_tick", 0)) + len(resident.wardrobe)
    item = designed_item or _build_clothing_item(
        resident,
        preferred_category,
        slot=purchase_slot,
        prefer_trend=_fashion_forward(resident),
        trend=world.fashion_trend,
        designed_by=tailors[0].resident.name if designed_item is None and tailors else None,
    )
    if any(existing.id == item.id for existing in resident.wardrobe):
        return None
    price = round(float(item.price), 2)
    if float(getattr(resident, "wallet", 0.0)) < price:
        return None

    resident.wallet = round(float(resident.wallet) - price, 2)
    resident.wardrobe.append(item)
    apply_outfit_for_occasion(world, resident, occasion=item.category)
    if hasattr(world, "shift_resident_mood"):
        world.shift_resident_mood(resident, 1, "fashion")
    if hasattr(world, "_register_gdp"):
        world._register_gdp(price)
    world.fashion_purchase_history.append(
        {
            "tick": int(getattr(world, "current_tick", 0)),
            "resident_id": resident.id,
            "resident_name": resident.name,
            "price": price,
            "category": item.category,
            "color_name": item.color_name,
            "style": item.style,
            "item_name": item.name,
            "designed_by": item.designed_by,
        }
    )
    world.fashion_purchase_history = world.fashion_purchase_history[-120:]
    return item


def get_world_fashion_overview(world: Any) -> dict[str, Any]:
    ensure_world_fashion_state(world)

    rankings: list[dict[str, Any]] = []
    for agent in getattr(world, "agents", []):
        resident = agent.resident
        selected = apply_outfit_for_occasion(world, resident)
        trend_match = _trend_match_score(selected, world.fashion_trend) >= 0.45
        rankings.append(
            {
                "resident_id": resident.id,
                "resident_name": resident.name,
                "style_score": round(float(resident.appearance.style_score), 3),
                "clothing": resident.appearance.clothing,
                "current_outfit": selected.name,
                "accent_color": selected.color,
                "trend_match": trend_match,
                "designed_by_tailor": bool(selected.designed_by),
            }
        )
    rankings.sort(
        key=lambda row: (-row["style_score"], not row["trend_match"], row["resident_name"]),
    )

    purchases = list(world.fashion_purchase_history[-20:])
    category_counter = Counter(entry["category"] for entry in world.fashion_purchase_history)
    color_counter = Counter(entry["color_name"] for entry in world.fashion_purchase_history)
    total_spent = round(sum(float(entry["price"]) for entry in world.fashion_purchase_history), 2)

    return {
        "current_trend": dict(world.fashion_trend),
        "trend_history": list(world.fashion_trend_history[-12:]),
        "rankings": rankings[:10],
        "consumption": {
            "total_purchases": len(world.fashion_purchase_history),
            "total_spent": total_spent,
            "average_spend": round(total_spent / len(world.fashion_purchase_history), 2) if world.fashion_purchase_history else 0.0,
            "top_category": category_counter.most_common(1)[0][0] if category_counter else None,
            "top_color": color_counter.most_common(1)[0][0] if color_counter else None,
            "recent_purchases": purchases,
        },
    }
