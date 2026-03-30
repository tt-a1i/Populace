"""Tests for the disaster and emergency helpers in World."""

from engine.types import Building, Disaster

from tests.conftest import make_agent


def test_disaster_damage_cycle_evacuates_residents_and_rebuilds(mock_world):
    shelter = Building(id="clinic-safe", type="clinic", name="应急医疗站", capacity=6, position=(2, 2))
    mock_world.add_building(shelter)

    target = mock_world.get_building("home1")
    assert target is not None
    target.level = 3
    target.decoration_score = 0.82

    resident = mock_world.agents[0].resident
    resident.home_building_id = target.id
    resident.location = target.id
    resident.health.hp = 1.0
    resident.mood = "content"

    doctor = make_agent("doc-1", "林医生", x=2, y=2)
    doctor.resident.occupation = "doctor"
    doctor.resident.location = shelter.id
    mock_world.add_agent(doctor)

    disaster = Disaster(
        type="fire",
        severity=0.76,
        affected_buildings=[target.id],
        tick_start=32,
        duration=8,
        casualties=0,
    )

    damage_report = mock_world.apply_disaster_damage(target.id, disaster.severity)
    evacuations = mock_world.evacuate_residents_from_buildings(disaster.affected_buildings, disaster.severity)
    reserve_spent = mock_world.rebuild_disaster_damage(target.id, damage_report, reserve_budget=240.0)

    assert damage_report["building_id"] == target.id
    assert damage_report["previous_level"] == 3
    assert damage_report["new_level"] == 2
    assert target.decoration_score < 0.82
    assert resident.location != target.id
    assert resident.health.hp < 1.0
    assert resident.mood in {"tired", "sad", "angry", "fearful"}
    assert any(item["resident_id"] == resident.id for item in evacuations)
    assert reserve_spent > 0
