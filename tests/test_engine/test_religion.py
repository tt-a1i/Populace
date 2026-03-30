from engine.types import Building, Religion, Resident


def test_resident_religion_defaults():
    resident = Resident(id="faith-r1", name="阿木", personality="温和")

    assert resident.religion == Religion.none
    assert resident.piety == 0.0
    assert resident.morality_score == 0.5


def test_religion_enum_values():
    assert Religion.naturalism.value == "naturalism"
    assert Religion.ancestor_worship.value == "ancestor_worship"
    assert Religion.solarsm.value == "solarsm"
    assert Religion.none.value == "none"


def test_religious_event_creation_and_worship(mock_world):
    shrine = Building(id="shrine1", type="shrine", name="林间祭坛", capacity=8, position=(7, 4))
    mock_world.add_building(shrine)
    devotee = mock_world.agents[0]
    devotee.resident.religion = Religion.naturalism
    devotee.resident.location = shrine.id
    devotee.resident.mood = "neutral"

    before_piety = devotee.resident.piety
    before_morality = devotee.resident.morality_score

    mock_world.apply_building_effects(devotee)
    created = mock_world.maybe_create_religious_event()

    assert devotee.resident.piety > before_piety
    assert devotee.resident.morality_score > before_morality
    assert created is not None
    assert created.religion == Religion.naturalism.value
