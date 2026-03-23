"""Tests for social indicators computation and API endpoint."""
from __future__ import annotations

import pytest

from backend.api.simulation import SocialIndicatorsResponse, _compute_gini


class TestGiniCoefficient:
    """Test the Gini coefficient computation."""

    def test_perfect_equality(self):
        """All equal values → Gini = 0."""
        assert _compute_gini([100, 100, 100, 100]) == 0.0

    def test_perfect_inequality(self):
        """One person has everything → Gini approaches 1."""
        gini = _compute_gini([0, 0, 0, 1000])
        assert 0.7 < gini <= 1.0

    def test_moderate_inequality(self):
        """Moderate spread → Gini between 0 and 0.5."""
        gini = _compute_gini([10, 20, 30, 40])
        assert 0.0 < gini < 0.5

    def test_empty_values(self):
        """Empty list → Gini = 0."""
        assert _compute_gini([]) == 0.0

    def test_all_zeros(self):
        """All zeros → Gini = 0."""
        assert _compute_gini([0, 0, 0]) == 0.0

    def test_single_value(self):
        """Single value → Gini = 0."""
        assert _compute_gini([100]) == 0.0


class TestSocialIndicatorsResponse:
    """Test the response model defaults."""

    def test_defaults(self):
        resp = SocialIndicatorsResponse()
        assert resp.gini_coefficient == 0.0
        assert resp.social_cohesion == 0.0
        assert resp.happiness_index == 0.0
        assert resp.population == 0
        assert resp.avg_mood_score == 0.0
        assert resp.total_coins == 0
        assert resp.avg_energy == 0.0
        assert resp.total_relationships == 0

    def test_custom_values(self):
        resp = SocialIndicatorsResponse(
            gini_coefficient=0.35,
            social_cohesion=0.6,
            happiness_index=0.72,
            population=15,
            total_coins=5000,
        )
        assert resp.gini_coefficient == 0.35
        assert resp.population == 15
        assert resp.total_coins == 5000
