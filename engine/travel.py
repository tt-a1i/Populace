"""Travel & exploration system: residents can embark on trips and return with souvenirs and stories."""
from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any

from engine.types import (
    DiaryEntry,
    Event,
    TravelEntry,
)

if TYPE_CHECKING:
    from engine.world import World

# ---------------------------------------------------------------------------
# Destinations
# ---------------------------------------------------------------------------

DESTINATIONS = [
    {"name": "邻镇集市", "type": "neighboring_town", "duration": 8, "souvenirs": ["异国香料", "邻镇丝绸", "手工编织包"]},
    {"name": "云雾山脉", "type": "mountain", "duration": 12, "souvenirs": ["山巅矿石", "鹰羽", "高山草药"]},
    {"name": "碧波海岸", "type": "seaside", "duration": 10, "souvenirs": ["珍珠贝壳", "海盐结晶", "珊瑚碎片"]},
    {"name": "幽暗密林", "type": "forest", "duration": 14, "souvenirs": ["稀有蘑菇", "古树琥珀", "森林地图"]},
]

TRAVEL_STORIES = {
    "neighboring_town": [
        "在邻镇集市上认识了有趣的商人，学到了不少新东西。",
        "邻镇的美食令人难忘，特别是烤饼和果酒。",
        "与邻镇居民交流了小镇的近况，互通了消息。",
    ],
    "mountain": [
        "登上了山顶，云海翻腾，心胸豁然开朗。",
        "在山间发现了一处清泉，沁人心脾。",
        "遇到了一位隐居的老者，听他讲述古老的传说。",
    ],
    "seaside": [
        "海浪拍打着沙滩，让人忘却了所有烦恼。",
        "在海边捡到了一颗漂亮的贝壳，打算送给朋友。",
        "看到了壮观的日落，海面染成了金色。",
    ],
    "forest": [
        "密林深处有一片隐秘的花海，美不胜收。",
        "跟踪了一只稀有的鸟类，画下了它的样子。",
        "在古树下发现了一块刻着文字的石碑。",
    ],
}

# Adventure personality keywords
_ADVENTURE_KW = ("冒险", "好奇", "勇敢", "探索", "adventurous", "curious", "brave")


def _is_adventurous(personality: str) -> bool:
    p = personality.lower()
    return any(k in p for k in _ADVENTURE_KW)


def _should_travel(world: "World", resident: Any, rng: random.Random) -> bool:
    """Check if a resident should embark on a trip this tick."""
    if resident.traveling:
        return False
    if resident.age_stage == "child":
        return False
    if resident.energy < 0.4:
        return False

    # Base probability per tick
    prob = 0.002
    if _is_adventurous(resident.personality):
        prob += 0.005
    # Want_travel wish boosts probability
    if any(w.type == "want_travel" and not w.fulfilled for w in getattr(resident, "wishlist", [])):
        prob += 0.008

    return rng.random() < prob


def _pick_destination(world: "World", rng: random.Random) -> dict:
    """Pick a random travel destination, favoring trade route towns if available."""
    destinations = list(DESTINATIONS)
    # Add external towns from trade routes as destinations
    for town in getattr(world, "external_towns", []):
        destinations.append({
            "name": town.name if hasattr(town, "name") else str(town),
            "type": "neighboring_town",
            "duration": 8,
            "souvenirs": ["异国商品", "友谊信物"],
        })
    return rng.choice(destinations)


