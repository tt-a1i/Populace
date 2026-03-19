"""Tests for backend.world.town scenario loading helpers."""

from backend.world.town import load_scenario_from_dict
from engine.types import WorldConfig


ALLOWED_SKIN_COLORS = {
    "#F2D3B1",
    "#E5B887",
    "#D39A6A",
    "#B97C52",
    "#8A5A3C",
    "#5C3A27",
}
ALLOWED_HAIR_STYLES = {"short", "long", "spiky", "bald", "ponytail"}
ALLOWED_HAIR_COLORS = {
    "#1F2937",
    "#5B4636",
    "#8B5A2B",
    "#D4A373",
    "#C084FC",
    "#F8FAFC",
}
ALLOWED_OUTFIT_COLORS = {
    "#2563EB",
    "#059669",
    "#DC2626",
    "#D97706",
    "#7C3AED",
    "#DB2777",
    "#0F766E",
    "#4B5563",
}


def test_load_scenario_generates_deterministic_resident_appearance():
    scenario = {
        "buildings": [],
        "residents": [
            {"id": "ava", "name": "Ava", "personality": "外向", "x": 1, "y": 2},
            {"id": "milo", "name": "Milo", "personality": "谨慎", "x": 2, "y": 3},
            {"id": "juno", "name": "Juno", "personality": "健谈", "x": 3, "y": 4},
        ],
        "map": {},
    }

    world_a = load_scenario_from_dict(scenario, config=WorldConfig(llm_call_probability=0.0))
    world_b = load_scenario_from_dict(scenario, config=WorldConfig(llm_call_probability=0.0))

    appearance_a = [
        (
            agent.resident.skin_color,
            agent.resident.hair_style,
            agent.resident.hair_color,
            agent.resident.outfit_color,
        )
        for agent in world_a.agents
    ]
    appearance_b = [
        (
            agent.resident.skin_color,
            agent.resident.hair_style,
            agent.resident.hair_color,
            agent.resident.outfit_color,
        )
        for agent in world_b.agents
    ]

    assert appearance_a == appearance_b
    assert len(set(appearance_a)) >= 2

    for skin_color, hair_style, hair_color, outfit_color in appearance_a:
        assert skin_color in ALLOWED_SKIN_COLORS
        assert hair_style in ALLOWED_HAIR_STYLES
        assert hair_color in ALLOWED_HAIR_COLORS
        assert outfit_color in ALLOWED_OUTFIT_COLORS
