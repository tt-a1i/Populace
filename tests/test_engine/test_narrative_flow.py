"""Integration: dialogue kind + gossip + memory source in tick output."""
from dataclasses import asdict

from engine.types import DialogueUpdate, GossipUpdate, Memory, TickState


def test_dialogue_update_kind_serializes():
    d = DialogueUpdate(from_id="a", to_id="b", text="hi", kind="gossip")
    data = asdict(d)
    assert data["kind"] == "gossip"


def test_tick_state_gossip_serializes():
    ts = TickState(
        tick=1,
        time="Day 1, 08:00",
        gossips=[GossipUpdate(
            speaker_id="a", listener_id="b", target_id="c",
            target_name="Carol", content="Carol is nice", is_positive=True,
        )],
    )
    data = asdict(ts)
    assert len(data["gossips"]) == 1
    assert data["gossips"][0]["target_name"] == "Carol"


def test_memory_source_field():
    m = Memory(id="1", content="test", timestamp="t", importance=0.5, emotion="happy")
    assert m.source == "system"

    m2 = Memory(id="2", content="chat", timestamp="t", importance=0.8, emotion="happy", source="dialogue")
    assert m2.source == "dialogue"
    data = asdict(m2)
    assert data["source"] == "dialogue"
