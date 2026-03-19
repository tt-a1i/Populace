"""Tests for MemoryStream — add/retrieve/should_reflect."""
import pytest

from engine.memory import MemoryStream
from engine.types import WorldConfig

from tests.conftest import make_memory


@pytest.fixture()
def stream():
    cfg = WorldConfig(short_term_memory_size=5, reflection_threshold=3)
    return MemoryStream(cfg)


def test_add_increments_total(stream):
    assert stream.total_added == 0
    stream.add(make_memory("event 1"))
    assert stream.total_added == 1


def test_retrieve_empty_returns_empty(stream):
    result = stream.retrieve("anything")
    assert result == []


def test_retrieve_returns_by_importance():
    cfg = WorldConfig(short_term_memory_size=10, reflection_threshold=10)
    ms = MemoryStream(cfg)
    ms.add(make_memory("low", importance=0.1))
    ms.add(make_memory("high", importance=0.9))
    results = ms.retrieve("anything", k=1)
    assert results[0].content == "high"


def test_buffer_capped_at_size():
    cfg = WorldConfig(short_term_memory_size=3, reflection_threshold=100)
    ms = MemoryStream(cfg)
    for i in range(5):
        ms.add(make_memory(f"event {i}"))
    assert len(ms) == 3
    assert ms.total_added == 5


def test_should_reflect_fires_at_threshold(stream):
    for _ in range(3):
        stream.add(make_memory())
    assert stream.should_reflect() is True


def test_should_reflect_false_after_firing(stream):
    for _ in range(3):
        stream.add(make_memory())
    stream.should_reflect()  # consume
    assert stream.should_reflect() is False


def test_should_reflect_fires_again_at_next_multiple(stream):
    for _ in range(3):
        stream.add(make_memory())
    stream.should_reflect()  # threshold 3
    for _ in range(3):
        stream.add(make_memory())
    assert stream.should_reflect() is True  # threshold 6


def test_should_reflect_false_before_threshold(stream):
    stream.add(make_memory())
    stream.add(make_memory())
    assert stream.should_reflect() is False


def test_retrieve_k_limits_results():
    cfg = WorldConfig(short_term_memory_size=10, reflection_threshold=10)
    ms = MemoryStream(cfg)
    for i in range(6):
        ms.add(make_memory(f"e{i}", importance=float(i) / 10))
    results = ms.retrieve("x", k=3)
    assert len(results) == 3
