"""World state manager for the Populace simulation engine.

Owns the list of agents, buildings, and the tile grid (§10).
The tick() method is the entry point called by the backend simulation
loop each time step (§8).
"""
from __future__ import annotations

import math
import random
from typing import Dict, List, Optional, Tuple

from engine.agent import Agent
from engine.pathfinding import PathCache
from engine.types import (
    Building,
    CrimeEvent,
    Course,
    CourseHistoryEntry,
    Education,
    EnergyUpdate,
    Event,
    EventUpdate,
    Item,
    MoodEntry,
    MovementUpdate,
    Pet,
    ReputationEntry,
    Relationship,
    Resident,
    Season,
    TickState,
    WeatherType,
    WorldConfig,
    Zone,
    ZoneAtmosphere,
    ZoneBounds,
)

_EXTROVERT_KEYWORDS = ("外向", "开朗", "活泼", "健谈", "社牛", "extrovert", "outgoing")
_INTROVERT_KEYWORDS = ("内向", "安静", "害羞", "社恐", "introvert", "shy")
_MOOD_SCORE = {
    "ecstatic": 1.0,
    "excited": 0.8,
    "happy": 1.0,
    "content": 0.3,
    "calm": 0.1,
    "neutral": 0.0,
    "tired": -0.2,
    "sad": -1.0,
    "angry": -0.9,
    "fearful": -0.7,
}
_MOOD_LADDER = ["sad", "fearful", "angry", "tired", "neutral", "calm", "content", "happy", "excited", "ecstatic"]
_BUILDING_WORK_MAP = {
    "cafe": {
        "occupation": "barista",
        "base_income": 3,
        "skill": "cooking",
        "item_name": "coffee",
        "item_value": 12,
    },
    "school": {
        "occupation": "teacher",
        "base_income": 4,
        "skill": "teaching",
        "item_name": "book",
        "item_value": 7,
    },
    "shop": {
        "occupation": "shopkeeper",
        "base_income": 5,
        "skill": "trading",
        "item_name": "goods",
        "item_value": 6,
    },
    "dock": {"occupation": "fisher", "base_income": 4, "skill": "fishing"},
}
_EDUCATION_SUBJECTS = {
    "cooking": "烹饪课",
    "farming": "农务课",
    "crafting": "手工课",
    "social": "社交课",
    "art": "艺术课",
}
_PET_EMOJI_NAME = {
    "cat": "小咪",
    "dog": "旺财",
    "bird": "啾啾",
    "rabbit": "团团",
}
_PET_SPECIES = ("cat", "dog", "bird", "rabbit")
_PET_FRIENDLY_KW = ("友善", "善良", "热心", "温柔", "开朗", "friendly", "kind")


