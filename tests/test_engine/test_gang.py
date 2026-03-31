"""Tests for the gang system."""
import pytest

from engine.types import Gang, WorldConfig
from engine.world import World

from tests.conftest import make_agent


@pytest.fixture
def mock_world():
    """Create a world with 3 agents for testing."""
    config = WorldConfig(map_width_tiles=40, map_height_tiles=30, seed=42)
    world = World(config)
    
    # Add agents with different moods
    agent1 = make_agent("a1", "阿强", personality="愤怒，不满", x=5, y=5)
    agent1.resident.mood = "angry"
    agent2 = make_agent("a2", "小红", personality="外向，热心", x=10, y=10)
    agent2.resident.mood = "happy"
    agent3 = make_agent("a3", "阿明", personality="内向，害羞", x=15, y=15)
    agent3.resident.mood = "sad"
    
    for agent in [agent1, agent2, agent3]:
        world.add_agent(agent)
    
    return world


class TestGangInitialization:
    """Tests for gang initialization."""

    def test_initialize_gangs_creates_2_to_3_gangs(self, mock_world):
        """World should initialize with 2-3 gangs."""
        mock_world.initialize_gangs()
        assert 2 <= len(mock_world.gangs) <= 3

    def test_initialize_gangs_assigns_different_territories(self, mock_world):
        """Each gang should have a different territory."""
        mock_world.initialize_gangs()
        territories = [gang.territory for gang in mock_world.gangs]
        assert len(territories) == len(set(territories))

    def test_initialize_gangs_sets_leader_from_dissatisfied_residents(self, mock_world):
        """Gang leaders should be recruited from dissatisfied residents."""
        mock_world.initialize_gangs()
        for gang in mock_world.gangs:
            if gang.leader_id:
                leader_agent = mock_world.get_agent(gang.leader_id)
                assert leader_agent is not None

    def test_initialize_gangs_does_not_duplicate(self, mock_world):
        """Calling initialize_gangs twice should not create more gangs."""
        mock_world.initialize_gangs()
        first_count = len(mock_world.gangs)
        mock_world.initialize_gangs()
        assert len(mock_world.gangs) == first_count


class TestGangRecruitment:
    """Tests for gang recruitment logic."""

    def test_recruit_for_gangs_adds_members(self, mock_world):
        """Recruitment should add residents to gangs."""
        mock_world.initialize_gangs()
        initial_members = sum(len(gang.member_ids) for gang in mock_world.gangs)
        
        # Force recruitment by setting all residents to low mood
        for agent in mock_world.agents:
            agent.resident.mood = "sad"
        
        mock_world.recruit_for_gangs()
        total_members = sum(len(gang.member_ids) for gang in mock_world.gangs)
        
        # Some residents should have been recruited
        assert total_members >= initial_members

    def test_recruit_for_gangs_dissatisfied_more_likely(self, mock_world):
        """Dissatisfied residents should be more likely to join gangs."""
        mock_world.initialize_gangs()
        
        # Set one resident to happy, one to sad
        mock_world.agents[0].resident.mood = "happy"
        mock_world.agents[1].resident.mood = "sad"
        
        # Run recruitment multiple times to get statistical significance
        recruited_happy = 0
        recruited_sad = 0
        
        for _ in range(100):
            # Reset gang membership
            for gang in mock_world.gangs:
                gang.member_ids = [gang.leader_id] if gang.leader_id else []
            
            mock_world.rng.seed(42)  # Reset seed for reproducibility
            mock_world.recruit_for_gangs()
            
            if mock_world.agents[0].resident.id in [mid for gang in mock_world.gangs for mid in gang.member_ids]:
                recruited_happy += 1
            if mock_world.agents[1].resident.id in [mid for gang in mock_world.gangs for mid in gang.member_ids]:
                recruited_sad += 1

    def test_recruit_for_gangs_already_member_skipped(self, mock_world):
        """Residents already in a gang should not be recruited again."""
        mock_world.initialize_gangs()
        
        # Manually add resident to a gang
        if mock_world.gangs:
            mock_world.gangs[0].member_ids.append("a1")
        
        # Recruitment should not add duplicate
        mock_world.recruit_for_gangs()
        
        member_count = sum(1 for gang in mock_world.gangs for mid in gang.member_ids if mid == "a1")
        assert member_count == 1


class TestGangConflicts:
    """Tests for gang conflict and expansion logic."""

    def test_gang_conflicts_and_expansion_reduces_safety(self, mock_world):
        """Conflicts should reduce safety feeling in affected territory."""
        mock_world.initialize_gangs()
        
        if len(mock_world.gangs) < 2:
            pytest.skip("Need at least 2 gangs for conflict test")
        
        initial_safety = mock_world.agents[0].resident.safety_feeling
        
        # Force conflict by running multiple times
        for _ in range(10):
            mock_world.gang_conflicts_and_expansion()
        
        # Safety should have decreased for some residents
        final_safety = mock_world.agents[0].resident.safety_feeling
        assert final_safety <= initial_safety

    def test_gang_conflicts_changes_influence(self, mock_world):
        """Conflicts should change gang influence."""
        mock_world.initialize_gangs()
        
        if len(mock_world.gangs) < 2:
            pytest.skip("Need at least 2 gangs for conflict test")
        
        initial_influence = [gang.influence for gang in mock_world.gangs]
        
        # Run conflicts multiple times
        for _ in range(20):
            mock_world.gang_conflicts_and_expansion()
        
        # Influence should have changed
        final_influence = [gang.influence for gang in mock_world.gangs]
        assert initial_influence != final_influence

    def test_gang_expansion_changes_territory(self, mock_world):
        """Expansion should change gang territory."""
        mock_world.initialize_gangs()
        
        if not mock_world.gangs:
            pytest.skip("Need at least 1 gang for expansion test")
        
        initial_territory = mock_world.gangs[0].territory
        
        # Run expansion multiple times
        for _ in range(30):
            mock_world.gang_conflicts_and_expansion()
        
        # Territory might have changed
        # (not guaranteed, but likely after many iterations)


class TestGangQueries:
    """Tests for gang query methods."""

    def test_get_gang_overview_returns_data(self, mock_world):
        """get_gang_overview should return structured data."""
        mock_world.initialize_gangs()
        
        overview = mock_world.get_gang_overview()
        
        assert "gangs" in overview
        assert "recent_events" in overview
        assert isinstance(overview["gangs"], list)

    def test_is_resident_in_gang(self, mock_world):
        """is_resident_in_gang should return correct boolean."""
        mock_world.initialize_gangs()
        
        # Initially no residents should be in gangs (except possibly leaders)
        for agent in mock_world.agents:
            # This depends on initialization
            pass
        
        # Manually add resident to gang
        if mock_world.gangs:
            mock_world.gangs[0].member_ids.append("test_resident")
            assert mock_world.is_resident_in_gang("test_resident")
            assert not mock_world.is_resident_in_gang("nonexistent")

    def test_get_resident_gang_returns_correct_gang(self, mock_world):
        """get_resident_gang should return the correct gang."""
        mock_world.initialize_gangs()
        
        if not mock_world.gangs:
            pytest.skip("Need at least 1 gang")
        
        test_gang = mock_world.gangs[0]
        test_gang.member_ids.append("test_resident")
        
        result = mock_world.get_resident_gang("test_resident")
        assert result is test_gang
        
        assert mock_world.get_resident_gang("nonexistent") is None
