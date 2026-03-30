"""Resident jealousy and rivalry system.

Residents develop envy based on wealth, reputation, romance, and job
performance comparisons. Jealousy triggers negative social behaviors
and decays over time or through positive interactions.
"""
from __future__ import annotations

from typing import Any

from engine.types import JealousyEntry, RelationType


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


# ---------------------------------------------------------------------------
# Jealousy detection
# ---------------------------------------------------------------------------

def _wealth_of(resident: Any) -> float:
    return float(getattr(resident, "coins", 0)) + float(getattr(resident, "wallet", 0.0))


def _find_jealousy_triggers(world: Any, resident: Any) -> list[JealousyEntry]:
    """Scan other residents and return new jealousy entries."""
    entries: list[JealousyEntry] = []
    rid = resident.id
    my_wealth = _wealth_of(resident)
    my_rep = float(getattr(resident, "reputation", 0.0))
    my_job = getattr(getattr(resident, "job", None), "title", "unemployed")
    existing_targets = {j.target_id for j in getattr(resident, "jealousy_targets", [])}

    for agent in world.agents:
        other = agent.resident
        if other.id == rid:
            continue

        # Wealth jealousy
        other_wealth = _wealth_of(other)
        if other_wealth > my_wealth * 2 and other.id not in existing_targets:
            intensity = _clamp((other_wealth - my_wealth) / max(my_wealth, 100) * 0.3)
            entries.append(JealousyEntry(target_id=other.id, reason="wealth", intensity=round(intensity, 3)))

        # Reputation jealousy
        other_rep = float(getattr(other, "reputation", 0.0))
        if other_rep > my_rep + 0.3 and other.id not in existing_targets:
            intensity = _clamp((other_rep - my_rep) * 0.5)
            entries.append(JealousyEntry(target_id=other.id, reason="reputation", intensity=round(intensity, 3)))

        # Job competition (same occupation)
        other_job = getattr(getattr(other, "job", None), "title", "unemployed")
        if my_job != "unemployed" and my_job == other_job and other.id not in existing_targets:
            other_salary = float(getattr(getattr(other, "job", None), "salary", 0.0))
            my_salary = float(getattr(getattr(resident, "job", None), "salary", 0.0))
            if other_salary > my_salary * 1.3:
                intensity = _clamp((other_salary - my_salary) / max(my_salary, 1) * 0.2)
                entries.append(JealousyEntry(target_id=other.id, reason="job_competition", intensity=round(intensity, 3)))

        # Romance rival — someone flirting with partner
        partner_id = getattr(getattr(resident, "family", None), "partner_id", None)
        if partner_id and other.id != partner_id and other.id not in existing_targets:
            rel = world.get_relationship(other.id, partner_id)
            if rel and rel.type == RelationType.love and rel.intensity >= 0.4:
                entries.append(JealousyEntry(target_id=other.id, reason="romance_rival", intensity=round(_clamp(rel.intensity * 0.6), 3)))

    return entries


# ---------------------------------------------------------------------------
# Jealousy effects
# ---------------------------------------------------------------------------

