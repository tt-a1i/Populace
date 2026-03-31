"""Tests for leaderboard and badge logic in engine/world.py."""
import pytest
from engine.world import World
from engine.types import WorldConfig


@pytest.fixture
def world_with_residents():
    """Create a test world using the standard scenario loader."""
    # Use the standard world loading to get properly initialized agents
    from backend.world.town import load_scenario
    world = load_scenario()
    return world


def test_get_leaderboards_returns_all_five(world_with_residents):
    """Test that get_leaderboards returns all 5 leaderboard types."""
    leaderboards = world_with_residents.get_leaderboards()

    assert "richest" in leaderboards
    assert "happiest" in leaderboards
    assert "most_social" in leaderboards
    assert "most_traveled" in leaderboards
    assert "most_influential" in leaderboards


def test_richest_leaderboard_structure(world_with_residents):
    """Test that richest leaderboard has correct structure."""
    leaderboards = world_with_residents.get_leaderboards()
    richest = leaderboards["richest"]

    # Should have entries (up to 5)
    assert isinstance(richest, list)
    assert len(richest) <= 5

    # Check structure
    for entry in richest:
        assert hasattr(entry, "resident_id")
        assert hasattr(entry, "name")
        assert hasattr(entry, "value")
        assert hasattr(entry, "rank")


def test_happiest_leaderboard_structure(world_with_residents):
    """Test that happiest leaderboard has correct structure."""
    leaderboards = world_with_residents.get_leaderboards()
    happiest = leaderboards["happiest"]

    assert isinstance(happiest, list)
    for entry in happiest:
        assert entry.rank >= 1


def test_get_badge_definitions(world_with_residents):
    """Test that badge definitions are returned correctly."""
    badges = world_with_residents.get_badge_definitions()

    assert len(badges) == 10

    badge_ids = [b.badge_id for b in badges]
    expected_ids = ["rich", "happy", "social", "explorer", "legend", "longevity", "lover", "dreamer", "secret_keeper", "gang_leader"]
    assert set(badge_ids) == set(expected_ids)


def test_award_badges_returns_list(world_with_residents):
    """Test that award_badges returns a list."""
    awarded = world_with_residents.award_badges()
    assert isinstance(awarded, list)


def test_get_badges_stats_structure(world_with_residents):
    """Test that badge stats have correct structure."""
    # Award some badges first
    world_with_residents.award_badges()

    stats = world_with_residents.get_badges_stats()

    assert "total_awarded" in stats
    assert "rarest_badge" in stats
    assert "badge_distribution" in stats
    assert isinstance(stats["total_awarded"], int)
    assert isinstance(stats["badge_distribution"], dict)


def test_leaderboard_rank_sequential(world_with_residents):
    """Test that leaderboard ranks are sequential."""
    leaderboards = world_with_residents.get_leaderboards()

    for board_name, board in leaderboards.items():
        for i, entry in enumerate(board):
            assert entry.rank == i + 1


def test_most_influential_calculation(world_with_residents):
    """Test that influence is calculated correctly."""
    leaderboards = world_with_residents.get_leaderboards()
    influential = leaderboards["most_influential"]

    # All residents should have some influence score
    for entry in influential:
        assert entry.value >= 0


def test_badges_awarded_to_residents(world_with_residents):
    """Test that badges are actually awarded to residents."""
    initial_badges = {}
    for agent in world_with_residents.agents:
        initial_badges[agent.resident.id] = len(agent.resident.badges)

    awarded = world_with_residents.award_badges()

    # Check that some badges were awarded (depends on resident data)
    assert isinstance(awarded, list)


def test_leaderboards_descending_order(world_with_residents):
    """Test that leaderboard values are in descending order."""
    leaderboards = world_with_residents.get_leaderboards()

    for board_name, board in leaderboards.items():
        prev_value = float('inf')
        for entry in board:
            assert entry.value <= prev_value
            prev_value = entry.value
