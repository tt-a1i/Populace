"""Tests for the resident life-goal system."""
from engine.types import ExternalTown, LifeGoal, RelationType, Relationship, TradeRoute
from engine.goals import (
    GOAL_DEFINITIONS,
    assign_life_goal,
    compute_goal_progress,
    track_goals,
    apply_goal_completions,
    get_resident_goal_view,
)


def test_all_seven_goal_types_defined():
    types = {g["type"] for g in GOAL_DEFINITIONS}
    assert types == {
        "social_butterfly", "wealthy", "scholar", "famous",
        "family_person", "explorer", "artist",
    }


def test_assign_life_goal_returns_valid_goal():
    goal = assign_life_goal("外向热情", seed=42)
    assert isinstance(goal, LifeGoal)
    assert goal.type in {g["type"] for g in GOAL_DEFINITIONS}
    assert goal.progress == 0.0
    assert goal.target > 0
    assert goal.completed is False


def test_personality_influences_goal_assignment():
    social_count = sum(
        1 for _ in range(100)
        if assign_life_goal("外向热情社交活泼", seed=_).type == "social_butterfly"
    )
    random_count = sum(
        1 for _ in range(100)
        if assign_life_goal("普通", seed=_).type == "social_butterfly"
    )
    assert social_count > random_count


def test_progress_clamped_to_target(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._zones_visited = {}

    resident = mock_world.agents[0].resident
    resident.life_goal = LifeGoal(type="wealthy", progress=0.0, target=1000.0, reward="wealthy_goal")
    resident.wallet = 5000.0
    resident.coins = 5000

    completions = track_goals(state)

    assert resident.life_goal.progress <= resident.life_goal.target
    assert resident.life_goal.completed is True
    assert len(completions) == 1


def test_track_goals_skips_none_goal(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._zones_visited = {}

    for agent in mock_world.agents:
        agent.resident.life_goal = None

    completions = track_goals(state)
    assert completions == []


def test_social_butterfly_progress(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._zones_visited = {}

    resident = mock_world.agents[0].resident
    resident.life_goal = LifeGoal(type="social_butterfly", progress=0.0, target=10.0, reward="social_butterfly_goal")

    # Add 3 friendships
    for i in range(3):
        mock_world.set_relationship(Relationship(
            from_id=resident.id,
            to_id=f"friend_{i}",
            type=RelationType.friendship,
            intensity=0.6,
            since="t",
        ))

    progress = compute_goal_progress(state, resident)
    assert progress == 3.0


def test_apply_goal_completions_boosts_mood(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._achievements_store = {}
    state._achievement_unlock_meta = {}
    state._bulletin_posts = []

    resident = mock_world.agents[0].resident
    completions = [{
        "resident_id": resident.id,
        "resident_name": resident.name,
        "goal_type": "wealthy",
        "reward": "wealthy_goal",
        "tick": 100,
    }]

    apply_goal_completions(state, completions)

    assert resident.mood == "ecstatic"
    assert f"goal_wealthy" in state._achievements_store.get(resident.id, set())
    assert len(state._bulletin_posts) == 1
    assert "人生目标" in state._bulletin_posts[0]["content"]


def test_get_resident_goal_view(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world
    state._zones_visited = {}

    resident = mock_world.agents[0].resident
    resident.life_goal = LifeGoal(type="famous", progress=0.45, target=0.9, reward="famous_goal")

    view = get_resident_goal_view(state, resident.id)
    assert view is not None
    assert view["type"] == "famous"
    assert view["name"] == "名扬四海"
    assert view["percentage"] == 50.0
    assert view["completed"] is False


def test_get_resident_goal_view_none(mock_world):
    from backend.api.simulation import SimulationState

    state = SimulationState.__new__(SimulationState)
    state.world = mock_world

    resident = mock_world.agents[0].resident
    resident.life_goal = None

    view = get_resident_goal_view(state, resident.id)
    assert view is None