def _apply_jealousy_effects(state: Any, resident: Any) -> None:
    """Apply negative effects from active jealousy entries."""
    world = state.world
    for entry in getattr(resident, "jealousy_targets", []):
        if entry.intensity < 0.3:
            continue

        # Reduce relationship with target
        rel = world.get_relationship(resident.id, entry.target_id)
        if rel and rel.intensity > 0.1:
            rel.intensity = max(0.0, rel.intensity - 0.01 * entry.intensity)
            world.set_relationship(rel)

        # Post negative bulletin (low probability, high jealousy only)
        if entry.intensity >= 0.6 and hasattr(state, "_bulletin_posts"):
            current_tick = getattr(world, "current_tick", 0)
            post_key = f"jealousy_{resident.id}_{entry.target_id}"
            last_tick = getattr(state, "_bulletin_last_post_tick", {}).get(post_key, -1000)
            interval = max(20, getattr(world.config, "tick_per_day", 48) // 2)
            if current_tick - last_tick >= interval:
                target_name = ""
                for a in world.agents:
                    if a.resident.id == entry.target_id:
                        target_name = a.resident.name
                        break
                if target_name:
                    state._bulletin_posts.insert(0, {
                        "id": f"jealousy_{resident.id}_{current_tick}",
                        "author_id": resident.id,
                        "author_name": resident.name,
                        "content": f"{resident.name}对{target_name}的{_reason_label(entry.reason)}感到不满",
                        "tick": current_tick,
                        "likes": [],
                        "category": "gossip",
                        "topic": "jealousy",
                        "subject_id": entry.target_id,
                        "tone": "negative",
                    })
                    state._bulletin_posts = state._bulletin_posts[:120]
                    state._bulletin_last_post_tick = getattr(state, "_bulletin_last_post_tick", {})
                    state._bulletin_last_post_tick[post_key] = current_tick

                    # Target reputation down
                    for a in world.agents:
                        if a.resident.id == entry.target_id:
                            a.resident.reputation = max(-1.0, a.resident.reputation - 0.02 * entry.intensity)
                            break


def _reason_label(reason: str) -> str:
    labels = {
        "wealth": "财富差距",
        "reputation": "声望差距",
        "job_competition": "职场竞争",
        "romance_rival": "情感威胁",
    }
    return labels.get(reason, reason)


# ---------------------------------------------------------------------------
# Decay & resolution
# ---------------------------------------------------------------------------

def _decay_jealousy(resident: Any) -> None:
    """Natural decay of jealousy over time."""
    targets = getattr(resident, "jealousy_targets", [])
    for entry in targets:
        entry.intensity = _clamp(entry.intensity - 0.02)
    resident.jealousy_targets = [e for e in targets if e.intensity > 0.01]


def resolve_jealousy_from_interaction(resident: Any, target_id: str, amount: float = 0.15) -> bool:
    """Reduce jealousy toward a target (e.g., after gift/comfort)."""
    for entry in getattr(resident, "jealousy_targets", []):
        if entry.target_id == target_id:
            entry.intensity = _clamp(entry.intensity - amount)
            if entry.intensity <= 0.01:
                resident.jealousy_targets.remove(entry)
            return True
    return False


# ---------------------------------------------------------------------------
# Main tick handler
# ---------------------------------------------------------------------------

_MAX_JEALOUSY_TARGETS = 5


def process_jealousy(state: Any) -> None:
    """Run jealousy system for one tick."""
    world = state.world
    current_tick = getattr(world, "current_tick", 0)

    for agent in world.agents:
        resident = agent.resident
        if not hasattr(resident, "jealousy_targets"):
            resident.jealousy_targets = []

        # Generate new jealousy every 30 ticks
        if current_tick > 0 and current_tick % 30 == 0:
            active_count = len(resident.jealousy_targets)
            if active_count < _MAX_JEALOUSY_TARGETS:
                new_entries = _find_jealousy_triggers(world, resident)
                for entry in new_entries:
                    if len(resident.jealousy_targets) >= _MAX_JEALOUSY_TARGETS:
                        break
                    if entry.target_id not in {e.target_id for e in resident.jealousy_targets}:
                        resident.jealousy_targets.append(entry)

        # Apply effects
        _apply_jealousy_effects(state, resident)

        # Decay
        _decay_jealousy(resident)


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def get_rivalries_overview(state: Any) -> dict[str, Any]:
    """Build the /api/world/rivalries response."""
    world = state.world
    rivalries: list[dict[str, Any]] = []
    hotspots: dict[str, float] = {}  # target_id → total jealousy received

    for agent in world.agents:
        resident = agent.resident
        for entry in getattr(resident, "jealousy_targets", []):
            target_name = ""
            for a in world.agents:
                if a.resident.id == entry.target_id:
                    target_name = a.resident.name
                    break
            rivalries.append({
                "from_id": resident.id,
                "from_name": resident.name,
                "target_id": entry.target_id,
                "target_name": target_name,
                "reason": entry.reason,
                "reason_label": _reason_label(entry.reason),
                "intensity": round(entry.intensity, 3),
            })
            hotspots[entry.target_id] = hotspots.get(entry.target_id, 0.0) + entry.intensity

    hotspot_list = sorted(
        [
            {"resident_id": rid, "resident_name": next((a.resident.name for a in world.agents if a.resident.id == rid), rid), "total_jealousy": round(total, 3)}
            for rid, total in hotspots.items()
        ],
        key=lambda x: x["total_jealousy"],
        reverse=True,
    )[:10]

    return {
        "rivalries": rivalries,
        "hotspots": hotspot_list,
        "total_rivalries": len(rivalries),
        "avg_intensity": round(sum(r["intensity"] for r in rivalries) / max(len(rivalries), 1), 3),
    }
