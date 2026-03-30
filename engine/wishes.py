"""Resident wishlist system.

Residents generate wishes based on their current state every 50 ticks.
Wishes are auto-checked for fulfillment each tick, and fulfilled wishes
grant a mood boost.
"""
from __future__ import annotations

import random
from typing import Any

from engine.types import RelationType, Wish

WISH_TYPES = ("want_item", "want_friend", "want_job", "want_home_upgrade", "want_travel")

_MAX_WISHES = 5


def generate_wishes(state: Any, resident: Any, rng: random.Random) -> list[Wish]:
    """Generate new wishes based on resident's current needs."""
    existing_types = {w.type for w in resident.wishlist if not w.fulfilled}
    new_wishes: list[Wish] = []

    coins = getattr(resident, "coins", 0) + getattr(resident, "wallet", 0.0)
    friend_count = sum(
        1 for rel in state.world.relationships.values()
        if rel.from_id == resident.id
        and rel.type in (RelationType.friendship, RelationType.love)
        and rel.intensity >= 0.4
    )
    job_title = getattr(getattr(resident, "job", None), "title", "unemployed")
    home_level = 1
    home = state.world.get_building(getattr(resident, "home_building_id", None)) if getattr(resident, "home_building_id", None) else None
    if home:
        home_level = getattr(home, "level", 1)

    # Poor → want_item
    if "want_item" not in existing_types and coins < 50:
        item = rng.choice(["食物", "工具", "书籍", "衣服", "药品"])
        new_wishes.append(Wish(
            type="want_item",
            description=f"想要一份{item}",
            priority=round(0.6 + (50 - min(coins, 50)) / 100, 2),
        ))

    # Lonely → want_friend
    if "want_friend" not in existing_types and friend_count < 2:
        candidates = [a.resident for a in state.world.agents if a.resident.id != resident.id]
        target = rng.choice(candidates) if candidates else None
        new_wishes.append(Wish(
            type="want_friend",
            description=f"想和{target.name if target else '某人'}成为朋友",
            priority=round(0.5 + (2 - min(friend_count, 2)) * 0.2, 2),
            target_id=target.id if target else "",
        ))

    # Unemployed → want_job
    if "want_job" not in existing_types and job_title in ("unemployed", "student"):
        new_wishes.append(Wish(
            type="want_job",
            description="想找到一份工作",
            priority=0.7,
        ))

    # Low-level home → want_home_upgrade
    if "want_home_upgrade" not in existing_types and home and home_level < 3:
        new_wishes.append(Wish(
            type="want_home_upgrade",
            description=f"想把{home.name}装修升级",
            priority=0.4,
            target_id=home.id,
        ))

    # Travel desire
    if "want_travel" not in existing_types:
        zones = getattr(state.world, "zones", [])
        visited = getattr(state, "_zones_visited", {}).get(resident.id, set())
        unvisited = [z for z in zones if z.id not in visited]
        if unvisited:
            zone = rng.choice(unvisited)
            new_wishes.append(Wish(
                type="want_travel",
                description=f"想去{zone.name}看看",
                priority=0.3,
                target_id=zone.id,
            ))

    return new_wishes


