"""Tests for the smart newspaper generation system."""
import pytest

from engine.types import (
    FamilyInfo,
    Job,
    NewspaperIssue,
    Resident,
    RelationshipStatus,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_resident(rid: str = "r1", **kwargs) -> Resident:
    defaults = dict(
        id=rid,
        name=f"居民{rid}",
        personality="和善",
        age_days=500,
        age_stage="adult",
        wallet=0.0,
        coins=100,
        skills={},
        safety_feeling=0.8,
        travel_log=[],
        traveling=False,
        diary=[],
        mood="neutral",
        relationship_status=RelationshipStatus.single,
        family=FamilyInfo(),
        dream="成为富翁",
        dream_progress=0.0,
    )
    defaults.update(kwargs)
    return Resident(**defaults)


class FakeAgent:
    def __init__(self, resident):
        self.resident = resident


class FakeWorld:
    def __init__(self, agents=None):
        self.current_tick = 20
        self.agents = agents or []
        self.newspaper_archive = []
        self.news_archive = []
        self.crime_log = []
        self.active_disasters = []
        self.active_festival = None
        self.active_festival_ticks_remaining = 0
        self.economic_output = 100.0
        self.fashion_purchase_history = []
        self.rumor_log = []
        self.gang_event_log = []
        self.player_interventions = []
        self.market = None

    def simulation_time(self):
        return "Day 1"

    def shift_resident_mood(self, agent, amount, cause):
        pass

    def generate_newspaper(self):
        from engine.world import _newspaper_issue_to_dict
        # Use the actual World.generate_newspaper logic by calling it directly
        # For tests, we replicate the core logic via monkey-patching
        return None  # Overridden per test


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_newspaper_issue_dataclass_fields():
    """NewspaperIssue has required fields."""
    issue = NewspaperIssue(
        issue_id="issue-1-t20",
        tick=20,
        headlines=["头条一", "头条二", "头条三"],
        sections={"economy": "经济稳定", "society": "社区和睦", "gossip": "坊间轶事", "events": "无事"},
        generated_at=20,
    )
    assert issue.issue_id == "issue-1-t20"
    assert issue.tick == 20
    assert len(issue.headlines) == 3
    assert "economy" in issue.sections
    assert issue.generated_at == 20


def test_generate_newspaper_creates_issue(tmp_path):
    """World.generate_newspaper() creates a NewspaperIssue."""
    from engine.world import World
    from engine.types import WorldConfig

    world = World(WorldConfig(seed=42))
    world.current_tick = 20
    issue = world.generate_newspaper()

    assert issue is not None
    assert isinstance(issue, NewspaperIssue)
    assert issue.issue_id != ""
    assert issue.tick == 20


def test_generate_newspaper_headlines_count(tmp_path):
    """Generated newspaper has 3-5 headlines."""
    from engine.world import World
    from engine.types import WorldConfig

    world = World(WorldConfig(seed=1))
    world.current_tick = 20
    issue = world.generate_newspaper()

    assert issue is not None
    assert 3 <= len(issue.headlines) <= 5


def test_generate_newspaper_sections_nonempty(tmp_path):
    """All four sections are present and non-empty."""
    from engine.world import World
    from engine.types import WorldConfig

    world = World(WorldConfig(seed=7))
    world.current_tick = 40
    issue = world.generate_newspaper()

    assert issue is not None
    for section in ("economy", "society", "gossip", "events"):
        assert section in issue.sections
        assert len(issue.sections[section]) > 0


def test_newspaper_archive_appends(tmp_path):
    """Each call to generate_newspaper() adds to newspaper_archive."""
    from engine.world import World
    from engine.types import WorldConfig

    world = World(WorldConfig(seed=3))
    assert len(world.newspaper_archive) == 0
    world.current_tick = 20
    world.generate_newspaper()
    assert len(world.newspaper_archive) == 1
    world.current_tick = 40
    world.generate_newspaper()
    assert len(world.newspaper_archive) == 2


def test_newspaper_archive_limit(tmp_path):
    """newspaper_archive is capped at 10 entries."""
    from engine.world import World
    from engine.types import WorldConfig

    world = World(WorldConfig(seed=5))
    for i in range(1, 16):
        world.current_tick = i * 20
        world.generate_newspaper()

    assert len(world.newspaper_archive) <= 10


def test_get_newspaper_overview_empty(tmp_path):
    """Returns None issue when no newspaper generated."""
    from engine.world import World
    from engine.types import WorldConfig

    world = World(WorldConfig(seed=9))
    overview = world.get_newspaper_overview()
    assert overview["issue"] is None


def test_get_newspaper_overview_latest(tmp_path):
    """Returns latest issue after generation."""
    from engine.world import World
    from engine.types import WorldConfig

    world = World(WorldConfig(seed=11))
    world.current_tick = 20
    world.generate_newspaper()
    overview = world.get_newspaper_overview()

    assert overview["issue"] is not None
    assert "issue_id" in overview["issue"]
    assert "headlines" in overview["issue"]
    assert "sections" in overview["issue"]


def test_get_newspaper_archive_overview(tmp_path):
    """Returns at most 5 issues in archive overview."""
    from engine.world import World
    from engine.types import WorldConfig

    world = World(WorldConfig(seed=13))
    for i in range(1, 8):
        world.current_tick = i * 20
        world.generate_newspaper()

    arc = world.get_newspaper_archive_overview()
    assert "issues" in arc
    assert len(arc["issues"]) <= 5


def test_dream_fulfillment_appears_in_gossip(tmp_path):
    """A recently fulfilled dream appears in gossip section."""
    from engine.world import World
    from engine.types import WorldConfig

    world = World(WorldConfig(seed=17))
    world.current_tick = 20
    world._dream_fulfillments = [{
        "resident_id": "r1",
        "resident_name": "小明",
        "dream": "成为富翁",
        "tick": 18,
    }]
    issue = world.generate_newspaper()

    assert issue is not None
    gossip = issue.sections.get("gossip", "")
    assert "小明" in gossip or "成为富翁" in gossip


def test_newspaper_helper_serializes_correctly():
    """_newspaper_issue_to_dict returns proper plain dict."""
    from engine.world import _newspaper_issue_to_dict

    issue = NewspaperIssue(
        issue_id="issue-3-t60",
        tick=60,
        headlines=["标题A", "标题B", "标题C"],
        sections={"economy": "好", "society": "棒", "gossip": "多", "events": "新"},
        generated_at=60,
    )
    d = _newspaper_issue_to_dict(issue)
    assert d["issue_id"] == "issue-3-t60"
    assert d["tick"] == 60
    assert d["headlines"] == ["标题A", "标题B", "标题C"]
    assert d["sections"]["economy"] == "好"
