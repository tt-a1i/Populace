"""Test that DialogueUpdate carries a 'kind' field."""
from engine.types import DialogueUpdate


def test_dialogue_update_has_kind_field():
    d = DialogueUpdate(from_id="a", to_id="b", text="hello", kind="dialogue")
    assert d.kind == "dialogue"


def test_dialogue_update_kind_defaults_to_dialogue():
    d = DialogueUpdate(from_id="a", to_id="b", text="hello")
    assert d.kind == "dialogue"