def check_wish_fulfillment(state: Any, resident: Any) -> list[int]:
    """Check which wishes are now fulfilled. Returns indices of newly fulfilled wishes."""
    fulfilled_indices: list[int] = []
    current_tick = getattr(state.world, "current_tick", 0)

    for i, wish in enumerate(resident.wishlist):
        if wish.fulfilled:
            continue

        if wish.type == "want_item":
            coins = getattr(resident, "coins", 0) + getattr(resident, "wallet", 0.0)
            if coins >= 80:
                wish.fulfilled = True
                wish.fulfilled_tick = current_tick
                fulfilled_indices.append(i)

        elif wish.type == "want_friend":
            if wish.target_id:
                rel = state.world.get_relationship(resident.id, wish.target_id)
                if rel and rel.type in (RelationType.friendship, RelationType.love) and rel.intensity >= 0.4:
                    wish.fulfilled = True
                    wish.fulfilled_tick = current_tick
                    fulfilled_indices.append(i)
            else:
                friend_count = sum(
                    1 for rel in state.world.relationships.values()
                    if rel.from_id == resident.id
                    and rel.type in (RelationType.friendship, RelationType.love)
                    and rel.intensity >= 0.4
                )
                if friend_count >= 2:
                    wish.fulfilled = True
                    wish.fulfilled_tick = current_tick
                    fulfilled_indices.append(i)

        elif wish.type == "want_job":
            job_title = getattr(getattr(resident, "job", None), "title", "unemployed")
            if job_title not in ("unemployed", "student"):
                wish.fulfilled = True
                wish.fulfilled_tick = current_tick
                fulfilled_indices.append(i)

        elif wish.type == "want_home_upgrade":
            if wish.target_id:
                building = state.world.get_building(wish.target_id)
                if building and getattr(building, "level", 1) >= 2:
                    wish.fulfilled = True
                    wish.fulfilled_tick = current_tick
                    fulfilled_indices.append(i)

        elif wish.type == "want_travel":
            if wish.target_id:
                visited = getattr(state, "_zones_visited", {}).get(resident.id, set())
                if wish.target_id in visited:
                    wish.fulfilled = True
                    wish.fulfilled_tick = current_tick
                    fulfilled_indices.append(i)

    return fulfilled_indices


def process_wishes(state: Any) -> None:
    """Main tick handler: generate new wishes and check fulfillment."""
    current_tick = getattr(state.world, "current_tick", 0)
    rng = getattr(state.world, "rng", random)

    for agent in state.world.agents:
        resident = agent.resident
        if not hasattr(resident, "wishlist"):
            resident.wishlist = []

        # Generate wishes every 50 ticks
        if current_tick > 0 and current_tick % 50 == 0:
            unfulfilled_count = sum(1 for w in resident.wishlist if not w.fulfilled)
            if unfulfilled_count < _MAX_WISHES:
                wish_rng = random.Random(hash(resident.id) + current_tick)
                new_wishes = generate_wishes(state, resident, wish_rng)
                for wish in new_wishes:
                    if sum(1 for w in resident.wishlist if not w.fulfilled) >= _MAX_WISHES:
                        break
                    resident.wishlist.append(wish)
                resident.wishlist = resident.wishlist[-15:]

        # Check fulfillment
        fulfilled = check_wish_fulfillment(state, resident)
        if fulfilled:
            for _ in fulfilled:
                state.world.shift_resident_mood(resident, 2, "wish_fulfilled")


def fulfill_wish_by_god(state: Any, resident_id: str, wish_index: int) -> dict[str, Any] | None:
    """God-mode: manually fulfill a resident's wish."""
    current_tick = getattr(state.world, "current_tick", 0)
    for agent in state.world.agents:
        if agent.resident.id == resident_id:
            wishlist = getattr(agent.resident, "wishlist", [])
            if wish_index < 0 or wish_index >= len(wishlist):
                return None
            wish = wishlist[wish_index]
            if wish.fulfilled:
                return {"already_fulfilled": True, "wish": _serialize_wish(wish, wish_index)}
            wish.fulfilled = True
            wish.fulfilled_tick = current_tick
            state.world.shift_resident_mood(agent.resident, 2, "wish_fulfilled_god")
            return {"fulfilled": True, "wish": _serialize_wish(wish, wish_index)}
    return None


def get_resident_wishes(resident: Any) -> list[dict[str, Any]]:
    """Build the API response for a resident's wish list."""
    wishlist = getattr(resident, "wishlist", [])
    return [_serialize_wish(w, i) for i, w in enumerate(wishlist)]


def _serialize_wish(wish: Wish, index: int) -> dict[str, Any]:
    return {
        "index": index,
        "type": wish.type,
        "description": wish.description,
        "priority": wish.priority,
        "fulfilled": wish.fulfilled,
        "fulfilled_tick": wish.fulfilled_tick if wish.fulfilled else None,
        "target_id": wish.target_id or None,
    }
