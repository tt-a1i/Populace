"""Tests for newspaper generation endpoint."""
from __future__ import annotations

import pytest

from backend.api.report import NewspaperResponse, NewspaperArticle, _generate_newspaper
from backend.api.simulation import SimulationState


class TestNewspaperModels:
    """Test Pydantic models for newspaper data."""

    def test_article_defaults(self):
        a = NewspaperArticle(section="头条", headline="Test", content="Content")
        assert a.icon == ""

    def test_response_model(self):
        r = NewspaperResponse(
            day=0,
            date_label="Day 1",
            headline="Test headline",
            articles=[],
            generated_at="2026-01-01T00:00:00Z",
        )
        assert r.day == 0
        assert r.headline == "Test headline"
        assert r.articles == []


class TestNewspaperGeneration:
    """Test newspaper generation from simulation state."""

    def test_generates_weather_article(self):
        """Newspaper always includes a weather section."""
        state = SimulationState()
        result = _generate_newspaper(state, 0)
        sections = [a.section for a in result.articles]
        assert "天气" in sections

    def test_generates_headline(self):
        """Newspaper always has a headline."""
        state = SimulationState()
        result = _generate_newspaper(state, 0)
        assert result.headline
        assert len(result.headline) > 0

    def test_day_label(self):
        """Day label corresponds to the requested day."""
        state = SimulationState()
        result = _generate_newspaper(state, 0)
        assert "1" in result.date_label or "Day" in result.date_label

    def test_empty_day_still_produces_articles(self):
        """Even with no experiment history, we get at least weather + headline."""
        state = SimulationState()
        result = _generate_newspaper(state, 99)  # Far future day
        assert len(result.articles) >= 2  # At least headline + weather
