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
from engine.fashion import (
    apply_outfit_for_occasion,
    ensure_resident_fashion,
    ensure_world_fashion_state,
    fashion_social_bonus as calculate_fashion_social_bonus,
    get_world_fashion_overview,
    maybe_purchase_clothing,
    maybe_tailor_design,
    sync_fashion_for_tick,
)
from engine.pathfinding import PathCache
from engine.types import (
    Building,
    CrimeEvent,
    Course,
    CourseHistoryEntry,
    CulturalEvent,
    Education,
    EnergyUpdate,
    Event,
    EventUpdate,
    Health,
    Illness,
    Item,
    Job,
    Memory,
    MoodEntry,
    MovementUpdate,
    EconomicCycle,
    Milestone,
    NewsArticle,
    Newspaper,
    Party,
    Pet,
    Religion,
    RelationType,
    ReligiousEvent,
    Road,
    ReputationEntry,
    Relationship,
    Resident,
    Season,
    TickState,
    TransportMode,
    WeatherType,
    WorldConfig,
    Zone,
    ZoneAtmosphere,
    ZoneBounds,
)

_EXTROVERT_KEYWORDS = ("外向", "开朗", "活泼", "健谈", "社牛", "extrovert", "outgoing")
_INTROVERT_KEYWORDS = ("内向", "安静", "害羞", "社恐", "introvert", "shy")
_PROGRESSIVE_KEYWORDS = ("外向", "热心", "开放", "创新", "理想", "关怀", "community", "kind", "creative")
_CONSERVATIVE_KEYWORDS = ("保守", "谨慎", "秩序", "传统", "纪律", "稳定", "careful", "order")
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
        "base_income": 16,
        "skill": "cooking",
        "item_name": "coffee",
        "item_value": 12,
    },
    "school": {
        "occupation": "teacher",
        "base_income": 20,
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
    "dock": {"occupation": "farmer", "base_income": 14, "skill": "fishing"},
    "plaza": {"occupation": "guard", "base_income": 17, "skill": "social"},
    "park": {"occupation": "artist", "base_income": 15, "skill": "art"},
    "clinic": {"occupation": "doctor", "base_income": 24, "skill": "social"},
    "hospital": {"occupation": "doctor", "base_income": 24, "skill": "social"},
}
_EDUCATION_SUBJECTS = {
    "cooking": "烹饪课",
    "farming": "农务课",
    "crafting": "手工课",
    "social": "社交课",
    "art": "艺术课",
}
_CULTURAL_EVENT_NAMES = {
    "concert": "暮色音乐会",
    "exhibition": "小镇画展",
    "theater": "街角戏剧夜",
    "workshop": "手作工坊体验",
}
_RELIGION_LABELS = {
    Religion.naturalism.value: "自然信仰",
    Religion.ancestor_worship.value: "祖灵敬拜",
    Religion.solarsm.value: "日耀信仰",
    Religion.none.value: "无信仰",
}
_RELIGION_SITE_TYPES = {
    Religion.naturalism.value: "shrine",
    Religion.ancestor_worship.value: "temple",
    Religion.solarsm.value: "chapel",
}
_RELIGIOUS_EVENT_NAMES = {
    Religion.naturalism.value: {
        "festival": "林风感恩节",
        "ritual": "静枝祈祷礼",
    },
    Religion.ancestor_worship.value: {
        "festival": "先祖灯火祭",
        "ritual": "祠堂追思礼",
    },
    Religion.solarsm.value: {
        "festival": "晨辉赞歌节",
        "ritual": "日轮颂光礼",
    },
}
_HOLY_SITE_TYPES = frozenset(_RELIGION_SITE_TYPES.values())
_PET_EMOJI_NAME = {
    "cat": "小咪",
    "dog": "旺财",
    "bird": "啾啾",
    "rabbit": "团团",
}
_PET_SPECIES = ("cat", "dog", "bird", "rabbit")
_PET_FRIENDLY_KW = ("友善", "善良", "热心", "温柔", "开朗", "friendly", "kind")
_BUILDING_SPECIAL_FEATURES = {
    "cafe": "banquet",
    "school": "advanced_courses",
    "hospital": "surgery",
}
_BUILDING_UPGRADE_COSTS = {
    1: 120.0,
    2: 260.0,
}
_ILLNESS_PROFILES = {
    "cold": {"contagious": True, "severity": 0.28, "recovery": 12},
    "flu": {"contagious": True, "severity": 0.55, "recovery": 18},
    "injury": {"contagious": False, "severity": 0.45, "recovery": 14},
    "exhaustion": {"contagious": False, "severity": 0.35, "recovery": 10},
}


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
        self.rng = random.Random(self.config.seed) if self.config.seed is not None else random
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
        self.cultural_events: List[CulturalEvent] = []
        self.culture_prosperity_history: List[dict] = []
        self.religious_events: List[ReligiousEvent] = []
        self.morality_history: List[dict] = []
        self.generational_history: List[dict] = []
        self.gdp_history: List[dict] = []
        self.economic_output: float = 0.0
        self.economic_cycle: EconomicCycle = EconomicCycle()
        self.fashion_trend: dict = {}
        self.fashion_trend_history: List[dict] = []
        self.fashion_purchase_history: List[dict] = []
        self.fashion_design_history: List[dict] = []
        self.town_reserve: float = 200.0
        self.external_towns: List[object] = []
        self.trade_routes: List[object] = []
        self.path_cache: PathCache = PathCache()
        self.roads: List[Road] = []
        self.road_usage: Dict[tuple[str, str], int] = {}
        self.transport_mode_usage: Dict[str, int] = {mode.value: 0 for mode in TransportMode}
        self.last_transport_stats: dict = {
            "mode_share": {mode.value: 0 for mode in TransportMode},
            "average_travel_ticks": 0.0,
            "congestion_hotspots": [],
        }
        self.grid_chunk_size: int = max(1, self.config.interaction_distance)
        self.grid_index: Dict[Tuple[int, int], List[Agent]] = {}
        self._grid_index_dirty = True
        self.news_archive: List[Newspaper] = []
        self.town_level: int = 1
        self.milestones: List[Milestone] = self._default_milestones()
        self.unlocks: List[str] = []
        ensure_world_fashion_state(self)

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
        self._ensure_resident_artistic_talent(agent.resident)
        self._ensure_resident_ageing(agent.resident)
        self._ensure_resident_safety(agent.resident)
        self._ensure_resident_reputation(agent.resident)
        self._ensure_resident_party(agent.resident)
        self._ensure_resident_religion(agent.resident)
        self._ensure_resident_transport(agent.resident)
        self._ensure_resident_memories(agent.resident)
        self._ensure_resident_job(agent.resident)
        self._ensure_resident_health(agent.resident)
        self._ensure_resident_fashion(agent.resident)
        self.agents.append(agent)
        self._apply_religious_relationship_bias(agent)
        self._rebuild_pet_registry()
        self.mark_grid_index_dirty()

    def _age_stage_for_days(self, age_days: int) -> str:
        if age_days < 200:
            return "child"
        if age_days < 800:
            return "adult"
        return "elder"

    def _ensure_resident_ageing(self, resident: Resident) -> None:
        resident.age_days = max(0, int(getattr(resident, "age_days", 0)))
        resident.age_stage = self._age_stage_for_days(resident.age_days)
        retirement_tick = getattr(resident, "retirement_tick", None)
        resident.retirement_tick = int(retirement_tick) if retirement_tick is not None else None
        inheritance = getattr(resident, "inheritance", {})
        resident.inheritance = dict(inheritance) if isinstance(inheritance, dict) else {}

    def can_resident_work(self, resident: Resident) -> bool:
        self._ensure_resident_ageing(resident)
        return resident.age_stage == "adult"

    def retire_resident(self, resident: Resident, *, tick: int | None = None) -> None:
        self._ensure_resident_ageing(resident)
        if resident.age_stage != "elder":
            return
        resident.occupation = "retired"
        resident.job.title = "retired"
        resident.job.workplace_id = None
        resident.job.salary = 0.0
        resident.job.satisfaction = max(0.6, resident.job.satisfaction)
        if resident.retirement_tick is None:
            resident.retirement_tick = self.current_tick if tick is None else tick

    def grant_pension(self, resident: Resident, amount: float = 8.0) -> float:
        payout = round(max(0.0, min(float(amount), float(getattr(self, "town_reserve", 0.0)))), 2)
        if payout <= 0:
            return 0.0
        self.town_reserve = round(max(0.0, self.town_reserve - payout), 2)
        resident.wallet = round(float(getattr(resident, "wallet", 0.0)) + payout, 2)
        return payout

    def record_generational_event(
        self,
        event_type: str,
        resident_name: str,
        summary: str,
        *,
        resident_id: str | None = None,
        tick: int | None = None,
    ) -> None:
        self.generational_history.append(
            {
                "tick": self.current_tick if tick is None else tick,
                "type": event_type,
                "resident_id": resident_id,
                "resident_name": resident_name,
                "summary": summary,
            }
        )
        self.generational_history = self.generational_history[-120:]

    def _ensure_resident_religion(self, resident: Resident) -> None:
        religion = getattr(resident, "religion", Religion.none)
        if isinstance(religion, Religion):
            normalized = religion
        else:
            try:
                normalized = Religion(str(religion))
            except ValueError:
                normalized = Religion.none

        if normalized is Religion.none:
            checksum = sum(ord(char) for char in f"{resident.id}:{resident.name}")
            options = (
                Religion.naturalism,
                Religion.ancestor_worship,
                Religion.solarsm,
                Religion.none,
            )
            normalized = options[checksum % len(options)]

        resident.religion = normalized
        if normalized is Religion.none:
            resident.piety = 0.0
        else:
            try:
                piety = float(getattr(resident, "piety", 0.2))
            except (TypeError, ValueError):
                piety = 0.2
            resident.piety = round(max(0.0, min(1.0, piety)), 4)
        try:
            morality = float(getattr(resident, "morality_score", 0.5))
        except (TypeError, ValueError):
            morality = 0.5
        resident.morality_score = round(
            max(0.0, min(1.0, morality)),
            4,
        )

    def _apply_religious_relationship_bias(self, agent: Agent) -> None:
        resident = agent.resident
        self._ensure_resident_religion(resident)

        for other in self.agents:
            if other is agent:
                continue
            self._ensure_resident_religion(other.resident)
            if resident.religion is Religion.none or other.resident.religion is Religion.none:
                continue

            same_faith = resident.religion == other.resident.religion
            relation_type = RelationType.friendship if same_faith else RelationType.dislike
            reason = "shared_religion" if same_faith else "religious_difference"

            for from_id, to_id in (
                (resident.id, other.resident.id),
                (other.resident.id, resident.id),
            ):
                existing = self.get_relationship(from_id, to_id)
                if existing is None:
                    self.set_relationship(
                        Relationship(
                            from_id=from_id,
                            to_id=to_id,
                            type=relation_type,
                            intensity=0.1,
                            since=self.simulation_time(),
                            familiarity=0.05,
                            reason=reason,
                        )
                    )
                    continue

                if same_faith:
                    if existing.type in {RelationType.knows, RelationType.friendship}:
                        existing.type = RelationType.friendship
                    existing.intensity = round(max(existing.intensity, 0.1), 4)
                    existing.familiarity = round(max(existing.familiarity, 0.05), 4)
                elif existing.type in {RelationType.knows, RelationType.dislike}:
                    existing.type = RelationType.dislike
                    existing.intensity = round(max(existing.intensity, 0.1), 4)
                if not existing.reason:
                    existing.reason = reason
                self.set_relationship(existing)

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
            checksum = sum(ord(char) for char in f"{resident.id}:{resident.name}")
            if checksum % 10 >= 3:
                continue
            species = _PET_SPECIES[checksum % len(_PET_SPECIES)]
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
                    if self.rng.random() < 0.05:
                        self.shift_resident_mood(owner, 1, "pet")
                    if pet.hunger < 0.4 and self.rng.random() < 0.35:
                        pet.hunger = round(min(1.0, pet.hunger + 0.5), 3)
                        pet.mood = "content"
                        events.append(EventUpdate(description=f"{owner.resident.name}喂食了宠物{pet.name}。"))
                    elif self.rng.random() < 0.18:
                        pet.mood = "happy"
                        self.shift_resident_mood(owner, 1, "pet")
                        events.append(EventUpdate(description=f"{owner.resident.name}和宠物{pet.name}玩耍了一会儿。"))
                if pet.hunger < 0.25:
                    sound = "汪汪" if pet.species == "dog" else "喵呜" if pet.species == "cat" else "啾啾"
                    events.append(EventUpdate(description=f"{pet.name}{sound}叫唤，似乎饿了。"))
                continue

            for agent in self.agents:
                resident = agent.resident
                if self._friendly_resident_score(resident) < 0.65:
                    continue
                if abs(resident.x - pet.x) + abs(resident.y - pet.y) > 1:
                    continue
                if self.rng.random() >= 0.18:
                    continue
                pet.owner_id = resident.id
                resident.pets.append(pet)
                self.stray_pets = [item for item in self.stray_pets if item.id != pet.id]
                self._sync_pet_to_owner(pet, agent)
                events.append(EventUpdate(description=f"{resident.name}收养了流浪{pet.name}。"))
                break
            if pet.owner_id:
                continue

            step_x = self.rng.choice([-1, 0, 1])
            step_y = self.rng.choice([-1, 0, 1])
            pet.x = max(0, min(self.config.map_width_tiles - 1, pet.x + step_x))
            pet.y = max(0, min(self.config.map_height_tiles - 1, pet.y + step_y))
            pet.location = None

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

    def mood_from_score(self, score: float) -> str:
        """Return the mood string closest to the given numeric score."""
        best = "neutral"
        best_dist = abs(score)
        for mood, mood_score in _MOOD_SCORE.items():
            dist = abs(score - mood_score)
            if dist < best_dist:
                best_dist = dist
                best = mood
        return best

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

    def _ensure_resident_party(self, resident: Resident) -> None:
        party = getattr(resident, "party", Party.neutral)
        if isinstance(party, Party):
            resident.party = party
            return
        try:
            resident.party = Party(str(party))
            return
        except ValueError:
            pass

        personality = (resident.personality or "").lower()
        progressive_score = sum(1 for keyword in _PROGRESSIVE_KEYWORDS if keyword in personality)
        conservative_score = sum(1 for keyword in _CONSERVATIVE_KEYWORDS if keyword in personality)
        if progressive_score > conservative_score:
            resident.party = Party.progressive
        elif conservative_score > progressive_score:
            resident.party = Party.conservative
        else:
            resident.party = Party.neutral

    def _ensure_resident_transport(self, resident: Resident) -> None:
        mode = getattr(resident, "transport_mode", TransportMode.walk)
        if isinstance(mode, TransportMode):
            resident.transport_mode = mode
            return
        try:
            resident.transport_mode = TransportMode(str(mode))
        except ValueError:
            resident.transport_mode = TransportMode.walk

    def _ensure_resident_health(self, resident: Resident) -> None:
        health = getattr(resident, "health", None)
        if not isinstance(health, Health):
            if isinstance(health, dict):
                illness_data = health.get("illness")
                illness = Illness(**illness_data) if isinstance(illness_data, dict) else None
                resident.health = Health(
                    hp=float(health.get("hp", 1.0)),
                    illness=illness,
                    recovery_tick=int(health.get("recovery_tick", 0)),
                    work_streak=int(health.get("work_streak", 0)),
                )
            else:
                resident.health = Health()
        resident.health.hp = max(0.0, min(1.0, float(getattr(resident.health, "hp", 1.0))))
        resident.health.recovery_tick = int(getattr(resident.health, "recovery_tick", 0))
        resident.health.work_streak = max(0, int(getattr(resident.health, "work_streak", 0)))
        illness = getattr(resident.health, "illness", None)
        if illness is not None and not isinstance(illness, Illness):
            if isinstance(illness, dict):
                resident.health.illness = Illness(**illness)
            else:
                resident.health.illness = None

    def has_illness(self, resident: Resident, *illness_types: str) -> bool:
        self._ensure_resident_health(resident)
        illness = resident.health.illness
        if illness is None:
            return False
        return illness.type in illness_types if illness_types else True

    def health_movement_penalty(self, resident: Resident) -> float:
        return 0.4 if self.has_illness(resident) else 0.0

    def health_work_efficiency(self, resident: Resident) -> float:
        self._ensure_resident_ageing(resident)
        age_factor = 0.0 if resident.age_stage == "child" else 0.2 if resident.age_stage == "elder" else 1.0
        illness_factor = 0.4 if self.has_illness(resident) else 1.0
        return round(age_factor * illness_factor, 3)

    def infect_resident(self, resident: Resident, illness_type: str, *, severity: float | None = None, recovery_ticks: int | None = None) -> bool:
        self._ensure_resident_health(resident)
        profile = _ILLNESS_PROFILES.get(illness_type, {"contagious": False, "severity": 0.3, "recovery": 10})
        current = resident.health.illness
        next_severity = float(severity if severity is not None else profile["severity"])
        next_recovery = int(recovery_ticks if recovery_ticks is not None else profile["recovery"])
        if current is not None and current.type == illness_type and resident.health.recovery_tick >= next_recovery:
            return False
        resident.health.illness = Illness(
            type=illness_type,
            contagious=bool(profile["contagious"]),
            severity=max(next_severity, float(getattr(current, "severity", 0.0))) if current else next_severity,
        )
        resident.health.recovery_tick = max(resident.health.recovery_tick, next_recovery)
        resident.health.hp = max(0.1, round(resident.health.hp - resident.health.illness.severity * 0.1, 3))
        self.shift_resident_mood(resident, -1, illness_type)
        return True

    def recover_resident_health(self, resident: Resident, amount: float, *, treatment: bool = False) -> None:
        self._ensure_resident_health(resident)
        resident.health.hp = round(min(1.0, resident.health.hp + amount), 3)
        if resident.health.illness is None:
            resident.health.recovery_tick = 0
            return
        resident.health.recovery_tick -= 2 if treatment else 1
        if resident.health.recovery_tick <= 0 or resident.health.hp >= 0.98:
            resident.health.illness = None
            resident.health.recovery_tick = 0
            resident.health.hp = max(0.6, resident.health.hp)

    def maybe_transmit_illness(self, source: Resident, target: Resident) -> bool:
        self._ensure_resident_health(source)
        self._ensure_resident_health(target)
        illness = source.health.illness
        if illness is None or not illness.contagious or target.health.illness is not None:
            return False
        if self.rng.random() >= 0.3:
            return False
        return self.infect_resident(target, illness.type, severity=illness.severity, recovery_ticks=max(6, source.health.recovery_tick))

    def nearest_hospital(self) -> Building | None:
        return next((building for building in self.buildings if building.type == "hospital"), None)

    def get_health_stats(self) -> dict:
        illness_counts: Dict[str, int] = {}
        hotspots: Dict[str, dict[str, float]] = {}
        active_cases = 0
        contagious_cases = 0
        hospitalized_count = 0
        total_hp = 0.0
        hospital_ids = {building.id for building in self.buildings if building.type == "hospital"}

        for agent in self.agents:
            resident = agent.resident
            self._ensure_resident_health(resident)
            total_hp += resident.health.hp
            illness = resident.health.illness
            if illness is None:
                continue
            active_cases += 1
            illness_counts[illness.type] = illness_counts.get(illness.type, 0) + 1
            if illness.contagious:
                contagious_cases += 1
            if resident.location in hospital_ids:
                hospitalized_count += 1
            location = self._resident_location_name(resident)
            bucket = hotspots.setdefault(location, {"cases": 0, "intensity": 0.0})
            bucket["cases"] += 1
            bucket["intensity"] += illness.severity

        max_cases = max((row["cases"] for row in hotspots.values()), default=1)
        outbreak_hotspots = [
            {
                "location": location,
                "cases": int(row["cases"]),
                "intensity": round(max(0.2, row["cases"] / max_cases), 3),
            }
            for location, row in sorted(hotspots.items(), key=lambda item: (-item[1]["cases"], item[0]))
        ]
        return {
            "active_cases": active_cases,
            "contagious_cases": contagious_cases,
            "hospitalized_count": hospitalized_count,
            "treatment_rate": round(hospitalized_count / active_cases, 3) if active_cases else 0.0,
            "average_hp": round(total_hp / len(self.agents), 3) if self.agents else 1.0,
            "illness_counts": illness_counts,
            "outbreak_hotspots": outbreak_hotspots,
        }

    def get_demographics_overview(self) -> dict:
        distribution = {"child": 0, "adult": 0, "elder": 0}
        total_age = 0
        retired_count = 0
        recent_deaths = 0

        for agent in self.agents:
            resident = agent.resident
            self._ensure_resident_ageing(resident)
            distribution[resident.age_stage] += 1
            total_age += resident.age_days
            if resident.retirement_tick is not None:
                retired_count += 1

        for event in self.generational_history[-20:]:
            if event.get("type") == "death":
                recent_deaths += 1

        child_count = distribution["child"]
        elder_count = distribution["elder"]
        aging_index = round(elder_count / child_count, 3) if child_count else float(elder_count > 0)
        timeline = sorted(
            self.generational_history[-12:],
            key=lambda item: (-int(item.get("tick", 0)), str(item.get("resident_name", ""))),
        )

        return {
            "age_distribution": distribution,
            "aging_index": aging_index,
            "average_age": round(total_age / len(self.agents), 3) if self.agents else 0.0,
            "retired_count": retired_count,
            "recent_deaths": recent_deaths,
            "generational_timeline": timeline,
        }

    def get_resident_health_profile(self, resident_id: str) -> dict | None:
        agent = self.get_agent(resident_id)
        if agent is None:
            return None
        self._ensure_resident_health(agent.resident)
        illness = agent.resident.health.illness
        return {
            "resident_id": agent.resident.id,
            "resident_name": agent.resident.name,
            "health": {
                "hp": round(agent.resident.health.hp, 3),
                "illness": None if illness is None else {
                    "type": illness.type,
                    "contagious": illness.contagious,
                    "severity": round(illness.severity, 3),
                },
                "recovery_tick": agent.resident.health.recovery_tick,
            },
        }

    def _ensure_resident_job(self, resident: Resident) -> None:
        job = getattr(resident, "job", None)
        if not isinstance(job, Job):
            if isinstance(job, dict):
                resident.job = Job(**job)
            else:
                resident.job = Job()
        resident.wallet = max(0.0, float(getattr(resident, "wallet", 0.0)))
        resident.job.satisfaction = min(1.0, max(0.0, float(getattr(resident.job, "satisfaction", 0.5))))
        current_occupation = getattr(resident, "occupation", "") or "unemployed"
        if not resident.job.title or (
            resident.job.title == "unemployed" and current_occupation != "unemployed"
        ):
            resident.job.title = current_occupation
        if not resident.job.title:
            resident.job.title = current_occupation
        resident.occupation = resident.job.title or current_occupation

    def _ensure_resident_fashion(self, resident: Resident) -> None:
        ensure_world_fashion_state(self)
        ensure_resident_fashion(self, resident)

    def fashion_social_bonus(self, resident: Resident, *, first_impression: bool = False) -> float:
        self._ensure_resident_fashion(resident)
        return calculate_fashion_social_bonus(self, resident, first_impression=first_impression)

    def get_fashion_overview(self) -> dict:
        ensure_world_fashion_state(self)
        return get_world_fashion_overview(self)

    # ------------------------------------------------------------------
    # News / media system
    # ------------------------------------------------------------------

    def generate_news(self) -> Optional[Newspaper]:
        """Auto-generate a newspaper from recent simulation events.

        Called every 10 ticks.  Scans crime_log, active festivals,
        fashion purchases, economic output, and relationship changes
        to produce articles, then applies opinion effects.
        """
        tick = int(getattr(self, "current_tick", 0))
        articles: List[NewsArticle] = []
        headline = ""

        # ── Crime articles ──
        recent_crimes = [
            c for c in self.crime_log
            if c.tick >= tick - 10
        ]
        if recent_crimes:
            worst = max(recent_crimes, key=lambda c: float(getattr(c, "severity", 0.5)))
            articles.append(NewsArticle(
                headline=f"{worst.location}发生{worst.type}事件",
                content=f"犯罪嫌疑人{'已被确认' if worst.resolved else '仍在逃'}，居民安全感下降。",
                category="crime",
                importance=min(1.0, float(getattr(worst, "severity", 0.5)) + 0.3),
                tick=tick,
                icon="🚨",
            ))

        # ── Disaster articles ──
        active_disasters = getattr(self, "active_disasters", [])
        for disaster in active_disasters:
            articles.append(NewsArticle(
                headline=f"紧急：{getattr(disaster, 'name', '灾害')}来袭",
                content=f"受灾区域需要居民紧急撤离。严重程度 {round(float(getattr(disaster, 'severity', 0.5)) * 100)}%。",
                category="disaster",
                importance=0.9,
                tick=tick,
                icon="⚠️",
            ))

        # ── Festival articles ──
        festival_name = getattr(self, "active_festival", None)
        if festival_name and int(getattr(self, "active_festival_ticks_remaining", 0)) > 0:
            articles.append(NewsArticle(
                headline=f"「{festival_name}」活动正在进行",
                content="全镇居民热情参与，心情普遍提升。",
                category="festival",
                importance=0.6,
                tick=tick,
                icon="🎉",
            ))

        # ── Trade / economy articles ──
        gdp = float(getattr(self, "economic_output", 0.0))
        purchases = [
            p for p in self.fashion_purchase_history
            if p.get("tick", 0) >= tick - 10
        ]
        if purchases or gdp > 0:
            articles.append(NewsArticle(
                headline="经济简报",
                content=f"近期 GDP 累计 {round(gdp, 1)}，服装消费 {len(purchases)} 笔。",
                category="trade",
                importance=0.4,
                tick=tick,
                icon="📊",
            ))

        # ── Achievement articles ──
        recent_achievements = [
            a for a in getattr(self, "achievement_unlocks", [])
            if getattr(a, "tick", 0) >= tick - 10
        ]
        for ach in recent_achievements[:2]:
            articles.append(NewsArticle(
                headline=f"成就解锁：{getattr(ach, 'name', '未知')}",
                content=getattr(ach, "description", "一位居民达成了新成就！"),
                category="achievement",
                importance=0.5,
                tick=tick,
                icon="🏆",
            ))

        # ── Fallback if no events ──
        if not articles:
            articles.append(NewsArticle(
                headline="小镇风平浪静",
                content="今日无重大事件，居民安居乐业。",
                category="general",
                importance=0.2,
                tick=tick,
                icon="☀️",
            ))

        # Pick the highest-importance article as headline
        articles.sort(key=lambda a: -a.importance)
        headline = articles[0].headline

        paper = Newspaper(
            edition=len(self.news_archive) + 1,
            tick=tick,
            headline=headline,
            articles=articles,
        )
        self.news_archive.append(paper)
        self.news_archive = self.news_archive[-50:]

        # ── Opinion effects ──
        self._apply_news_opinion(paper)

        return paper

    def _apply_news_opinion(self, paper: Newspaper) -> None:
        """News influences public opinion: crime → safety↓/mood↓, festivals → mood↑."""
        for article in paper.articles:
            if article.category == "crime" and article.importance >= 0.6:
                for agent in self.agents:
                    self.shift_resident_mood(agent.resident, -1, "news_crime")
            elif article.category == "disaster":
                for agent in self.agents:
                    self.shift_resident_mood(agent.resident, -1, "news_disaster")
            elif article.category == "festival":
                for agent in self.agents:
                    self.shift_resident_mood(agent.resident, 1, "news_festival")
            elif article.category == "achievement":
                for agent in self.agents:
                    self.shift_resident_mood(agent.resident, 1, "news_achievement")

    def get_news_overview(self) -> dict:
        """Return the news archive for the API."""
        latest = self.news_archive[-1] if self.news_archive else None
        return {
            "headline": latest.headline if latest else "",
            "latest_edition": latest.edition if latest else 0,
            "latest_tick": latest.tick if latest else 0,
            "articles": [
                {
                    "headline": a.headline,
                    "content": a.content,
                    "category": a.category,
                    "importance": a.importance,
                    "tick": a.tick,
                    "icon": a.icon,
                }
                for a in (latest.articles if latest else [])
            ],
            "archive": [
                {
                    "edition": p.edition,
                    "tick": p.tick,
                    "headline": p.headline,
                    "article_count": len(p.articles),
                }
                for p in reversed(self.news_archive[-12:])
            ],
        }

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
        if self.mood_score(resident.mood) < 0:
            self.set_resident_mood(resident, "calm", "memory")
        else:
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

    def _job_profile_for_building(self, building: Building) -> dict[str, object] | None:
        return _BUILDING_WORK_MAP.get(building.type)

    def _is_work_hour(self, hour: float) -> bool:
        return 8.0 <= hour < 12.0 or 13.0 <= hour < 17.0

    def _assign_job_for_building(self, resident: Resident, building: Building) -> None:
        self._ensure_resident_job(resident)
        profile = self._job_profile_for_building(building)
        if profile is None:
            return
        occupation = str(profile["occupation"])
        salary = float(profile["base_income"])
        if building.type == "shop":
            art_skill = float(resident.skills.get("art", 0.0))
            crafting_skill = float(resident.skills.get("crafting", 0.0))
            if (
                resident.job.title == "tailor"
                or resident.occupation == "tailor"
                or max(art_skill, crafting_skill) >= 0.8
                or art_skill + crafting_skill >= 1.35
            ):
                occupation = "tailor"
                salary += 4.0
        resident.job.title = occupation
        resident.job.workplace_id = building.id
        resident.job.salary = salary
        resident.job.work_hours = [8, 12, 13, 17]
        resident.occupation = resident.job.title

    def _find_job_opening(self) -> Building | None:
        for building in self.buildings:
            if self._job_profile_for_building(building) is not None:
                return building
        return None

    def _seek_job(self, agent: Agent) -> None:
        resident = agent.resident
        self._ensure_resident_job(resident)
        if resident.job.title != "unemployed":
            return
        building = self._find_job_opening()
        if building is None:
            return
        self._assign_job_for_building(resident, building)
        self.enter_building(agent, building)

    def _job_satisfaction(self, resident: Resident) -> float:
        self._ensure_resident_job(resident)
        counterpart_scores: list[float] = []
        for (from_id, to_id), rel in self.relationships.items():
            if resident.id not in {from_id, to_id}:
                continue
            counterpart_scores.append(rel.intensity)
        relationship_factor = sum(counterpart_scores) / len(counterpart_scores) if counterpart_scores else 0.0
        score = 0.5 + self.mood_score(resident.mood) * 0.2 + resident.reputation * 0.2 + relationship_factor * 0.1
        return max(0.0, min(1.0, round(score, 3)))

    def _register_gdp(self, amount: float) -> None:
        self.economic_output = round(self.economic_output + max(0.0, amount), 2)

    def _purchase_for_resident(self, resident: Resident) -> None:
        self._ensure_resident_job(resident)
        self._ensure_resident_fashion(resident)
        if resident.location is None:
            return
        building = self.get_building(resident.location)
        if building is None or building.type not in {"shop", "cafe"}:
            return
        if building.type == "shop":
            clothing_purchase = maybe_purchase_clothing(self, resident)
            if clothing_purchase is not None:
                return
        price = 6.0 if building.type == "shop" else 4.0
        item_name = "meal" if building.type == "cafe" else "supplies"
        if resident.wallet < price:
            return
        resident.wallet = round(resident.wallet - price, 2)
        self.add_inventory_item(resident, item_name=item_name, quantity=1, value=int(price))
        self._register_gdp(price)

    def get_economy_overview(self) -> dict:
        employed = [agent for agent in self.agents if getattr(agent.resident.job, "title", "unemployed") != "unemployed"]
        unemployed = [agent for agent in self.agents if getattr(agent.resident.job, "title", "unemployed") == "unemployed"]
        incomes = sorted(float(getattr(agent.resident.job, "salary", 0.0)) for agent in self.agents)
        buckets = [
            {"bucket": "0-9", "count": 0},
            {"bucket": "10-19", "count": 0},
            {"bucket": "20+", "count": 0},
        ]
        for income in incomes:
            if income < 10:
                buckets[0]["count"] += 1
            elif income < 20:
                buckets[1]["count"] += 1
            else:
                buckets[2]["count"] += 1
        occ_count: Dict[str, int] = {}
        for agent in employed:
            title = getattr(agent.resident.job, "title", "unemployed")
            occ_count[title] = occ_count.get(title, 0) + 1
        return {
            "employment_rate": round(len(employed) / len(self.agents), 3) if self.agents else 0.0,
            "average_income": round(sum(incomes) / len(incomes), 2) if incomes else 0.0,
            "gdp": round(self.economic_output, 2),
            "unemployed_count": len(unemployed),
            "employed_count": len(employed),
            "employment_distribution": [{"occupation": key, "count": value} for key, value in sorted(occ_count.items())],
            "income_distribution": buckets,
            "gdp_history": list(self.gdp_history)[-20:],
        }

    # ------------------------------------------------------------------
    # Economic cycle system
    # ------------------------------------------------------------------

    _CYCLE_ORDER = ("recovery", "boom", "recession", "depression")
    _CYCLE_PARAMS: dict = {
        "boom":       {"gdp_modifier": 1.25, "unemployment_modifier": 0.6},
        "recession":  {"gdp_modifier": 0.80, "unemployment_modifier": 1.3},
        "depression": {"gdp_modifier": 0.60, "unemployment_modifier": 1.8},
        "recovery":   {"gdp_modifier": 1.0,  "unemployment_modifier": 1.0},
    }

    def advance_economic_cycle(self) -> Optional[str]:
        """Transition to the next cycle phase every 200 ticks.

        Returns the new phase name if a transition occurred, else None.
        """
        tick = int(getattr(self, "current_tick", 0))
        cycle = self.economic_cycle
        if tick - cycle.started_tick < 200:
            return None
        order = self._CYCLE_ORDER
        idx = order.index(cycle.phase) if cycle.phase in order else 0
        new_phase = order[(idx + 1) % len(order)]
        params = self._CYCLE_PARAMS[new_phase]
        self.economic_cycle = EconomicCycle(
            phase=new_phase,
            gdp_modifier=params["gdp_modifier"],
            unemployment_modifier=params["unemployment_modifier"],
            started_tick=tick,
        )
        return new_phase

    def seasonal_income_modifier(self, occupation: str = "") -> float:
        """Return income modifier based on current season and occupation.

        Spring/summer → farmers produce more (+15%).
        Winter → shopkeepers earn more (+10%).
        Other combinations → 1.0 (no change).
        """
        season = str(getattr(self, "season", "spring")).lower()
        if hasattr(self.season, "value"):
            season = self.season.value
        if season in ("spring", "summer") and occupation == "farmer":
            return 1.15
        if season == "winter" and occupation == "shopkeeper":
            return 1.10
        return 1.0

    def apply_cycle_effects(self) -> list[str]:
        """Apply economic cycle effects: mood, crime probability, job seeking."""
        events: list[str] = []
        phase = self.economic_cycle.phase

        if phase == "depression":
            for agent in self.agents:
                if self.rng.random() < 0.08:
                    self.shift_resident_mood(agent.resident, -1, "economy_depression")
            events.append("经济萧条持续，居民情绪低落。")
        elif phase == "boom":
            for agent in self.agents:
                if self.rng.random() < 0.06:
                    self.shift_resident_mood(agent.resident, 1, "economy_boom")
            events.append("经济繁荣，居民消费意愿旺盛。")

        return events

    def get_economy_cycle_overview(self) -> dict:
        """Return economic cycle data for the API."""
        cycle = self.economic_cycle
        tick = int(getattr(self, "current_tick", 0))
        ticks_in_phase = tick - cycle.started_tick
        ticks_remaining = max(0, 200 - ticks_in_phase)
        order = self._CYCLE_ORDER
        idx = order.index(cycle.phase) if cycle.phase in order else 0
        next_phase = order[(idx + 1) % len(order)]

        return {
            "phase": cycle.phase,
            "gdp_modifier": cycle.gdp_modifier,
            "unemployment_modifier": cycle.unemployment_modifier,
            "started_tick": cycle.started_tick,
            "ticks_in_phase": ticks_in_phase,
            "ticks_remaining": ticks_remaining,
            "next_phase": next_phase,
            "seasonal_modifier": self.seasonal_income_modifier(),
            "gdp_history": list(self.gdp_history)[-30:],
        }

    # ------------------------------------------------------------------
    # Town level / milestone system
    # ------------------------------------------------------------------

    _LEVEL_THRESHOLDS = [
        # (level, min_rating)
        (1, 0.0), (2, 0.15), (3, 0.25), (4, 0.35), (5, 0.45),
        (6, 0.55), (7, 0.65), (8, 0.75), (9, 0.85), (10, 0.95),
    ]

    @staticmethod
    def _default_milestones() -> "List[Milestone]":
        return [
            Milestone(id="pop10", name="小有人气", description="人口达到10人", condition="population>=10", unlocks=["market", "shopkeeper"]),
            Milestone(id="happy07", name="和谐小镇", description="平均幸福度>0.7", condition="happiness>0.7", unlocks=["park", "artist"]),
            Milestone(id="gdp5000", name="经济腾飞", description="GDP超过5000", condition="gdp>=5000", unlocks=["luxury_home", "banker"]),
            Milestone(id="safe09", name="安全之城", description="治安评分>0.9", condition="safety>0.9", unlocks=["concert_hall", "musician"]),
            Milestone(id="edu05", name="书香门第", description="平均教育水平>0.5", condition="education>0.5", unlocks=["university", "professor"]),
            Milestone(id="culture06", name="文化兴盛", description="文化繁荣度>0.6", condition="culture>0.6", unlocks=["museum", "curator"]),
            Milestone(id="pop25", name="繁华都市", description="人口达到25人", condition="population>=25", unlocks=["hospital", "stadium"]),
            Milestone(id="gdp15000", name="黄金时代", description="GDP超过15000", condition="gdp>=15000", unlocks=["skyscraper", "ceo"]),
        ]

    def compute_town_rating(self) -> dict:
        """Compute a composite 0..1 rating from key indicators."""
        pop = len(self.agents)
        pop_score = min(1.0, pop / 30.0)

        moods = [self.mood_score(a.resident.mood) for a in self.agents] if self.agents else [0.0]
        happiness = (sum(moods) / len(moods) + 1.0) / 2.0  # normalize -1..1 to 0..1

        gdp = float(getattr(self, "economic_output", 0.0))
        gdp_score = min(1.0, gdp / 20000.0)

        safety_scores = [float(getattr(a.resident, "safety_feeling", 1.0)) for a in self.agents]
        safety = sum(safety_scores) / len(safety_scores) if safety_scores else 1.0

        edu_scores = []
        for a in self.agents:
            kl = getattr(getattr(a.resident, "education", None), "knowledge_level", {}) or {}
            if kl:
                edu_scores.append(sum(kl.values()) / len(kl))
        education = sum(edu_scores) / len(edu_scores) if edu_scores else 0.0

        culture = min(1.0, len(getattr(self, "cultural_events", [])) / 20.0)

        composite = round(
            pop_score * 0.20
            + happiness * 0.20
            + gdp_score * 0.20
            + safety * 0.15
            + education * 0.15
            + culture * 0.10,
            3,
        )
        return {
            "composite": composite,
            "population": round(pop_score, 3),
            "happiness": round(happiness, 3),
            "economy": round(gdp_score, 3),
            "safety": round(safety, 3),
            "education": round(education, 3),
            "culture": round(culture, 3),
        }

    def check_milestones(self) -> list[str]:
        """Check milestone conditions and return newly achieved milestone names."""
        pop = len(self.agents)
        gdp = float(getattr(self, "economic_output", 0.0))
        rating = self.compute_town_rating()
        tick = int(getattr(self, "current_tick", 0))

        newly_achieved: list[str] = []
        for ms in self.milestones:
            if ms.achieved:
                continue
            achieved = False
            if ms.id == "pop10" and pop >= 10:
                achieved = True
            elif ms.id == "happy07" and rating["happiness"] > 0.7:
                achieved = True
            elif ms.id == "gdp5000" and gdp >= 5000:
                achieved = True
            elif ms.id == "safe09" and rating["safety"] > 0.9:
                achieved = True
            elif ms.id == "edu05" and rating["education"] > 0.5:
                achieved = True
            elif ms.id == "culture06" and rating["culture"] > 0.6:
                achieved = True
            elif ms.id == "pop25" and pop >= 25:
                achieved = True
            elif ms.id == "gdp15000" and gdp >= 15000:
                achieved = True

            if achieved:
                ms.achieved = True
                ms.achieved_tick = tick
                self.unlocks.extend(ms.unlocks)
                newly_achieved.append(ms.name)

        return newly_achieved

    def update_town_level(self) -> Optional[int]:
        """Recalculate town level based on composite rating. Returns new level if changed."""
        rating = self.compute_town_rating()["composite"]
        old_level = self.town_level
        new_level = 1
        for level, threshold in self._LEVEL_THRESHOLDS:
            if rating >= threshold:
                new_level = level
        self.town_level = new_level
        return new_level if new_level != old_level else None

    def get_town_level_overview(self) -> dict:
        """Return town level data for the API."""
        rating = self.compute_town_rating()
        next_threshold = 1.0
        for level, threshold in self._LEVEL_THRESHOLDS:
            if level == self.town_level + 1:
                next_threshold = threshold
                break

        return {
            "level": self.town_level,
            "rating": rating,
            "next_level_threshold": next_threshold,
            "milestones": [
                {
                    "id": ms.id,
                    "name": ms.name,
                    "description": ms.description,
                    "achieved": ms.achieved,
                    "achieved_tick": ms.achieved_tick,
                    "unlocks": ms.unlocks,
                }
                for ms in self.milestones
            ],
            "unlocks": list(self.unlocks),
        }

    def get_building_upgrade_cost(self, building: Building) -> float:
        return float(_BUILDING_UPGRADE_COSTS.get(building.level, 0.0))

    def get_building_special_feature(self, building: Building) -> str | None:
        if building.level < 3:
            return None
        return _BUILDING_SPECIAL_FEATURES.get(building.type)

    def can_upgrade_building(self, building: Building, town_funds: float, vote_passed: bool) -> bool:
        if building.level >= 3:
            return False
        if not vote_passed:
            return False
        return float(town_funds) >= self.get_building_upgrade_cost(building)

    def upgrade_building(self, building_id: str, *, town_funds: float, vote_passed: bool) -> bool:
        building = self.get_building(building_id)
        if building is None or not self.can_upgrade_building(building, town_funds, vote_passed):
            return False

        if building.level == 1:
            building.level = 2
            building.capacity = max(building.capacity + 1, math.ceil(building.capacity * 1.5))
            if "expanded" not in building.upgrades:
                building.upgrades.append("expanded")
            return True

        if building.level == 2:
            building.level = 3
            if "luxury" not in building.upgrades:
                building.upgrades.append("luxury")
            return True

        return False

    def decorate_home(self, resident: Resident, effort: float = 0.12) -> bool:
        home_id = resident.home_building_id or resident.location
        if not home_id:
            return False
        building = self.get_building(home_id)
        if building is None or building.type not in {"home", "house", "residence"}:
            return False

        next_score = min(1.0, round(float(building.decoration_score) + max(0.02, effort), 3))
        if next_score <= building.decoration_score:
            return False
        building.decoration_score = next_score
        return True

    def get_building_visit_willingness(self, resident: Resident, building: Building) -> float:
        base = 0.2
        if building.type in {"home", "house", "residence"}:
            if resident.home_building_id == building.id:
                base = 0.58
            else:
                base = 0.18
            base += float(building.decoration_score) * 0.45
        elif building.type in {"cafe", "park", "shop"}:
            base += 0.08
        return max(0.0, min(1.0, round(base, 3)))

    def get_safe_shelter(self, resident: Resident, blocked_buildings: List[str] | set[str]) -> Building | None:
        blocked = set(blocked_buildings)
        home_id = getattr(resident, "home_building_id", None)
        if home_id and home_id not in blocked:
            home = self.get_building(home_id)
            if home is not None and len(self.get_occupants(home.id)) < home.capacity:
                return home

        priority = {
            "hospital": 0,
            "clinic": 1,
            "school": 2,
            "plaza": 3,
            "park": 4,
            "home": 5,
            "house": 5,
            "residence": 5,
            "cafe": 6,
        }
        candidates = sorted(
            (
                building
                for building in self.buildings
                if building.id not in blocked and len(self.get_occupants(building.id)) < max(1, building.capacity)
            ),
            key=lambda building: (
                priority.get(building.type, 10),
                math.dist((resident.x, resident.y), building.position),
                building.id,
            ),
        )
        return candidates[0] if candidates else None

    def apply_disaster_damage(self, building_id: str, severity: float) -> dict[str, object]:
        building = self.get_building(building_id)
        if building is None:
            return {}

        severity = max(0.0, min(1.0, float(severity)))
        previous_level = int(getattr(building, "level", 1))
        previous_capacity = int(getattr(building, "capacity", 1))
        previous_decoration = float(getattr(building, "decoration_score", 0.0))
        destroyed = severity >= 0.92
        level_loss = 2 if severity >= 0.9 and previous_level >= 3 else 1 if severity >= 0.45 and previous_level > 1 else 0

        if level_loss > 0:
            building.level = max(1, previous_level - level_loss)
        capacity_factor = 0.35 if destroyed else max(0.45, 1.0 - severity * 0.45)
        building.capacity = max(1, int(math.floor(previous_capacity * capacity_factor)))
        building.decoration_score = round(max(0.0, previous_decoration - severity * 0.55), 3)

        if "damaged" not in building.upgrades:
            building.upgrades.append("damaged")
        if destroyed and "ruined" not in building.upgrades:
            building.upgrades.append("ruined")

        return {
            "building_id": building.id,
            "previous_level": previous_level,
            "new_level": building.level,
            "previous_capacity": previous_capacity,
            "new_capacity": building.capacity,
            "previous_decoration_score": round(previous_decoration, 3),
            "new_decoration_score": round(building.decoration_score, 3),
            "destroyed": destroyed,
            "rebuild_cost": round(max(8.0, previous_capacity * (12.0 if destroyed else 7.5) * max(0.35, severity)), 2),
        }

    def evacuate_residents_from_buildings(self, building_ids: List[str], severity: float) -> List[dict[str, object]]:
        blocked = set(building_ids)
        rescue_workers = [
            agent
            for agent in self.agents
            if getattr(agent.resident, "occupation", "") in {"doctor", "emergency"}
            and agent.resident.location not in blocked
        ]
        rescue_modifier = max(0.5, 1.0 - min(0.35, len(rescue_workers) * 0.08))
        for worker in rescue_workers:
            worker.resident.current_goal = "参与应急救援"

        evacuations: List[dict[str, object]] = []
        for agent in self.agents:
            resident = agent.resident
            if resident.location not in blocked:
                continue

            shelter = self.get_safe_shelter(resident, blocked)
            previous_location = resident.location
            if shelter is not None:
                self.enter_building(agent, shelter)
            else:
                resident.location = None
                resident.x = max(0, resident.x - 1)
                resident.y = max(0, resident.y - 1)

            health_penalty = round((0.08 + severity * 0.22) * rescue_modifier, 3)
            self._ensure_resident_health(resident)
            resident.health.hp = round(max(0.1, resident.health.hp - health_penalty), 3)
            if severity >= 0.4:
                self.infect_resident(
                    resident,
                    "injury",
                    severity=min(0.85, 0.2 + severity * 0.5),
                    recovery_ticks=max(8, int(6 + severity * 12)),
                )
            self.shift_resident_mood(resident, -2 if severity >= 0.65 else -1, "disaster")
            resident.current_goal = "撤离到安全区域"

            evacuations.append(
                {
                    "resident_id": resident.id,
                    "from_building": previous_location,
                    "to_building": None if shelter is None else shelter.id,
                    "rescued_by": [worker.resident.id for worker in rescue_workers[:2]],
                }
            )

        return evacuations

    def rebuild_disaster_damage(self, building_id: str, damage_report: dict[str, object], reserve_budget: float) -> float:
        building = self.get_building(building_id)
        if building is None or not damage_report:
            return 0.0

        available = max(0.0, float(reserve_budget))
        required = float(damage_report.get("rebuild_cost", 0.0))
        spent = min(available, required)
        if spent <= 0:
            return 0.0

        recovery_ratio = min(1.0, spent / max(required, 1.0))
        previous_level = int(damage_report.get("previous_level", building.level))
        previous_capacity = int(damage_report.get("previous_capacity", building.capacity))
        previous_decoration = float(damage_report.get("previous_decoration_score", building.decoration_score))

        if recovery_ratio >= 0.6:
            building.level = max(building.level, previous_level)
            building.capacity = max(building.capacity, previous_capacity)
        else:
            building.capacity = max(building.capacity, int(math.ceil(previous_capacity * (0.6 + recovery_ratio * 0.3))))

        building.decoration_score = round(max(building.decoration_score, previous_decoration * recovery_ratio * 0.7), 3)
        building.upgrades = [upgrade for upgrade in building.upgrades if upgrade not in {"damaged", "ruined"}]
        return round(spent, 2)

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

    def _road_key(self, from_building: str, to_building: str) -> tuple[str, str]:
        return tuple(sorted((from_building, to_building)))

    def _distance_between_buildings(self, left: Building, right: Building) -> float:
        return round(math.dist(left.position, right.position), 2)

    def _road_type_for_distance(self, distance: float) -> str:
        if distance >= 14:
            return "carriage_route"
        if distance >= 8:
            return "avenue"
        return "street"

    def generate_road_network(self) -> None:
        if len(self.buildings) < 2:
            self.roads = []
            return

        next_roads: dict[tuple[str, str], Road] = {}
        for building in self.buildings:
            others = sorted(
                (other for other in self.buildings if other.id != building.id),
                key=lambda other: (self._distance_between_buildings(building, other), other.id),
            )
            for other in others[:2]:
                key = self._road_key(building.id, other.id)
                if key in next_roads:
                    continue
                distance = self._distance_between_buildings(building, other)
                next_roads[key] = Road(
                    from_building=key[0],
                    to_building=key[1],
                    distance=distance,
                    road_type=self._road_type_for_distance(distance),
                    traffic=int(self.road_usage.get(key, 0)),
                )

        anchor = self.buildings[0]
        for building in self.buildings[1:]:
            key = self._road_key(anchor.id, building.id)
            if key not in next_roads:
                distance = self._distance_between_buildings(anchor, building)
                next_roads[key] = Road(
                    from_building=key[0],
                    to_building=key[1],
                    distance=distance,
                    road_type=self._road_type_for_distance(distance),
                    traffic=int(self.road_usage.get(key, 0)),
                )

        self.roads = sorted(next_roads.values(), key=lambda road: (road.from_building, road.to_building))

    def get_road_network(self) -> List[Road]:
        if not self.roads and len(self.buildings) >= 2:
            self.generate_road_network()
        return list(self.roads)

    def find_road_between(self, from_building: str, to_building: str) -> Optional[Road]:
        key = self._road_key(from_building, to_building)
        for road in self.get_road_network():
            if self._road_key(road.from_building, road.to_building) == key:
                road.traffic = int(self.road_usage.get(key, 0))
                return road
        return None

    def _resolve_building(self, building_or_id: Building | str | None) -> Optional[Building]:
        if isinstance(building_or_id, Building):
            return building_or_id
        if isinstance(building_or_id, str):
            return self.get_building(building_or_id)
        return None

    def choose_transport_mode(self, resident: Resident, from_building: Building | str | None, to_building: Building | str | None) -> TransportMode:
        start = self._resolve_building(from_building)
        end = self._resolve_building(to_building)
        if start is None or end is None:
            return TransportMode.walk
        distance = self._distance_between_buildings(start, end)
        has_bicycle = any(item.name == "bicycle" and item.quantity > 0 for item in resident.inventory)
        if distance >= 14:
            return TransportMode.cart
        if has_bicycle and distance >= 5:
            return TransportMode.bicycle
        return TransportMode.walk

    def compute_travel_steps(self, resident: Resident, road: Road | None) -> int:
        mode = getattr(resident, "transport_mode", TransportMode.walk)
        if isinstance(mode, str):
            mode = TransportMode(mode)
        base_steps = 2
        if mode is TransportMode.bicycle:
            base_steps *= 2
        elif mode is TransportMode.cart:
            base_steps *= 3
        key = self._road_key(road.from_building, road.to_building) if road is not None else None
        traffic = int(self.road_usage.get(key, 0)) if key is not None else 0
        slowdown = 1.0
        if traffic >= 3:
            slowdown = max(0.45, 1.0 - min(0.6, (traffic - 2) * 0.15))
        return max(1, int(math.floor(base_steps * slowdown)))

    def estimate_travel_ticks(
        self,
        resident: Resident,
        from_location: tuple[int, int] | Building | str | None,
        to_location: tuple[int, int] | Building | str | None,
    ) -> int:
        from_building = self._resolve_building(from_location if not isinstance(from_location, tuple) else self.get_building_at_position(*from_location))
        to_building = self._resolve_building(to_location if not isinstance(to_location, tuple) else self.get_building_at_position(*to_location))
        if from_building is None and isinstance(from_location, tuple) and to_building is None and isinstance(to_location, tuple):
            distance = math.dist(from_location, to_location)
            return max(1, math.ceil(distance / 2))
        if from_building is None or to_building is None:
            return 1
        road = self.find_road_between(from_building.id, to_building.id)
        if road is None:
            distance = self._distance_between_buildings(from_building, to_building)
            road = Road(from_building=from_building.id, to_building=to_building.id, distance=distance, road_type=self._road_type_for_distance(distance))
        resident.transport_mode = self.choose_transport_mode(resident, from_building, to_building)
        steps = self.compute_travel_steps(resident, road)
        return max(1, math.ceil(max(road.distance, 1.0) / max(1, steps)))

    def record_road_usage(self, road: Road | None, resident_id: str) -> None:
        if road is None:
            return
        key = self._road_key(road.from_building, road.to_building)
        self.road_usage[key] = int(self.road_usage.get(key, 0)) + 1
        road.traffic = self.road_usage[key]

    def get_transport_overview(
        self,
        resident: Resident | None = None,
        from_building_id: str | None = None,
        to_building_id: str | None = None,
    ) -> dict:
        roads = [
            {
                "from_building": road.from_building,
                "to_building": road.to_building,
                "distance": road.distance,
                "road_type": road.road_type,
                "traffic": int(self.road_usage.get(self._road_key(road.from_building, road.to_building), 0)),
            }
            for road in self.get_road_network()
        ]
        stats = dict(self.last_transport_stats)
        stats["mode_share"] = dict(stats.get("mode_share", {}))
        stats["congestion_hotspots"] = list(stats.get("congestion_hotspots", []))
        if resident is not None and from_building_id and to_building_id:
            mode = self.choose_transport_mode(resident, from_building_id, to_building_id)
            stats["mode_share"][mode.value] = stats["mode_share"].get(mode.value, 0) + 1
        return {"roads": roads, "stats": stats}

    def _refresh_transport_stats(self) -> None:
        hotspots = []
        for road in self.get_road_network():
            key = self._road_key(road.from_building, road.to_building)
            traffic = int(self.road_usage.get(key, 0))
            road.traffic = traffic
            if traffic >= 2:
                hotspots.append(
                    {
                        "road_key": f"{key[0]}:{key[1]}",
                        "traffic": traffic,
                        "slowdown": round(min(0.6, max(0.0, (traffic - 1) * 0.15)), 3),
                    }
                )
        trip_samples = []
        for agent in self.agents:
            resident = agent.resident
            origin = self.get_building(resident.location) if resident.location is not None else self.get_building(resident.home_building_id) or self.get_building_at_position(resident.x, resident.y)
            if origin is None:
                continue
            nearest = min(
                (building for building in self.buildings if building.id != origin.id),
                default=None,
                key=lambda building: self._distance_between_buildings(origin, building),
            )
            if nearest is None:
                continue
            trip_samples.append(self.estimate_travel_ticks(resident, origin, nearest))
        self.last_transport_stats = {
            "mode_share": dict(self.transport_mode_usage),
            "average_travel_ticks": round(sum(trip_samples) / len(trip_samples), 2) if trip_samples else 0.0,
            "congestion_hotspots": hotspots,
        }

    # ------------------------------------------------------------------
    # Building management
    # ------------------------------------------------------------------

    def add_building(self, building: Building) -> None:
        """Register a building in the world."""
        self.buildings.append(building)
        if building.type == "school":
            for agent in self.agents:
                self.ensure_resident_education(agent.resident)
        self.generate_road_network()

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

    def _ensure_resident_artistic_talent(self, resident: Resident) -> None:
        try:
            current_value = float(getattr(resident, "artistic_talent", 0.0))
        except (TypeError, ValueError):
            current_value = 0.0
        if current_value > 0.0:
            resident.artistic_talent = round(min(1.0, current_value), 4)
            return
        checksum = sum(ord(char) for char in f"{resident.id}:{resident.name}")
        resident.artistic_talent = round(0.2 + (checksum % 76) / 100, 4)

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

    def public_culture_venues(self) -> List[Building]:
        return [building for building in self.buildings if building.type != "home"]

    def eligible_culture_organizers(self) -> List[Agent]:
        eligible: List[Agent] = []
        for agent in self.agents:
            self._ensure_resident_artistic_talent(agent.resident)
            art_skill = float(agent.resident.skills.get("art", 0.0))
            art_knowledge = float(agent.resident.education.knowledge_level.get("art", 0.0))
            if art_skill >= 0.45 or art_knowledge >= 0.65:
                eligible.append(agent)
        return eligible

    def _culture_event_type_for_agent(self, agent: Agent) -> str:
        event_types = tuple(_CULTURAL_EVENT_NAMES)
        checksum = sum(ord(char) for char in f"{agent.resident.id}:{self.current_tick}")
        return event_types[checksum % len(event_types)]

    def _culture_event_quality(self, agent: Agent) -> float:
        self._ensure_resident_artistic_talent(agent.resident)
        return min(
            1.0,
            float(agent.resident.artistic_talent) * 0.5
            + float(agent.resident.skills.get("art", 0.0)) * 0.3
            + float(agent.resident.education.knowledge_level.get("art", 0.0)) * 0.2,
        )

    def _culture_interest_score(self, organizer: Agent, candidate: Agent, quality: float) -> float:
        if organizer.resident.id == candidate.resident.id:
            return 2.0 + quality
        relationship = self.get_relationship(organizer.resident.id, candidate.resident.id)
        inverse = self.get_relationship(candidate.resident.id, organizer.resident.id)
        friendship = max(
            relationship.intensity if relationship is not None else 0.0,
            inverse.intensity if inverse is not None else 0.0,
        )
        return (
            quality * 1.2
            + float(candidate.resident.skills.get("art", 0.0)) * 0.3
            + float(candidate.resident.education.knowledge_level.get("art", 0.0)) * 0.2
            + friendship * 0.5
            + self._extroversion(candidate.resident.personality) * 0.2
        )

    def maybe_create_cultural_event(self) -> Optional[CulturalEvent]:
        venues = self.public_culture_venues()
        organizers = self.eligible_culture_organizers()
        if not venues or not organizers:
            return None
        if any(self.current_tick < event.tick_start + event.duration for event in self.cultural_events):
            return None

        organizer = max(organizers, key=self._culture_event_quality)
        venue = max(venues, key=lambda building: (building.capacity, -sum(building.position)))
        quality = self._culture_event_quality(organizer)
        participant_count = max(2, min(len(self.agents), 2 + int(round(quality * max(1, len(self.agents) - 1)))))
        participants = [
            agent.resident.id
            for agent in sorted(
                self.agents,
                key=lambda candidate: self._culture_interest_score(organizer, candidate, quality),
                reverse=True,
            )[:participant_count]
        ]
        if organizer.resident.id not in participants:
            participants.insert(0, organizer.resident.id)

        event_type = self._culture_event_type_for_agent(organizer)
        event = CulturalEvent(
            type=event_type,
            name=_CULTURAL_EVENT_NAMES[event_type],
            venue_id=venue.id,
            organizer_id=organizer.resident.id,
            participants=participants,
            tick_start=self.current_tick,
            duration=max(4, self.config.tick_per_day // 6),
        )
        self.cultural_events.append(event)
        self.cultural_events = self.cultural_events[-30:]

        for participant_id in participants:
            participant = next((agent for agent in self.agents if agent.resident.id == participant_id), None)
            if participant is None:
                continue
            participant.resident.education.knowledge_level["art"] = round(
                min(1.0, float(participant.resident.education.knowledge_level.get("art", 0.0)) + 0.05),
                4,
            )
            self.shift_resident_mood(participant, 1, "culture")

        self.culture_prosperity_history.append(
            {
                "tick": self.current_tick,
                "prosperity_index": self.culture_prosperity_index(),
            }
        )
        self.culture_prosperity_history = self.culture_prosperity_history[-60:]
        return event

    def update_cultural_events(self) -> List[EventUpdate]:
        updates: List[EventUpdate] = []
        if self.current_tick % max(12, self.config.tick_per_day // 2) == 0:
            event = self.maybe_create_cultural_event()
            if event is not None:
                updates.append(EventUpdate(description=f"{event.name} 在 {event.venue_id} 开始了。"))

        active_cutoff = self.current_tick - self.config.tick_per_day * 7
        self.cultural_events = [
            event
            for event in self.cultural_events
            if event.tick_start + event.duration >= active_cutoff
        ]
        return updates

    def culture_prosperity_index(self) -> float:
        if not self.cultural_events or not self.agents:
            return 0.0
        recent_cutoff = self.current_tick - self.config.tick_per_day * 7
        recent_events = [event for event in self.cultural_events if event.tick_start >= recent_cutoff]
        if not recent_events:
            recent_events = list(self.cultural_events[-5:])
        event_frequency = min(1.0, len(recent_events) / 8)
        participation_rate = sum(len(event.participants) for event in recent_events) / (len(recent_events) * max(1, len(self.agents)))
        organizer_quality = 0.0
        for event in recent_events:
            organizer = next((agent for agent in self.agents if agent.resident.id == event.organizer_id), None)
            if organizer is not None:
                organizer_quality += self._culture_event_quality(organizer)
        organizer_quality = organizer_quality / max(1, len(recent_events))
        return round(min(1.0, event_frequency * 0.45 + participation_rate * 0.4 + organizer_quality * 0.15), 4)

    def culture_talent_rankings(self) -> List[dict]:
        rankings = []
        for agent in self.agents:
            self._ensure_resident_artistic_talent(agent.resident)
            rankings.append(
                {
                    "resident_id": agent.resident.id,
                    "resident_name": agent.resident.name,
                    "artistic_talent": round(float(agent.resident.artistic_talent), 4),
                    "art_skill": round(float(agent.resident.skills.get("art", 0.0)), 4),
                    "art_knowledge": round(float(agent.resident.education.knowledge_level.get("art", 0.0)), 4),
                }
            )
        rankings.sort(
            key=lambda row: row["artistic_talent"] * 0.55 + row["art_skill"] * 0.3 + row["art_knowledge"] * 0.15,
            reverse=True,
        )
        return rankings[:10]

    def get_culture_overview(self) -> dict:
        return {
            "events": [
                {
                    "type": event.type,
                    "name": event.name,
                    "venue_id": event.venue_id,
                    "organizer_id": event.organizer_id,
                    "participants": list(event.participants),
                    "tick_start": event.tick_start,
                    "duration": event.duration,
                }
                for event in sorted(self.cultural_events, key=lambda item: item.tick_start, reverse=True)[:20]
            ],
            "prosperity_index": self.culture_prosperity_index(),
            "prosperity_history": list(self.culture_prosperity_history[-30:]),
            "talent_rankings": self.culture_talent_rankings(),
        }

    def holy_site_buildings(self) -> List[Building]:
        return [building for building in self.buildings if building.type in _HOLY_SITE_TYPES]

    def holy_site_for_resident(self, resident: Resident) -> Building | None:
        self._ensure_resident_religion(resident)
        holy_sites = self.holy_site_buildings()
        if not holy_sites:
            return None
        preferred_type = _RELIGION_SITE_TYPES.get(resident.religion.value if isinstance(resident.religion, Religion) else str(resident.religion))
        preferred = next((building for building in holy_sites if building.type == preferred_type), None)
        return preferred or holy_sites[0]

    def religious_leaders(self) -> List[Agent]:
        leaders: List[Agent] = []
        for agent in self.agents:
            self._ensure_resident_religion(agent.resident)
            self._ensure_resident_reputation(agent.resident)
            if agent.resident.religion is Religion.none:
                continue
            if agent.resident.piety >= 0.75 and agent.resident.reputation >= 0.35:
                leaders.append(agent)
        leaders.sort(
            key=lambda agent: (agent.resident.piety * 0.65 + agent.resident.reputation * 0.35),
            reverse=True,
        )
        return leaders

    def morality_index(self) -> float:
        if not self.agents:
            return 0.0
        return round(
            sum(float(agent.resident.morality_score) for agent in self.agents) / len(self.agents),
            4,
        )

    def religion_distribution(self) -> List[dict]:
        counts = {religion.value: 0 for religion in Religion}
        for agent in self.agents:
            self._ensure_resident_religion(agent.resident)
            counts[agent.resident.religion.value] = counts.get(agent.resident.religion.value, 0) + 1
        total = max(1, len(self.agents))
        rows = [
            {
                "religion": religion,
                "label": _RELIGION_LABELS.get(religion, religion),
                "count": count,
                "share": round(count / total, 4),
            }
            for religion, count in counts.items()
            if count > 0
        ]
        return sorted(rows, key=lambda item: (-item["count"], item["religion"]))

    def _religious_participant_score(self, leader: Agent, candidate: Agent) -> float:
        relationship = self.get_relationship(leader.resident.id, candidate.resident.id)
        inverse = self.get_relationship(candidate.resident.id, leader.resident.id)
        affinity = max(
            relationship.intensity if relationship is not None else 0.0,
            inverse.intensity if inverse is not None else 0.0,
        )
        same_faith = candidate.resident.religion == leader.resident.religion
        return (
            (1.0 if same_faith else 0.2)
            + float(candidate.resident.piety) * 0.5
            + float(candidate.resident.reputation) * 0.25
            + affinity * 0.35
        )

    def maybe_create_religious_event(self) -> ReligiousEvent | None:
        holy_sites = self.holy_site_buildings()
        if not holy_sites or not self.agents:
            return None

        leaders = self.religious_leaders()
        leader = leaders[0] if leaders else None
        if leader is None:
            believers = [
                agent
                for agent in self.agents
                if agent.resident.religion is not Religion.none
            ]
            if not believers:
                return None
            leader = max(believers, key=lambda agent: (agent.resident.piety, agent.resident.reputation))

        venue = self.holy_site_for_resident(leader.resident)
        if venue is None:
            return None

        religion_key = leader.resident.religion.value
        event_type = "festival" if self.current_tick % max(self.config.tick_per_day * 2, 2) == 0 else "ritual"
        event_name = _RELIGIOUS_EVENT_NAMES.get(religion_key, {}).get(event_type, "信仰仪式")
        faith_members = [
            agent for agent in self.agents
            if agent.resident.religion == leader.resident.religion
        ]
        reach = min(1.0, leader.resident.piety * 0.6 + max(0.0, leader.resident.reputation) * 0.4)
        participant_target = max(2, min(len(faith_members), 2 + int(round(reach * max(1, len(faith_members) - 1)))))
        participants = [
            agent.resident.id
            for agent in sorted(
                faith_members,
                key=lambda candidate: self._religious_participant_score(leader, candidate),
                reverse=True,
            )[:participant_target]
        ]
        if leader.resident.id not in participants:
            participants.insert(0, leader.resident.id)

        town_mood_boost = 0.12 if event_type == "festival" else 0.08
        morality_boost = 0.04 if event_type == "festival" else 0.025
        event = ReligiousEvent(
            religion=religion_key,
            event_type=event_type,
            name=event_name,
            venue_id=venue.id,
            leader_id=leader.resident.id,
            participants=participants,
            tick_start=self.current_tick,
            duration=max(4, self.config.tick_per_day // 6),
            town_mood_boost=town_mood_boost,
            morality_boost=morality_boost,
        )
        self.religious_events.append(event)
        self.religious_events = self.religious_events[-40:]

        for agent in self.agents:
            agent.resident.morality_score = round(
                min(1.0, float(agent.resident.morality_score) + morality_boost * 0.5),
                4,
            )
            self.shift_resident_mood(agent, 1, "religion")
            if agent.resident.id in participants:
                agent.resident.piety = round(min(1.0, float(agent.resident.piety) + 0.06), 4)
                agent.resident.morality_score = round(min(1.0, float(agent.resident.morality_score) + 0.02), 4)

        self.morality_history.append({"tick": self.current_tick, "morality_index": self.morality_index()})
        self.morality_history = self.morality_history[-60:]
        return event

    def update_religious_events(self) -> List[EventUpdate]:
        updates: List[EventUpdate] = []
        if self.current_tick % max(self.config.tick_per_day, 1) == 0:
            event = self.maybe_create_religious_event()
            if event is not None:
                updates.append(EventUpdate(description=f"{event.name} 在 {event.venue_id} 举行。"))
        if self.current_tick % max(8, self.config.tick_per_day // 2) == 0:
            self.morality_history.append({"tick": self.current_tick, "morality_index": self.morality_index()})
            self.morality_history = self.morality_history[-60:]
        active_cutoff = self.current_tick - self.config.tick_per_day * 10
        self.religious_events = [
            event for event in self.religious_events
            if event.tick_start + event.duration >= active_cutoff
        ]
        return updates

    def get_religion_overview(self) -> dict:
        leaders = [
            {
                "resident_id": agent.resident.id,
                "resident_name": agent.resident.name,
                "religion": agent.resident.religion.value,
                "piety": round(float(agent.resident.piety), 4),
                "reputation": round(float(agent.resident.reputation), 4),
            }
            for agent in self.religious_leaders()[:8]
        ]
        return {
            "distribution": self.religion_distribution(),
            "morality_index": self.morality_index(),
            "morality_history": list(self.morality_history[-30:]),
            "events": [
                {
                    "religion": event.religion,
                    "event_type": event.event_type,
                    "name": event.name,
                    "venue_id": event.venue_id,
                    "leader_id": event.leader_id,
                    "participants": list(event.participants),
                    "tick_start": event.tick_start,
                    "duration": event.duration,
                    "town_mood_boost": round(float(event.town_mood_boost), 4),
                    "morality_boost": round(float(event.morality_boost), 4),
                }
                for event in sorted(self.religious_events, key=lambda item: item.tick_start, reverse=True)[:20]
            ],
            "leaders": leaders,
        }

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
            bonus = 0.2
            if building.level >= 3:
                bonus += 0.12
            return bonus
        if building.type in {"home", "house", "residence"}:
            return min(0.18, float(building.decoration_score) * 0.2)
        return 0.0

    def get_social_probability(self, agent_a: Agent, agent_b: Agent) -> float:
        """Return the combined base + building social probability."""
        self._ensure_resident_ageing(agent_a.resident)
        self._ensure_resident_ageing(agent_b.resident)
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
        elder_bonus = 0.0
        if agent_a.resident.age_stage == "elder":
            elder_bonus += 0.05
        if agent_b.resident.age_stage == "elder":
            elder_bonus += 0.05

        extroversion_bonus = ((ext_a + ext_b) / 2) * 0.30
        target_reputation = float(getattr(agent_b.resident, "reputation", 0.0))
        self_reputation = float(getattr(agent_a.resident, "reputation", 0.0))
        reputation_bonus = target_reputation * 0.22
        if target_reputation < 0:
            reputation_bonus += target_reputation * 0.18
        if self_reputation < -0.4:
            reputation_bonus += self_reputation * 0.08
        first_impression = relationship is None or relationship.familiarity < 0.15
        fashion_bonus = (
            self.fashion_social_bonus(agent_a.resident, first_impression=first_impression) * 0.55
            + self.fashion_social_bonus(agent_b.resident, first_impression=first_impression) * 0.45
        )
        probability = (
            0.15
            + extroversion_bonus
            + relation_bonus
            + family_bonus
            + self.get_social_probability_bonus(agent_a, agent_b)
            + social_knowledge * 0.18
            + elder_bonus
            + reputation_bonus
            + fashion_bonus
        )
        if agent_a.resident.mental_state == "depressed":
            probability *= 0.35
        if agent_b.resident.mental_state == "depressed":
            probability *= 0.8
        if self.has_illness(agent_a.resident):
            probability *= 0.5
        if self.has_illness(agent_b.resident):
            probability *= 0.7
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
        self.generate_road_network()
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
            agent._worship_applied_this_stay = False  # type: ignore[attr-defined]
            return

        building = self.get_building(building_id)
        if building is None:
            return
        from engine.lifecycle import is_elderly

        cooking_knowledge = float(agent.resident.education.knowledge_level.get("cooking", 0.0))
        crafting_knowledge = float(agent.resident.education.knowledge_level.get("crafting", 0.0))
        tick_per_day = self.config.tick_per_day
        hour = (self.current_tick % tick_per_day) * 24.0 / tick_per_day
        is_work_hour = self._is_work_hour(hour)
        self._ensure_resident_ageing(agent.resident)
        self._ensure_resident_job(agent.resident)
        self._ensure_resident_health(agent.resident)
        self._ensure_resident_fashion(agent.resident)
        apply_outfit_for_occasion(self, agent.resident)
        illness = agent.resident.health.illness

        if building.type == "home":
            self.set_resident_mood(agent, "neutral", "rest")
            if agent.resident.job.title == "unemployed":
                agent.resident.occupation = "unemployed"
            agent.resident.health.work_streak = 0
            # Recover energy at home
            decoration_bonus = float(getattr(building, "decoration_score", 0.0))
            recovery = (0.025 if is_elderly(agent.resident) else 0.05) + cooking_knowledge * 0.04 + decoration_bonus * 0.03
            agent.resident.energy = min(1.0, agent.resident.energy + recovery)
            self.recover_resident_health(agent.resident, 0.03)
            if decoration_bonus >= 0.25:
                self.shift_resident_mood(agent, 1, "decoration")
            if (
                agent.resident.home_building_id == building.id
                and decoration_bonus < 0.95
                and agent.resident.coins >= 15
                and self.rng.random() < 0.05
            ):
                if self.decorate_home(agent.resident, effort=0.05):
                    agent.resident.coins = max(0, agent.resident.coins - 5)
        elif building.type == "nursing_home":
            self.retire_resident(agent.resident)
            self.recover_resident_health(agent.resident, 0.08, treatment=True)
            agent.resident.energy = min(1.0, agent.resident.energy + 0.06)
            if agent.resident.mood in {"sad", "tired", "fearful"}:
                self.shift_resident_mood(agent, 1, "nursing_home")
        elif building.type == "hospital":
            if agent.resident.job.title == "doctor" or agent.resident.occupation == "doctor":
                self._assign_job_for_building(agent.resident, building)
            doctor_present = any(
                occupant.resident.job.title == "doctor"
                for occupant in self.get_occupants(building.id)
                if occupant is not agent
            ) or agent.resident.job.title == "doctor"
            if illness is not None:
                self.recover_resident_health(agent.resident, 0.06 if doctor_present else 0.035, treatment=True)
                agent.resident.energy = min(1.0, agent.resident.energy + 0.04)
            else:
                self.recover_resident_health(agent.resident, 0.015, treatment=doctor_present)
            if building.level >= 3 and (illness is not None or agent.resident.mood in {"sad", "fearful", "tired"}):
                self.shift_resident_mood(agent, 2, "surgery")
                agent.resident.mental_state = "stable"
        elif building.type == "school":
            if not self.can_resident_work(agent.resident):
                agent.resident.occupation = "student" if agent.resident.age_stage == "child" else agent.resident.occupation
                agent.resident.job.title = agent.resident.occupation
                self.teach_course(agent)
                agent.resident.energy = max(0.0, agent.resident.energy - 0.01)
            elif is_work_hour:
                work_profile = _BUILDING_WORK_MAP[building.type]
                skill_name = work_profile["skill"]
                current_skill = float(agent.resident.skills.get(skill_name, 0.0))
                self._assign_job_for_building(agent.resident, building)
                agent.resident.health.work_streak += 1
                already_paid: bool = getattr(agent, "_paid_this_stay", False)
                if not already_paid:
                    bonus_income = round(current_skill * work_profile["base_income"])
                    gross_income = work_profile["base_income"] + bonus_income
                    cycle_mod = self.economic_cycle.gdp_modifier * self.seasonal_income_modifier(work_profile.get("occupation", ""))
                    earned_income = max(1, round(gross_income * self.health_work_efficiency(agent.resident) * cycle_mod))
                    agent.resident.coins += earned_income
                    agent.resident.wallet = round(agent.resident.wallet + float(earned_income), 2)
                    self._register_gdp(float(earned_income))
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
                if building.level >= 3:
                    growth += 0.01
                    knowledge = float(agent.resident.education.knowledge_level.get(skill_name, 0.0))
                    agent.resident.education.knowledge_level[skill_name] = round(min(1.0, knowledge + 0.025), 4)
                agent.resident.skills[skill_name] = round(min(1.0, current_skill + growth), 4)
                agent.resident.energy = max(0.0, agent.resident.energy - 0.03)
                agent.resident.job.satisfaction = self._job_satisfaction(agent.resident)
            elif agent.resident.education.courses:
                self.teach_course(agent)
            else:
                agent.resident.health.work_streak = 0
        elif building.type in _HOLY_SITE_TYPES:
            self._ensure_resident_religion(agent.resident)
            preferred_site = self.holy_site_for_resident(agent.resident)
            if agent.resident.religion is not Religion.none and preferred_site is not None and preferred_site.id == building.id:
                already_worshipped: bool = getattr(agent, "_worship_applied_this_stay", False)
                if not already_worshipped:
                    self.shift_resident_mood(agent, 1, "worship")
                    agent.resident.piety = round(min(1.0, float(agent.resident.piety) + 0.08), 4)
                    agent.resident.morality_score = round(min(1.0, float(agent.resident.morality_score) + 0.03), 4)
                    if agent in self.religious_leaders():
                        agent.resident.occupation = "clergy"
                        if agent.resident.job.title == "unemployed":
                            agent.resident.job.title = "clergy"
                    agent._worship_applied_this_stay = True  # type: ignore[attr-defined]
                agent.resident.energy = max(0.0, agent.resident.energy - 0.01)
            agent.resident.health.work_streak = 0
        elif building.type in _BUILDING_WORK_MAP:
            if not self.can_resident_work(agent.resident):
                if agent.resident.age_stage == "child":
                    agent.resident.occupation = "student"
                    agent.resident.job.title = "student"
                else:
                    self.retire_resident(agent.resident)
                agent.resident.health.work_streak = 0
                agent.resident.energy = max(0.0, agent.resident.energy - 0.005)
                self._purchase_for_resident(agent.resident)
                return
            work_profile = _BUILDING_WORK_MAP[building.type]
            skill_name = work_profile["skill"]
            current_skill = float(agent.resident.skills.get(skill_name, 0.0))
            self._assign_job_for_building(agent.resident, building)
            if is_work_hour:
                agent.resident.health.work_streak += 1
            else:
                agent.resident.health.work_streak = 0
            # Pay once per stay, not every tick
            already_paid: bool = getattr(agent, "_paid_this_stay", False)
            if not already_paid:
                if is_work_hour:
                    bonus_income = round(current_skill * work_profile["base_income"])
                    gross_income = work_profile["base_income"] + bonus_income
                    cycle_mod = self.economic_cycle.gdp_modifier * self.seasonal_income_modifier(work_profile.get("occupation", ""))
                    earned_income = max(1, round(gross_income * self.health_work_efficiency(agent.resident) * cycle_mod))
                    agent.resident.coins += earned_income
                    agent.resident.wallet = round(agent.resident.wallet + float(earned_income), 2)
                    self._register_gdp(float(earned_income))
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
            if building.type == "shop" and is_work_hour and agent.resident.job.title == "tailor":
                maybe_tailor_design(self, agent)
            growth = 0.015 if current_skill < 0.6 else 0.008 if current_skill < 0.85 else 0.003
            if building.type == "cafe" and building.level >= 3 and len(self.get_occupants(building.id)) >= 3:
                growth += 0.005
                self.shift_resident_mood(agent, 1, "banquet")
            agent.resident.skills[skill_name] = round(min(1.0, current_skill + growth), 4)
            # Work drains energy every tick
            agent.resident.energy = max(0.0, agent.resident.energy - 0.03)
            agent.resident.job.satisfaction = self._job_satisfaction(agent.resident)
            if agent.resident.job.satisfaction < 0.2:
                agent.resident.job = Job()
                agent.resident.occupation = "unemployed"
                self.shift_resident_mood(agent, -1, "job")
            self._purchase_for_resident(agent.resident)
        else:
            agent.resident.health.work_streak = 0

        if agent.resident.health.work_streak >= 50:
            self.infect_resident(agent.resident, "exhaustion")

    def building_stay_duration(self) -> int:
        """Return the random number of ticks an agent stays indoors."""
        return self.rng.randint(3, 8)

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
        self._ensure_resident_religion(resident)
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
        morality = float(getattr(resident, "morality_score", 0.5))
        pressure -= morality * 0.22
        if morality < 0.35:
            pressure += (0.35 - morality) * 0.4
        pressure -= float(getattr(resident, "piety", 0.0)) * 0.08
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
            self._ensure_resident_religion(resident)
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
            if self.rng.random() >= pressure:
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
                crime_type = "conflict" if self.rng.random() < 0.5 else "theft"
            elif float(resident.morality_score) < 0.2:
                crime_type = "fraud"
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
                self.infect_resident(victim.resident, "injury")
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
        movement_candidates = {agent.resident.id for agent in self.agents if agent.resident.location is None}
        self.rebuild_grid_index()
        self.road_usage = {}
        self.transport_mode_usage = {mode.value: 0 for mode in TransportMode}
        self.current_tick += 1
        sim_time = self.simulation_time()
        from engine.weather import normalize_season, normalize_weather, sync_weather_cycle

        previous_weather = normalize_weather(self.weather)
        weather_events = sync_weather_cycle(self)
        fashion_events = sync_fashion_for_tick(self)
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
            self._ensure_resident_job(agent.resident)
            self._ensure_resident_health(agent.resident)
            self._ensure_resident_fashion(agent.resident)
            if active_weather is WeatherType.sunny and self.rng.random() < 0.1:
                self.shift_resident_mood(agent, 1, "weather")
            if active_weather is WeatherType.stormy and agent.resident.location is None:
                self.infect_resident(agent.resident, "cold") if self.rng.random() < 0.18 else None
            if agent.resident.energy < 0.2:
                self.set_resident_mood(agent, "tired", "energy")
            self.update_mental_state(agent.resident)
            if agent.resident.job.title == "unemployed":
                if self.rng.random() < 0.5:
                    self.shift_resident_mood(agent, -1, "unemployment")
                self._seek_job(agent)
            if agent.resident.health.illness is not None:
                if self.current_tick % 6 == 0:
                    self.shift_resident_mood(agent, -1, agent.resident.health.illness.type)
                agent.resident.health.hp = round(max(0.1, agent.resident.health.hp - agent.resident.health.illness.severity * 0.01), 3)
                hospital = self.nearest_hospital()
                if hospital is not None and agent.resident.location != hospital.id:
                    if agent.resident.location is not None:
                        self.leave_building(agent)
                    agent.resident.x, agent.resident.y = hospital.position
                    self.enter_building(agent, hospital)
                    agent.current_path = []
                elif hospital is None:
                    self.recover_resident_health(agent.resident, 0.01)
            if self.mood_score(agent.resident.mood) < 0:
                self.recall_comforting_memory(agent)

        if self.current_tick % 100 == 0:
            self.decay_resident_memories()

        crime_events = self.process_crime_tick()
        pet_events = self.update_pets()
        culture_events = self.update_cultural_events()
        religion_events = self.update_religious_events()

        # ── News generation every 10 ticks ──
        if self.current_tick > 0 and self.current_tick % 10 == 0:
            self.generate_news()

        # ── Economic cycle advancement ──
        new_phase = self.advance_economic_cycle()
        if new_phase:
            fashion_events.append(f"经济进入{new_phase}期。")
        cycle_events = self.apply_cycle_effects()

        # ── Town level + milestone checks (every 5 ticks) ──
        milestone_events: list[str] = []
        if self.current_tick > 0 and self.current_tick % 5 == 0:
            new_milestones = self.check_milestones()
            for name in new_milestones:
                milestone_events.append(f"里程碑达成：{name}！全镇庆祝！")
                for agent in self.agents:
                    self.shift_resident_mood(agent.resident, 2, "milestone_celebration")
            new_level = self.update_town_level()
            if new_level is not None:
                milestone_events.append(f"城镇升级至 Lv.{new_level}！")

        # ── Mood contagion: co-occupants influence each other's mood ──────
        from engine.act import apply_mood_contagion
        apply_mood_contagion(self)

        # ── End-of-day diary generation at 22:00 (tick index 44 / 48) ────
        _EOD_TICK_IN_DAY = 44  # 22 * (tick_per_day / 24) = 22 * 2
        if (self.current_tick % self.config.tick_per_day) == _EOD_TICK_IN_DAY:
            from engine.diary import generate_diary_entry
            for agent in self.agents:
                generate_diary_entry(agent, self)
            self.gdp_history.append(
                {
                    "tick": self.current_tick,
                    "gdp": round(self.economic_output, 2),
                }
            )
            self.gdp_history = self.gdp_history[-30:]

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
                outfit_color=a.resident.outfit_color,
                appearance=a.resident.appearance,
            )
            for a in self.agents
            if a.resident.id in movement_candidates
        ]

        energy_updates = [
            EnergyUpdate(id=a.resident.id, energy=round(a.resident.energy, 3))
            for a in self.agents
        ]

        # Clear path cache after tick so the next tick's agent cycle starts fresh
        self._refresh_transport_stats()
        self.path_cache.clear()

        return TickState(
            tick=self.current_tick,
            time=sim_time,
            movements=movements,
            events=[
                *[EventUpdate(description=description) for description in weather_events],
                *[EventUpdate(description=description) for description in fashion_events],
                *[EventUpdate(description=description) for description in cycle_events],
                *[EventUpdate(description=description) for description in milestone_events],
                *pet_events,
                *culture_events,
                *religion_events,
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