class World:
    """Central state container for a running simulation.

    Attributes:
        config:    Tunable simulation parameters.
        agents:    All active :class:`~engine.agent.Agent` instances.
        buildings: All :class:`~engine.types.Building` objects on the map.
        grid:      2-D boolean tile grid; ``True`` = walkable (§10).
        current_tick: Monotonically increasing tick counter.
    """

    def __init__(self, config: Optional[WorldConfig] = None) -> None:
        self.config: WorldConfig = config or WorldConfig()
        self.agents: List[Agent] = []
        self.buildings: List[Building] = []
        self.zones: List[Zone] = self._default_zones()

        # Initialise fully-walkable grid; buildings mark their tiles as blocked
        # when placed via add_building() (future implementation).
        self.grid: List[List[bool]] = [
            [True] * self.config.map_width_tiles
            for _ in range(self.config.map_height_tiles)
        ]
        self.current_tick: int = 0
        self.pending_events: List[Event] = []
        self.relationships: Dict[Tuple[str, str], Relationship] = {}
        self.weather: WeatherType = WeatherType.sunny
        self.season: Season = Season.spring
        self.weather_forecast: list[str] = []
        self.active_festival: str | None = None
        self.active_festival_dialogue_hint: str | None = None
        self.active_festival_ticks_remaining: int = 0
        self.crime_log: List[CrimeEvent] = []
        self.flagged_residents: set[str] = set()
        self.pets: List[Pet] = []
        self.stray_pets: List[Pet] = []
        self.path_cache: PathCache = PathCache()
        self.grid_chunk_size: int = max(1, self.config.interaction_distance)
        self.grid_index: Dict[Tuple[int, int], List[Agent]] = {}
        self._grid_index_dirty = True

    def _default_zones(self) -> List[Zone]:
        width = self.config.map_width_tiles
        height = self.config.map_height_tiles
        half_width = max(1, width // 2)
        half_height = max(1, height // 2)
        quarter_width = max(1, width // 4)
        quarter_height = max(1, height // 4)
        return [
            Zone(
                id="zone-commercial",
                name="商业区",
                type="commercial",
                bounds=ZoneBounds(x=0, y=0, width=half_width, height=half_height),
                atmosphere=ZoneAtmosphere(noise=0.84, safety=0.55, beauty=0.54),
            ),
            Zone(
                id="zone-residential",
                name="住宅区",
                type="residential",
                bounds=ZoneBounds(
                    x=quarter_width,
                    y=quarter_height,
                    width=half_width,
                    height=height - quarter_height,
                ),
                atmosphere=ZoneAtmosphere(noise=0.28, safety=0.82, beauty=0.66),
            ),
            Zone(
                id="zone-education",
                name="教育区",
                type="education",
                bounds=ZoneBounds(x=half_width, y=0, width=width - half_width, height=half_height),
                atmosphere=ZoneAtmosphere(noise=0.34, safety=0.86, beauty=0.7),
            ),
            Zone(
                id="zone-leisure",
                name="休闲区",
                type="leisure",
                bounds=ZoneBounds(x=0, y=half_height, width=half_width, height=height - half_height),
                atmosphere=ZoneAtmosphere(noise=0.46, safety=0.74, beauty=0.88),
            ),
        ]

    # ------------------------------------------------------------------
    # Agent management
    # ------------------------------------------------------------------

    def add_agent(self, agent: Agent) -> None:
        """Add an agent to the world.

        Synchronises the agent's MemoryStream config with this world's
        config so that thresholds (e.g. reflection_threshold) are
        consistent across the simulation.
        """
        agent.memory_stream._config = self.config
        if not agent.resident.mood_history:
            agent.resident.mood_history.append(
                MoodEntry(tick=self.current_tick, mood=agent.resident.mood, cause="initial")
            )
        self.ensure_resident_education(agent.resident)
        self._ensure_resident_safety(agent.resident)
        self._ensure_resident_reputation(agent.resident)
        self._ensure_resident_memories(agent.resident)
        self._rebuild_pet_registry()
        self.agents.append(agent)
        self.mark_grid_index_dirty()

    def _rebuild_pet_registry(self) -> None:
        owned_pets: List[Pet] = []
        for agent in self.agents:
            owned_pets.extend(agent.resident.pets)
        self.pets = [*owned_pets, *self.stray_pets]

    def assign_initial_pets(self) -> None:
        for agent in self.agents:
            resident = agent.resident
            if resident.pets:
                continue
            if sum(ord(char) for char in resident.id) % 10 >= 3:
                continue
            species = _PET_SPECIES[sum(ord(char) for char in resident.name) % len(_PET_SPECIES)]
            resident.pets.append(
                Pet(
                    id=f"pet_{resident.id}",
                    name=_PET_EMOJI_NAME[species],
                    species=species,
                    owner_id=resident.id,
                    mood="calm",
                    hunger=0.8,
                    location=resident.location,
                    x=resident.x,
                    y=resident.y,
                )
            )

        if not self.stray_pets and self.agents:
            stray_species = _PET_SPECIES[len(self.agents) % len(_PET_SPECIES)]
            self.stray_pets.append(
                Pet(
                    id="stray_pet_1",
                    name=f"流浪{_PET_EMOJI_NAME[stray_species]}",
                    species=stray_species,
                    owner_id=None,
                    mood="curious",
                    hunger=0.55,
                    x=max(1, self.config.map_width_tiles // 2),
                    y=max(1, self.config.map_height_tiles // 2),
                )
            )
        self._rebuild_pet_registry()

    def list_pets(self) -> List[Pet]:
        self._rebuild_pet_registry()
        return list(self.pets)

    def list_resident_pets(self, resident_id: str) -> List[Pet]:
        agent = self.get_agent(resident_id)
        if agent is None:
            return []
        return list(agent.resident.pets)

    def has_dog(self, resident: Resident) -> bool:
        return any(pet.species == "dog" for pet in resident.pets)

    def _friendly_resident_score(self, resident: Resident) -> float:
        text = resident.personality.lower()
        return 0.7 if any(keyword in text for keyword in _PET_FRIENDLY_KW) else self._extroversion(resident.personality)

    def _sync_pet_to_owner(self, pet: Pet, owner: Agent) -> None:
        pet.location = owner.resident.location
        if owner.resident.location is not None:
            building = self.get_building(owner.resident.location)
            if building is not None:
                pet.x, pet.y = building.position
                return
        offset = 1 if pet.species in {"dog", "rabbit"} else 0
        pet.x = max(0, min(self.config.map_width_tiles - 1, owner.resident.x + offset))
        pet.y = max(0, min(self.config.map_height_tiles - 1, owner.resident.y + (0 if offset == 0 else 1)))

    def update_pets(self) -> List[EventUpdate]:
        events: List[EventUpdate] = []
        for pet in self.list_pets():
            pet.hunger = round(max(0.0, min(1.0, pet.hunger - 0.03)), 3)

            if pet.owner_id:
                owner = self.get_agent(pet.owner_id)
                if owner is None:
                    pet.owner_id = None
                    self.stray_pets.append(pet)
                    continue

                self._sync_pet_to_owner(pet, owner)
                if pet.location == owner.resident.location or abs(pet.x - owner.resident.x) + abs(pet.y - owner.resident.y) <= 1:
                    if random.random() < 0.05:
                        self.shift_resident_mood(owner, 1, "pet")
                    if pet.hunger < 0.4 and random.random() < 0.35:
                        pet.hunger = round(min(1.0, pet.hunger + 0.5), 3)
                        pet.mood = "content"
                        events.append(EventUpdate(description=f"{owner.resident.name}喂食了宠物{pet.name}。"))
                    elif random.random() < 0.18:
                        pet.mood = "happy"
                        self.shift_resident_mood(owner, 1, "pet")
                        events.append(EventUpdate(description=f"{owner.resident.name}和宠物{pet.name}玩耍了一会儿。"))
                if pet.hunger < 0.25:
                    sound = "汪汪" if pet.species == "dog" else "喵呜" if pet.species == "cat" else "啾啾"
                    events.append(EventUpdate(description=f"{pet.name}{sound}叫唤，似乎饿了。"))
                continue

            step_x = random.choice([-1, 0, 1])
            step_y = random.choice([-1, 0, 1])
            pet.x = max(0, min(self.config.map_width_tiles - 1, pet.x + step_x))
            pet.y = max(0, min(self.config.map_height_tiles - 1, pet.y + step_y))
            pet.location = None

            for agent in self.agents:
                resident = agent.resident
                if self._friendly_resident_score(resident) < 0.65:
                    continue
                if abs(resident.x - pet.x) + abs(resident.y - pet.y) > 1:
                    continue
                if random.random() >= 0.18:
                    continue
                pet.owner_id = resident.id
                resident.pets.append(pet)
                self.stray_pets = [item for item in self.stray_pets if item.id != pet.id]
                self._sync_pet_to_owner(pet, agent)
                events.append(EventUpdate(description=f"{resident.name}收养了流浪{pet.name}。"))
                break

        self._rebuild_pet_registry()
        return events

    def get_agent(self, resident_id: str) -> Optional[Agent]:
        for agent in self.agents:
            if agent.resident.id == resident_id:
                return agent
        return None

    def are_family(self, resident_a: Resident | str, resident_b: Resident | str) -> bool:
        resident_a_obj = resident_a if isinstance(resident_a, Resident) else self.get_agent(resident_a).resident if self.get_agent(resident_a) else None
        resident_b_obj = resident_b if isinstance(resident_b, Resident) else self.get_agent(resident_b).resident if self.get_agent(resident_b) else None
        if resident_a_obj is None or resident_b_obj is None:
            return False
        family_a = resident_a_obj.family
        family_b = resident_b_obj.family
        return bool(family_a.family_name and family_a.family_name == family_b.family_name)

    def get_family_members(self, resident_or_family: Resident | str) -> List[Resident]:
        if isinstance(resident_or_family, Resident):
            family_name = resident_or_family.family.family_name
        else:
            family_name = resident_or_family
            agent = self.get_agent(resident_or_family)
            if agent is not None:
                family_name = agent.resident.family.family_name
        if not family_name:
            return []
        return [agent.resident for agent in self.agents if agent.resident.family.family_name == family_name]

    def list_families(self) -> List[dict]:
        families: Dict[str, List[Resident]] = {}
        for agent in self.agents:
            family_name = agent.resident.family.family_name
            if not family_name:
                continue
            families.setdefault(family_name, []).append(agent.resident)

        payload: List[dict] = []
        for family_name, residents in sorted(families.items()):
            payload.append({
                "family_name": family_name,
                "member_count": len(residents),
                "average_mood": round(sum(self.mood_score(resident.mood) for resident in residents) / max(1, len(residents)), 3),
                "members": [
                    {
                        "id": resident.id,
                        "name": resident.name,
                        "age_days": resident.age_days,
                        "partner_id": resident.family.partner_id,
                        "children_ids": list(resident.family.children_ids),
                    }
                    for resident in sorted(residents, key=lambda item: (-item.age_days, item.name))
                ],
            })
        return payload

    def mood_score(self, mood: str | None) -> float:
        if not mood:
            return 0.0
        return _MOOD_SCORE.get(mood.strip().lower(), 0.0)

    def set_resident_mood(self, agent_or_resident: Agent | Resident, mood: str, cause: str) -> bool:
        resident = agent_or_resident.resident if isinstance(agent_or_resident, Agent) else agent_or_resident
        next_mood = (mood or "neutral").strip().lower()
        if resident.mood == next_mood:
            return False
        resident.mood = next_mood
        resident.mood_history.append(MoodEntry(tick=self.current_tick, mood=next_mood, cause=cause))
        resident.mood_history = resident.mood_history[-200:]
        return True

    def shift_resident_mood(self, agent_or_resident: Agent | Resident, steps: int, cause: str) -> bool:
        resident = agent_or_resident.resident if isinstance(agent_or_resident, Agent) else agent_or_resident
        current_rank = _MOOD_LADDER.index(resident.mood) if resident.mood in _MOOD_LADDER else 4
        next_rank = max(0, min(len(_MOOD_LADDER) - 1, current_rank + steps))
        return self.set_resident_mood(resident, _MOOD_LADDER[next_rank], cause)

    def update_mental_state(self, resident: Resident) -> None:
        if self.mood_score(resident.mood) < -0.3:
            resident.low_mood_ticks += 1
        else:
            resident.low_mood_ticks = 0
            if resident.mental_state == "depressed":
                resident.mental_state = "stable"
        if resident.low_mood_ticks >= 20:
            resident.mental_state = "depressed"

    def _ensure_resident_safety(self, resident: Resident) -> None:
        resident.safety_feeling = min(1.0, max(0.0, float(getattr(resident, "safety_feeling", 1.0))))
        resident.flagged_for_crime = bool(getattr(resident, "flagged_for_crime", False))

    def _ensure_resident_reputation(self, resident: Resident) -> None:
        resident.reputation = max(-1.0, min(1.0, float(getattr(resident, "reputation", 0.0))))
        resident.reputation_history = list(getattr(resident, "reputation_history", []))

    def _ensure_resident_memories(self, resident: Resident) -> None:
        resident.memories = list(getattr(resident, "memories", []))

    def remember_resident_memory(
        self,
        resident: Resident,
        *,
        memory_type: str,
        content: str,
        emotional_weight: float,
        related_resident_ids: Optional[List[str]] = None,
    ) -> Memory:
        self._ensure_resident_memories(resident)
        related_ids = sorted(set(related_resident_ids or []))
        memory = Memory(
            id=f"memoir-{resident.id}-{self.current_tick}-{len(resident.memories)}",
            content=content,
            timestamp=self.simulation_time(),
            importance=round(min(1.0, max(0.1, abs(emotional_weight))), 3),
            emotion="happy" if emotional_weight > 0 else "sad" if emotional_weight < 0 else "neutral",
            tick=self.current_tick,
            type=memory_type,
            emotional_weight=round(emotional_weight, 3),
            related_resident_ids=related_ids,
            source="memoir",
        )
        resident.memories.append(memory)
        resident.memories = resident.memories[-120:]
        return memory

    def get_shared_memories(self, resident_a: Resident, resident_b: Resident) -> List[Memory]:
        self._ensure_resident_memories(resident_a)
        return [
            memory
            for memory in resident_a.memories
            if resident_b.id in memory.related_resident_ids
        ]

    def get_shared_memory_prompt(self, resident_a: Resident, resident_b: Resident) -> str:
        shared = self.get_shared_memories(resident_a, resident_b)
        if not shared:
            return ""
        memory = max(shared, key=lambda item: (abs(item.emotional_weight), item.tick))
        return f"你们还记得{memory.content}"

    def decay_resident_memories(self) -> None:
        for agent in self.agents:
            resident = agent.resident
            self._ensure_resident_memories(resident)
            for memory in resident.memories:
                if memory.emotional_weight < 0:
                    memory.emotional_weight = round(memory.emotional_weight * 0.9, 3)

    def recall_comforting_memory(self, agent: Agent) -> Optional[Memory]:
        resident = agent.resident
        self._ensure_resident_memories(resident)
        positive_memories = [memory for memory in resident.memories if memory.emotional_weight > 0.25]
        if not positive_memories:
            return None
        memory = max(positive_memories, key=lambda item: (item.emotional_weight, item.tick))
        self.shift_resident_mood(resident, 1, "memory")
        return memory

    def adjust_resident_reputation(self, resident_id: str, delta: float, source: str) -> float:
        agent = self.get_agent(resident_id)
        if agent is None:
            return 0.0
        resident = agent.resident
        self._ensure_resident_reputation(resident)
        before = resident.reputation
        after = max(-1.0, min(1.0, before + delta))
        resident.reputation = after
        resident.reputation_history.append(
            ReputationEntry(
                tick=self.current_tick,
                source=source,
                delta=delta,
                before=before,
                after=after,
            )
        )
        resident.reputation_history = resident.reputation_history[-100:]
        return after

    def is_town_celebrity(self, resident: Resident) -> bool:
        self._ensure_resident_reputation(resident)
        return resident.reputation > 0.8

    def get_reputation_profile(self, resident_id: str) -> dict | None:
        agent = self.get_agent(resident_id)
        if agent is None:
            return None
        resident = agent.resident
        self._ensure_resident_reputation(resident)
        return {
            "resident_id": resident.id,
            "resident_name": resident.name,
            "reputation": round(resident.reputation, 3),
            "title": "镇上名人" if self.is_town_celebrity(resident) else "",
            "history": [
                {
                    "tick": entry.tick,
                    "source": entry.source,
                    "delta": round(entry.delta, 3),
                    "before": round(entry.before, 3),
                    "after": round(entry.after, 3),
                }
                for entry in resident.reputation_history[-20:]
            ],
        }

    def get_reputation_rankings(self) -> List[dict]:
        rows: List[dict] = []
        for agent in self.agents:
            resident = agent.resident
            self._ensure_resident_reputation(resident)
            rows.append(
                {
                    "resident_id": resident.id,
                    "resident_name": resident.name,
                    "reputation": round(resident.reputation, 3),
                    "title": "镇上名人" if self.is_town_celebrity(resident) else "",
                    "recent_events": [entry.source for entry in resident.reputation_history[-3:]],
                }
            )
        return sorted(rows, key=lambda item: (-item["reputation"], item["resident_name"]))

    def remove_agent(self, agent_id: str) -> None:
        """Remove an agent from the world by its resident id."""
        self.agents = [a for a in self.agents if a.resident.id != agent_id]
        stale_keys = [key for key in self.relationships if agent_id in key]
        for key in stale_keys:
            del self.relationships[key]
        self.mark_grid_index_dirty()

    def get_relationship(self, from_id: str, to_id: str) -> Optional[Relationship]:
        """Return the directed relationship edge from one resident to another."""
        return self.relationships.get((from_id, to_id))

    def set_relationship(self, relationship: Relationship) -> None:
        """Persist or replace a directed relationship edge."""
        self.relationships[(relationship.from_id, relationship.to_id)] = relationship

    def remove_relationship(self, from_id: str, to_id: str) -> None:
        """Delete a directed relationship edge if it exists."""
        self.relationships.pop((from_id, to_id), None)

    def add_inventory_item(
        self,
        resident: Resident,
        item_name: str,
        quantity: int = 1,
        value: int = 0,
    ) -> None:
        """Merge produced or traded items into the resident inventory."""
        if quantity <= 0:
            return

        for item in resident.inventory:
            if item.name == item_name:
                item.quantity += quantity
                item.value = max(item.value, value)
                return

        resident.inventory.append(Item(name=item_name, quantity=quantity, value=value))

    def mark_grid_index_dirty(self) -> None:
        """Mark the nearby-agent spatial index for rebuild before next query."""
        self._grid_index_dirty = True

    def rebuild_grid_index(self) -> None:
        """Rebuild the spatial bucket index for agents currently on the map."""
        chunk_size = max(1, self.config.interaction_distance)
        if chunk_size != self.grid_chunk_size:
            self.grid_chunk_size = chunk_size

        next_index: Dict[Tuple[int, int], List[Agent]] = {}
        for agent in self.agents:
            if agent.resident.location is not None:
                continue

            bucket = self._bucket_key(agent.resident.x, agent.resident.y)
            next_index.setdefault(bucket, []).append(agent)

        self.grid_index = next_index
        self._grid_index_dirty = False

    def get_nearby_agents(self, x: int, y: int, radius: Optional[int] = None) -> List[Agent]:
        """Return agents within Manhattan distance of tile (x, y).

        Args:
            x: Tile x-coordinate of the origin.
            y: Tile y-coordinate of the origin.
            radius: Search radius in tiles; defaults to
                ``WorldConfig.interaction_distance``.

        Returns:
            Agents whose tile position is within *radius* of (x, y),
            including agents at the exact origin tile.  Callers that
            need to exclude "self" should filter by identity.
        """
        if radius is None:
            radius = self.config.interaction_distance
        if self._grid_index_dirty:
            self.rebuild_grid_index()

        bucket_span = max(1, math.ceil(radius / self.grid_chunk_size))
        origin_bucket_x, origin_bucket_y = self._bucket_key(x, y)
        nearby: List[Agent] = []

        for bucket_x in range(origin_bucket_x - bucket_span, origin_bucket_x + bucket_span + 1):
            for bucket_y in range(origin_bucket_y - bucket_span, origin_bucket_y + bucket_span + 1):
                for agent in self.grid_index.get((bucket_x, bucket_y), []):
                    distance = abs(agent.resident.x - x) + abs(agent.resident.y - y)
                    if 0 <= distance <= radius:
                        nearby.append(agent)

        return nearby

    def get_social_candidates(self, agent: Agent) -> List[Agent]:
        """Return agents that can socially interact with *agent* this tick."""
        if agent.resident.location is not None:
            return [
                other
                for other in self.get_occupants(agent.resident.location)
                if other is not agent
            ]

        return [other for other in self.get_nearby_agents(agent.resident.x, agent.resident.y) if other is not agent]

    # ------------------------------------------------------------------
    # Building management
    # ------------------------------------------------------------------

    def add_building(self, building: Building) -> None:
        """Register a building in the world."""
        self.buildings.append(building)
        if building.type == "school":
            for agent in self.agents:
                self.ensure_resident_education(agent.resident)

    def get_school_buildings(self) -> List[Building]:
        return [building for building in self.buildings if building.type == "school"]

    def has_school_building(self) -> bool:
        return bool(self.get_school_buildings())

    def available_courses(self) -> List[Course]:
        schools = self.get_school_buildings()
        school_id = schools[0].id if schools else None
        return [
            Course(subject=subject, name=name, building_id=school_id)
            for subject, name in _EDUCATION_SUBJECTS.items()
        ]

    def ensure_resident_education(self, resident: Resident) -> None:
        if not self.has_school_building():
            return

        education = resident.education if isinstance(resident.education, Education) else Education()
        if not education.knowledge_level:
            education.knowledge_level = {subject: 0.0 for subject in _EDUCATION_SUBJECTS}
        else:
            for subject in _EDUCATION_SUBJECTS:
                education.knowledge_level.setdefault(subject, 0.0)

        if not education.courses:
            subjects = list(_EDUCATION_SUBJECTS)
            checksum = sum(ord(char) for char in resident.id)
            primary_subject = subjects[checksum % len(subjects)]
            school_id = self.get_school_buildings()[0].id
            education.courses = [
                Course(
                    subject=primary_subject,
                    name=_EDUCATION_SUBJECTS[primary_subject],
                    building_id=school_id,
                    enrolled_tick=self.current_tick,
                )
            ]

        resident.education = education

    def get_current_course(self, resident: Resident) -> Optional[Course]:
        self.ensure_resident_education(resident)
        courses = resident.education.courses
        if not courses:
            return None
        index = (self.current_tick // max(1, self.config.tick_per_day // 2)) % len(courses)
        return courses[index]

    def teach_course(self, agent: Agent) -> Optional[Course]:
        resident = agent.resident
        current_course = self.get_current_course(resident)
        if current_course is None:
            return None

        already_applied: bool = getattr(agent, "_class_applied_this_stay", False)
        if already_applied:
            return current_course

        education = resident.education
        current_level = float(education.knowledge_level.get(current_course.subject, 0.0))
        education.knowledge_level[current_course.subject] = round(min(1.0, current_level + 0.05), 4)
        education.course_history.append(
            CourseHistoryEntry(
                tick=self.current_tick,
                subject=current_course.subject,
                course_name=current_course.name,
            )
        )
        education.course_history = education.course_history[-20:]
        for course in education.courses:
            if course.subject == current_course.subject:
                course.attendance_count += 1
                break
        resident.occupation = "student"
        resident.energy = max(0.0, resident.energy - 0.01)
        agent._class_applied_this_stay = True  # type: ignore[attr-defined]
        return current_course

    def get_education_overview(self) -> List[dict]:
        course_counts = {subject: 0 for subject in _EDUCATION_SUBJECTS}
        for agent in self.agents:
            self.ensure_resident_education(agent.resident)
            for course in agent.resident.education.courses:
                course_counts[course.subject] = course_counts.get(course.subject, 0) + 1

        return [
            {
                "subject": subject,
                "name": name,
                "building_id": next(
                    (course.building_id for course in self.available_courses() if course.subject == subject),
                    None,
                ),
                "registration_count": course_counts.get(subject, 0),
            }
            for subject, name in _EDUCATION_SUBJECTS.items()
        ]

    def set_zones(self, zones: List[Zone]) -> None:
        self.zones = zones or self._default_zones()

    def get_zone(self, zone_id: str) -> Optional[Zone]:
        for zone in self.zones:
            if zone.id == zone_id:
                return zone
        return None

    def get_zone_at_position(self, x: int, y: int) -> Optional[Zone]:
        for zone in self.zones:
            bounds = zone.bounds
            if bounds.x <= x < bounds.x + bounds.width and bounds.y <= y < bounds.y + bounds.height:
                return zone
        return None

    def get_zone_stats(self, zone_id: str) -> Optional[dict]:
        zone = self.get_zone(zone_id)
        if zone is None:
            return None

        buildings = [
            building
            for building in self.buildings
            if self.get_zone_at_position(*building.position) == zone
        ]
        residents = [
            agent.resident
            for agent in self.agents
            if self.get_zone_for_resident(agent.resident) == zone
            or (
                agent.resident.home_building_id is not None
                and (home_building := self.get_building(agent.resident.home_building_id)) is not None
                and self.get_zone_at_position(*home_building.position) == zone
            )
        ]

        building_type_counts: Dict[str, int] = {}
        for building in buildings:
            building_type_counts[building.type] = building_type_counts.get(building.type, 0) + 1

        dominant_building_types = [
            item[0]
            for item in sorted(
                building_type_counts.items(),
                key=lambda item: (-item[1], item[0]),
            )[:3]
        ]

        return {
            "id": zone.id,
            "name": zone.name,
            "type": zone.type,
            "bounds": {
                "x": zone.bounds.x,
                "y": zone.bounds.y,
                "width": zone.bounds.width,
                "height": zone.bounds.height,
            },
            "atmosphere": {
                "noise": zone.atmosphere.noise,
                "safety": zone.atmosphere.safety,
                "beauty": zone.atmosphere.beauty,
            },
            "resident_count": len(residents),
            "building_count": len(buildings),
            "dominant_building_types": dominant_building_types,
        }

    def list_zone_stats(self) -> List[dict]:
        stats: List[dict] = []
        for zone in self.zones:
            zone_stats = self.get_zone_stats(zone.id)
            if zone_stats is not None:
                stats.append(zone_stats)
        return stats

    def get_zone_for_resident(self, resident: Resident) -> Optional[Zone]:
        if resident.location is not None:
            building = self.get_building(resident.location)
            if building is not None:
                return self.get_zone_at_position(*building.position)
        return self.get_zone_at_position(resident.x, resident.y)

    def score_zone_for_resident(self, resident: Resident, zone: Zone) -> float:
        extroversion = self._extroversion(resident.personality)
        introversion = 1.0 - extroversion
        atmosphere = zone.atmosphere
        liveliness = atmosphere.noise
        calmness = 1.0 - atmosphere.noise
        scenic_bonus = atmosphere.beauty * 0.2
        safety_bonus = atmosphere.safety * (0.18 + introversion * 0.12)

        zone_bias = {
            "commercial": extroversion * 0.28,
            "leisure": extroversion * 0.18 + atmosphere.beauty * 0.08,
            "residential": introversion * 0.24 + atmosphere.safety * 0.06,
            "education": introversion * 0.2 + atmosphere.safety * 0.08,
        }.get(zone.type, 0.0)

        return extroversion * liveliness + introversion * calmness + scenic_bonus + safety_bonus + zone_bias

    def get_building(self, building_id: str) -> Optional[Building]:
        """Look up a building by id."""
        for b in self.buildings:
            if b.id == building_id:
                return b
        return None

    def get_building_at_position(self, x: int, y: int) -> Optional[Building]:
        """Return the building whose entrance is at tile ``(x, y)``."""
        for building in self.buildings:
            if building.position == (x, y):
                return building
        return None

    def get_occupants(self, building_id: str) -> List[Agent]:
        """Return all agents currently inside the given building."""
        return [agent for agent in self.agents if agent.resident.location == building_id]

    def enter_building(self, agent: Agent, building: Building) -> bool:
        """Move *agent* into *building* if capacity allows."""
        if building.type != "park" and len(self.get_occupants(building.id)) >= building.capacity:
            return False

        agent.resident.location = building.id
        self.mark_grid_index_dirty()
        if building.type == "home":
            self.set_resident_mood(agent, "neutral", "rest")
        elif building.type == "cafe":
            agent.resident.coins = max(0, agent.resident.coins - 5)
        elif building.type == "shop":
            agent.resident.coins = max(0, agent.resident.coins - 10)
        elif building.type == "school":
            self.ensure_resident_education(agent.resident)
        return True

    def leave_building(self, agent: Agent) -> None:
        """Place *agent* back on the map at their building entrance."""
        building_id = agent.resident.location
        if building_id is None:
            return

        agent.resident.location = None
        agent._paid_this_stay = False  # type: ignore[attr-defined]
        agent._class_applied_this_stay = False  # type: ignore[attr-defined]
        building = self.get_building(building_id)
        if building is not None:
            agent.resident.x, agent.resident.y = building.position
        self.mark_grid_index_dirty()

    def get_social_probability_bonus(self, agent_a: Agent, agent_b: Agent) -> float:
        """Return building-based social bonus for an agent pair."""
        if agent_a.resident.location is None or agent_a.resident.location != agent_b.resident.location:
            return 0.0

        building = self.get_building(agent_a.resident.location)
        if building is None:
            return 0.0

        if building.type == "cafe":
            return 0.2
        return 0.0

    def get_social_probability(self, agent_a: Agent, agent_b: Agent) -> float:
        """Return the combined base + building social probability."""
        ext_a = self._extroversion(agent_a.resident.personality)
        ext_b = self._extroversion(agent_b.resident.personality)
        relationship = self.get_relationship(agent_a.resident.id, agent_b.resident.id)

        relation_bonus = 0.0
        if relationship is not None:
            relation_bonus = relationship.familiarity * 0.10 + relationship.intensity * 0.15

        family_bonus = 0.22 if self.are_family(agent_a.resident, agent_b.resident) else 0.0
        social_knowledge = (
            float(agent_a.resident.education.knowledge_level.get("social", 0.0))
            + float(agent_b.resident.education.knowledge_level.get("social", 0.0))
        ) / 2

        extroversion_bonus = ((ext_a + ext_b) / 2) * 0.30
        target_reputation = float(getattr(agent_b.resident, "reputation", 0.0))
        self_reputation = float(getattr(agent_a.resident, "reputation", 0.0))
        reputation_bonus = target_reputation * 0.22
        if target_reputation < 0:
            reputation_bonus += target_reputation * 0.18
        if self_reputation < -0.4:
            reputation_bonus += self_reputation * 0.08
        probability = (
            0.15
            + extroversion_bonus
            + relation_bonus
            + family_bonus
            + self.get_social_probability_bonus(agent_a, agent_b)
            + social_knowledge * 0.18
            + reputation_bonus
        )
        if agent_a.resident.mental_state == "depressed":
            probability *= 0.35
        if agent_b.resident.mental_state == "depressed":
            probability *= 0.8
        return max(0.05, min(0.95, probability))

    def remove_building(self, building_id: str) -> Optional["Building"]:
        """Remove a building, evict its occupants, and restore grid tiles.

        Returns the removed :class:`~engine.types.Building` or ``None`` if
        the building was not found.
        """
        building = self.get_building(building_id)
        if building is None:
            return None

        # Evict all occupants before removing
        for agent in self.get_occupants(building_id):
            self.leave_building(agent)

        self.buildings = [b for b in self.buildings if b.id != building_id]

        # Restore grid: mark entrance + 2×2 footprint body as walkable
        w = self.config.map_width_tiles
        h = self.config.map_height_tiles
        ex, ey = building.position

        def _restore(x: int, y: int) -> None:
            if 0 <= x < w and 0 <= y < h:
                self.grid[y][x] = True

        _restore(ex, ey)
        for dy in range(1, 3):
            for dx in range(0, 2):
                _restore(ex + dx, ey + dy)

        # Flush path cache so agents re-route around the now-open tiles
        self.path_cache = PathCache()
        self.mark_grid_index_dirty()
        return building

    def apply_building_effects(self, agent: Agent) -> None:
        """Apply passive effects from the building the agent is inside.

        Income is paid once per building stay (not every tick) using
        ``_paid_this_stay`` flag on the agent.
        """
        building_id = agent.resident.location
        if building_id is None:
            # Agent left all buildings — reset pay flag for next stay
            agent._paid_this_stay = False  # type: ignore[attr-defined]
            agent._class_applied_this_stay = False  # type: ignore[attr-defined]
            return

        building = self.get_building(building_id)
        if building is None:
            return
        from engine.lifecycle import is_elderly

        cooking_knowledge = float(agent.resident.education.knowledge_level.get("cooking", 0.0))
        crafting_knowledge = float(agent.resident.education.knowledge_level.get("crafting", 0.0))
        tick_per_day = self.config.tick_per_day
        hour = (self.current_tick % tick_per_day) * 24.0 / tick_per_day
        is_work_hour = 8.0 <= hour < 12.0 or 13.0 <= hour < 17.0

        if building.type == "home":
            self.set_resident_mood(agent, "neutral", "rest")
            agent.resident.occupation = "unemployed"
            # Recover energy at home
            recovery = (0.025 if is_elderly(agent.resident) else 0.05) + cooking_knowledge * 0.04
            agent.resident.energy = min(1.0, agent.resident.energy + recovery)
        elif building.type == "school":
            if is_work_hour:
                work_profile = _BUILDING_WORK_MAP[building.type]
                skill_name = work_profile["skill"]
                current_skill = float(agent.resident.skills.get(skill_name, 0.0))
                agent.resident.occupation = work_profile["occupation"]
                already_paid: bool = getattr(agent, "_paid_this_stay", False)
                if not already_paid:
                    bonus_income = round(current_skill * work_profile["base_income"])
                    agent.resident.coins += work_profile["base_income"] + bonus_income
                    item_name = work_profile.get("item_name")
                    if item_name:
                        item_value = int(work_profile.get("item_value", 0) * (1.0 + crafting_knowledge * 0.5))
                        self.add_inventory_item(
                            agent.resident,
                            item_name=item_name,
                            quantity=1,
                            value=item_value,
                        )
                    agent._paid_this_stay = True  # type: ignore[attr-defined]
                growth = 0.015 if current_skill < 0.6 else 0.008 if current_skill < 0.85 else 0.003
                agent.resident.skills[skill_name] = round(min(1.0, current_skill + growth), 4)
                agent.resident.energy = max(0.0, agent.resident.energy - 0.03)
            elif agent.resident.education.courses:
                self.teach_course(agent)
        elif building.type in _BUILDING_WORK_MAP:
            work_profile = _BUILDING_WORK_MAP[building.type]
            skill_name = work_profile["skill"]
            current_skill = float(agent.resident.skills.get(skill_name, 0.0))
            agent.resident.occupation = work_profile["occupation"]
            # Pay once per stay, not every tick
            already_paid: bool = getattr(agent, "_paid_this_stay", False)
            if not already_paid:
                if is_work_hour:
                    bonus_income = round(current_skill * work_profile["base_income"])
                    agent.resident.coins += work_profile["base_income"] + bonus_income
                    item_name = work_profile.get("item_name")
                    if item_name:
                        item_value = int(work_profile.get("item_value", 0) * (1.0 + crafting_knowledge * 0.5))
                        self.add_inventory_item(
                            agent.resident,
                            item_name=item_name,
                            quantity=1,
                            value=item_value,
                        )
                    agent._paid_this_stay = True  # type: ignore[attr-defined]
            growth = 0.015 if current_skill < 0.6 else 0.008 if current_skill < 0.85 else 0.003
            agent.resident.skills[skill_name] = round(min(1.0, current_skill + growth), 4)
            # Work drains energy every tick
            agent.resident.energy = max(0.0, agent.resident.energy - 0.03)

    def building_stay_duration(self) -> int:
        """Return the random number of ticks an agent stays indoors."""
        return random.randint(3, 8)

    def _extroversion(self, personality: str) -> float:
        text = personality.lower()
        if any(keyword in text for keyword in _EXTROVERT_KEYWORDS):
            return 0.8
        if any(keyword in text for keyword in _INTROVERT_KEYWORDS):
            return 0.2
        return 0.5

    def _patrol_zone_names(self) -> set[str]:
        patrol_zones: set[str] = set()
        for building in self.buildings:
            if building.type != "police_station":
                continue
            zone = self.get_zone_at_position(*building.position)
            if zone is not None:
                patrol_zones.add(zone.name)
        return patrol_zones

    def _resident_location_name(self, resident: Resident) -> str:
        if resident.location is not None:
            building = self.get_building(resident.location)
            if building is not None:
                zone = self.get_zone_at_position(*building.position)
                if zone is not None:
                    return zone.name
                return building.name
        zone = self.get_zone_at_position(resident.x, resident.y)
        return zone.name if zone is not None else "镇中心"

    def _crime_pressure(self, agent: Agent) -> float:
        resident = agent.resident
        self._ensure_resident_safety(resident)
        pressure = 0.0
        if self.mood_score(resident.mood) < -0.3:
            pressure += 0.18
        if resident.energy < 0.2:
            pressure += 0.16
        if resident.coins < 15:
            pressure += 0.12
        if not resident.inventory:
            pressure += 0.04
        if resident.mental_state == "depressed":
            pressure += 0.08
        nearby = self.get_social_candidates(agent)
        for other in nearby:
            rel = self.get_relationship(resident.id, other.resident.id)
            if rel is not None and rel.type.value in {"dislike", "rivalry", "fear"}:
                pressure += max(0.0, float(rel.intensity)) * 0.2
        return min(0.95, pressure)

    def process_crime_tick(self) -> List[CrimeEvent]:
        events: List[CrimeEvent] = []
        patrol_zones = self._patrol_zone_names()
        for agent in self.agents:
            resident = agent.resident
            self._ensure_resident_safety(resident)
            if not (
                self.mood_score(resident.mood) < -0.3
                or resident.energy < 0.2
                or resident.coins < 15
            ):
                continue
            pressure = self._crime_pressure(agent)
            location_name = self._resident_location_name(resident)
            if location_name in patrol_zones:
                pressure *= 0.5
            if random.random() >= pressure:
                continue
            nearby = [other for other in self.get_social_candidates(agent) if other is not agent]
            victim = None
            for other in nearby:
                rel = self.get_relationship(agent.resident.id, other.resident.id)
                if rel is not None and rel.type.value in {"dislike", "rivalry", "fear"}:
                    victim = other
                    break
            crime_type = "vandalism"
            if victim is not None:
                crime_type = "conflict" if random.random() < 0.5 else "theft"
            event = CrimeEvent(
                type=crime_type,
                perpetrator=agent.resident.id,
                victim=victim.resident.id if victim is not None else None,
                location=location_name,
                tick=self.current_tick,
                resolved=location_name in patrol_zones,
            )
            agent.resident.flagged_for_crime = True
            self.adjust_resident_reputation(agent.resident.id, -0.3, f"crime:{crime_type}")
            self.flagged_residents.add(agent.resident.id)
            if victim is not None:
                self.shift_resident_mood(victim, -3, f"crime:{crime_type}")
            for resident_agent in self.agents:
                resident_agent.resident.safety_feeling = max(
                    0.0,
                    resident_agent.resident.safety_feeling
                    - (0.04 if event.resolved else (0.08 if victim is not None else 0.04)),
                )
            self.crime_log.append(event)
            events.append(event)
        self.crime_log = self.crime_log[-200:]
        return events

    def get_crime_log(self) -> List[CrimeEvent]:
        return list(reversed(self.crime_log))

    def get_safety_stats(self) -> dict:
        for agent in self.agents:
            self._ensure_resident_safety(agent.resident)

        patrol_zones = self._patrol_zone_names()
        total_crimes = len(self.crime_log)
        unresolved_crimes = sum(1 for event in self.crime_log if not event.resolved)
        crimes_by_type: Dict[str, int] = {}
        hotspot_map: Dict[str, dict[str, float]] = {}
        for event in self.crime_log:
            crimes_by_type[event.type] = crimes_by_type.get(event.type, 0) + 1
            hotspot = hotspot_map.setdefault(event.location, {"count": 0, "resolved_count": 0})
            hotspot["count"] += 1
            if event.resolved:
                hotspot["resolved_count"] += 1

        max_hotspot_count = max((data["count"] for data in hotspot_map.values()), default=1)
        hotspots = [
            {
                "location": location,
                "count": int(data["count"]),
                "resolved_count": int(data["resolved_count"]),
                "intensity": round(data["count"] / max_hotspot_count, 3),
            }
            for location, data in sorted(hotspot_map.items(), key=lambda item: (-item[1]["count"], item[0]))
        ]

        average_safety_feeling = round(
            sum(agent.resident.safety_feeling for agent in self.agents) / len(self.agents),
            3,
        ) if self.agents else 1.0
        safety_index = round(max(0.0, min(1.0, average_safety_feeling - unresolved_crimes * 0.05)), 3)

        return {
            "safety_index": safety_index,
            "average_safety_feeling": average_safety_feeling,
            "total_crimes": total_crimes,
            "unresolved_crimes": unresolved_crimes,
            "crimes_by_type": crimes_by_type,
            "hotspots": hotspots,
            "flagged_residents": sorted(self.flagged_residents),
            "patrol_zones": sorted(patrol_zones),
        }

    # ------------------------------------------------------------------
    # Simulation loop (§8)
    # ------------------------------------------------------------------

    def tick(self) -> TickState:
        """Advance the simulation by one tick and return the state diff.

        The backend simulation loop calls this method on a timer.
        Concrete implementation will:
          1. Snapshot the current world state.
          2. Run all agents through their perceive→plan→act cycle.
          3. Collect movements, dialogues, relationship deltas, and events.
          4. Increment current_tick and return a :class:`~engine.types.TickState`.

        Returns:
            A :class:`~engine.types.TickState` describing everything that
            changed this tick (pushed to the frontend via WebSocket).
        """
        self.rebuild_grid_index()
        self.current_tick += 1
        sim_time = self.simulation_time()
        from engine.weather import normalize_season, normalize_weather, sync_weather_cycle

        previous_weather = normalize_weather(self.weather)
        weather_events = sync_weather_cycle(self)
        active_season = normalize_season(self.season)
        active_weather = normalize_weather(self.weather)
        if active_weather is WeatherType.stormy:
            for agent in self.agents:
                home_id = getattr(agent.resident, "home_building_id", None)
                if not home_id:
                    continue
                home = self.get_building(home_id)
                if home is None:
                    continue
                if agent.resident.location and agent.resident.location != home_id:
                    self.leave_building(agent)
                agent.resident.x, agent.resident.y = home.position
                if agent.resident.location != home_id:
                    self.enter_building(agent, home)
                agent.current_path = []
            if previous_weather is not WeatherType.stormy:
                weather_events.append("暴风雨来临，居民们纷纷回家避风。")
            elif not weather_events:
                weather_events.append("暴风雨持续，居民继续回家避风。")

        for agent in self.agents:
            if active_weather is WeatherType.sunny and random.random() < 0.1:
                self.shift_resident_mood(agent, 1, "weather")
            if agent.resident.energy < 0.2:
                self.set_resident_mood(agent, "tired", "energy")
            self.update_mental_state(agent.resident)
            if self.mood_score(agent.resident.mood) < 0:
                self.recall_comforting_memory(agent)

        if self.current_tick % 100 == 0:
            self.decay_resident_memories()

        crime_events = self.process_crime_tick()
        pet_events = self.update_pets()

        # ── Mood contagion: co-occupants influence each other's mood ──────
        from engine.act import apply_mood_contagion
        apply_mood_contagion(self)

        # ── End-of-day diary generation at 22:00 (tick index 44 / 48) ────
        _EOD_TICK_IN_DAY = 44  # 22 * (tick_per_day / 24) = 22 * 2
        if (self.current_tick % self.config.tick_per_day) == _EOD_TICK_IN_DAY:
            from engine.diary import generate_diary_entry
            for agent in self.agents:
                generate_diary_entry(agent, self)

        # Collect current position of every agent as movement updates.
        # The backend simulation loop (backend/core/simulation.py) calls
        # perceive/plan/act before tick(); by the time tick() runs the
        # agents' positions have already been updated for this step.
        movements = [
            MovementUpdate(
                id=a.resident.id,
                x=a.resident.x,
                y=a.resident.y,
                action="walking" if a.current_path else "standing",
            )
            for a in self.agents
            if a.resident.location is None
        ]

        energy_updates = [
            EnergyUpdate(id=a.resident.id, energy=round(a.resident.energy, 3))
            for a in self.agents
        ]

        # Clear path cache after tick so the next tick's agent cycle starts fresh
        self.path_cache.clear()

        return TickState(
            tick=self.current_tick,
            time=sim_time,
            movements=movements,
            events=[
                *[EventUpdate(description=description) for description in weather_events],
                *pet_events,
                *[
                    EventUpdate(description=f"{event.location}发生{event.type}事件")
                    for event in crime_events
                ],
            ],
            weather=self.weather.value,
            season=active_season.value,
            energy_updates=energy_updates,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def simulation_time(self) -> str:
        """Human-readable in-world time string, e.g. ``'Day 3, 14:30'``."""
        day = self.current_tick // self.config.tick_per_day + 1
        tick_in_day = self.current_tick % self.config.tick_per_day
        # Each tick = 30 simulated minutes; day starts at 00:00
        minutes_in_day = tick_in_day * 30
        hour, minute = divmod(minutes_in_day, 60)
        return f"Day {day}, {hour:02d}:{minute:02d}"

    def _bucket_key(self, x: int, y: int) -> Tuple[int, int]:
        return (x // self.grid_chunk_size, y // self.grid_chunk_size)

    def __repr__(self) -> str:
        return (
            f"World(tick={self.current_tick}, "
            f"agents={len(self.agents)}, "
            f"buildings={len(self.buildings)})"
        )
