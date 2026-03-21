"""Test that GossipUpdate exists in TickState."""
from engine.types import GossipUpdate, TickState


def test_gossip_update_dataclass():
    g = GossipUpdate(
        speaker_id="a",
        listener_id="b",
        target_id="c",
        target_name="Carol",
        content="Carol is great",
        is_positive=True,
    )
    assert g.speaker_id == "a"
    assert g.is_positive is True


def test_tick_state_has_gossips_field():
    ts = TickState(tick=1, time="Day 1, 08:00")
    assert hasattr(ts, "gossips")
    assert ts.gossips == []