def _complete_travel(world: "World", agent: Any, entry: TravelEntry, rng: random.Random) -> Event:
    """Complete a travel, apply effects, and return an event."""
    resident = agent.resident
    resident.traveling = False
    entry.tick_returned = world.current_tick

    # Pick souvenir
    dest_config = next((d for d in DESTINATIONS if d["type"] == entry.destination_type), DESTINATIONS[0])
    souvenir = rng.choice(dest_config["souvenirs"])
    entry.souvenirs = [souvenir]

    # Pick story
    stories = TRAVEL_STORIES.get(entry.destination_type, TRAVEL_STORIES["neighboring_town"])
    story = rng.choice(stories)
    entry.story = story

    # Write diary entry
    diary_content = f"从{entry.destination}旅行归来。{story} 带回了{souvenir}。"
    diary_id = f"travel-diary-{world.current_tick}-{resident.id}"
    resident.diary.append(DiaryEntry(
        id=diary_id,
        content=diary_content,
        date=world.simulation_time(),
        tick=world.current_tick,
        mood_snapshot=resident.mood,
        tags=["travel", entry.destination_type],
        highlight=True,
    ))
    resident.diary = resident.diary[-50:]

    # Skill boosts from travel
    if entry.destination_type == "mountain":
        resident.skills["courage"] = round(min(1.0, resident.skills.get("courage", 0.0) + 0.04), 4)
    elif entry.destination_type == "forest":
        resident.skills["nature"] = round(min(1.0, resident.skills.get("nature", 0.0) + 0.04), 4)
    elif entry.destination_type == "seaside":
        resident.skills["social"] = round(min(1.0, resident.skills.get("social", 0.0) + 0.02), 4)
    elif entry.destination_type == "neighboring_town":
        knowledge = resident.education.knowledge_level
        knowledge["trade"] = round(min(1.0, knowledge.get("trade", 0.0) + 0.03), 4)

    # Mood boost
    world.shift_resident_mood(agent, 2, "travel_return")

    # Fulfill want_travel wishes
    for wish in getattr(resident, "wishlist", []):
        if wish.type == "want_travel" and not wish.fulfilled:
            wish.fulfilled = True
            wish.fulfilled_tick = world.current_tick
            break

    return Event(
        id=f"travel-return-{world.current_tick}-{resident.id}",
        description=f"{resident.name} 从{entry.destination}旅行归来，带回了{souvenir}。",
        timestamp=world.simulation_time(),
        source="travel",
    )


# ---------------------------------------------------------------------------
# Main tick processing
# ---------------------------------------------------------------------------

def process_travel_tick(
    world: "World",
    rng: random.Random | None = None,
) -> list[Event]:
    """Process travel events for one tick. Called periodically from simulation loop."""
    rng = rng or random
    events: list[Event] = []

    for agent in world.agents:
        resident = agent.resident

        # Check if resident is returning from travel
        if resident.traveling and resident.travel_log:
            current_trip = resident.travel_log[-1]
            if current_trip.tick_returned == 0:
                travel_duration = world.current_tick - current_trip.tick_departed
                dest_config = next((d for d in DESTINATIONS if d["type"] == current_trip.destination_type), DESTINATIONS[0])
                if travel_duration >= dest_config["duration"]:
                    event = _complete_travel(world, agent, current_trip, rng)
                    events.append(event)
                continue

        # Check if resident should depart on a new trip
        if _should_travel(world, resident, rng):
            dest = _pick_destination(world, rng)
            entry = TravelEntry(
                destination=dest["name"],
                destination_type=dest["type"],
                tick_departed=world.current_tick,
            )
            resident.travel_log.append(entry)
            resident.travel_log = resident.travel_log[-20:]
            resident.traveling = True

            events.append(Event(
                id=f"travel-depart-{world.current_tick}-{resident.id}",
                description=f"{resident.name} 出发前往{dest['name']}旅行。",
                timestamp=world.simulation_time(),
                source="travel",
            ))

    return events


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def get_resident_travels(world: "World", resident_id: str) -> list[dict]:
    """Return travel log for a resident."""
    agent = world.get_agent(resident_id)
    if agent is None:
        return []
    return [
        {
            "destination": entry.destination,
            "destination_type": entry.destination_type,
            "tick_departed": entry.tick_departed,
            "tick_returned": entry.tick_returned,
            "souvenirs": list(entry.souvenirs),
            "story": entry.story,
        }
        for entry in agent.resident.travel_log
    ]
