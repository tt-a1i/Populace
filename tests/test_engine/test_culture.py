from engine.types import Building, CulturalEvent, Resident


def test_cultural_event_and_resident_artistic_defaults():
    resident = Resident(id="r1", name="阿青", personality="温和")
    event = CulturalEvent(
        type="concert",
        name="黄昏音乐会",
        venue_id="park1",
        organizer_id="r1",
        tick_start=12,
        duration=6,
    )

    assert resident.artistic_talent == 0.0
    assert event.participants == []


def test_world_culture_system_creates_events_and_prosperity(mock_world):
    venue = Building(id="park1", type="park", name="河畔公园", capacity=12, position=(7, 7))
    mock_world.add_building(venue)
    organizer = mock_world.agents[0]
    organizer.resident.skills["art"] = 0.9
    organizer.resident.education.knowledge_level["art"] = 0.8
    organizer.resident.artistic_talent = 0.95

    created = mock_world.maybe_create_cultural_event()

    assert created is not None
    assert created.organizer_id == organizer.resident.id
    assert mock_world.culture_prosperity_index() > 0.0

    participant_id = next(pid for pid in created.participants if pid != organizer.resident.id)
    participant = next(agent for agent in mock_world.agents if agent.resident.id == participant_id)
    assert participant.resident.education.knowledge_level["art"] >= 0.05
    assert participant.resident.mood in {"calm", "content", "happy", "excited", "ecstatic"}
