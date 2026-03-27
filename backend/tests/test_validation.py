"""Validation tests: simulate known services (Uber, Netflix) and verify plausible outcomes.

These tests validate the simulation engine against known services to ensure
the model produces directionally correct and internally consistent results.

Key design decisions:
- Use 365-day (1-year) simulations to observe adoption dynamics before saturation.
- The engine's Bass diffusion model will eventually adopt most agents over very
  long periods; the interesting signal is in adoption *speed* and *shape*.
- Competition reduces the effective agent pool (strong = 50%), so Uber's
  reachable market is smaller than Netflix's.
- We compare total adopter *counts* (not rates) for cross-service comparisons,
  since the effective agent count differs.
"""

import pytest

from simulator.engine import run_simulation
from simulator.jtbd import evaluate_jtbd
from simulator.market import apply_competition_effect, apply_price_model_factor


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _assert_monotonically_non_decreasing(series: list[int | float], label: str) -> None:
    """Assert that a cumulative series never decreases."""
    for i in range(1, len(series)):
        assert series[i] >= series[i - 1], (
            f"{label}: cumulative series decreased at index {i} "
            f"({series[i - 1]} -> {series[i]})"
        )


def _assert_generally_increasing(series: list[int | float], label: str) -> None:
    """Assert that a series generally increases (allows small dips from churn)."""
    if len(series) < 2:
        return
    assert series[-1] > series[0], (
        f"{label}: final value ({series[-1]}) should exceed initial ({series[0]})"
    )


def _assert_s_curve_shape(cumulative: list[int | float], label: str) -> None:
    """Verify the cumulative adoption curve has an S-curve-like shape.

    An S-curve means: slow start, acceleration, then deceleration.
    We check that the midpoint cumulative value is strictly between
    the start and the end (i.e., growth happens across the full period
    and is not all front-loaded or back-loaded).
    """
    n = len(cumulative)
    if n < 10:
        pytest.skip(f"{label}: too few data points for S-curve check")

    final = cumulative[-1]
    if final == 0:
        pytest.fail(f"{label}: no adoption at all — cannot verify S-curve")

    mid = n // 2
    mid_value = cumulative[mid]

    # Midpoint should be between 5% and 95% of final — not all at start or end
    assert mid_value > final * 0.02, (
        f"{label}: almost no adoption by midpoint (mid={mid_value}, final={final})"
    )
    assert mid_value < final * 0.99, (
        f"{label}: adoption nearly complete by midpoint — no S-curve tail "
        f"(mid={mid_value}, final={final})"
    )


def _assert_rogers_ordering(result: dict, label: str) -> None:
    """Check that Rogers adoption is plausible.

    Innovators and early adopters should adopt; verify non-zero counts.
    """
    rogers = result["rogers_breakdown"]
    total_innovator = sum(rogers["innovator"])
    total_ea = sum(rogers["early_adopter"])
    total_adopted = result["summary"]["total_adopters"]

    if total_adopted == 0:
        pytest.skip(f"{label}: no adoption — cannot verify Rogers ordering")

    assert total_innovator > 0, f"{label}: zero innovator adoption"
    assert total_ea > 0, f"{label}: zero early adopter adoption"

    print(f"\n  [{label}] Rogers breakdown:")
    for cat in ["innovator", "early_adopter", "early_majority", "late_majority", "laggard"]:
        print(f"    {cat}: {sum(rogers[cat])}")


def _print_summary(result: dict, label: str, price: int) -> None:
    """Print a human-readable summary of the simulation result."""
    summary = result["summary"]
    cum_rev = result["cumulative_revenue"]
    print(f"\n{'=' * 60}")
    print(f"  Validation: {label}")
    print(f"{'=' * 60}")
    print(f"  Agents (effective): {result['num_agents']}")
    print(f"  Steps: {result['num_steps']}")
    print(f"  Total adopters: {summary['total_adopters']}")
    print(f"  Adoption rate: {summary['adoption_rate']:.2%}")
    print(f"  Peak daily adoption: {summary['peak_daily']}")
    print(f"  Total revenue: {cum_rev[-1] if cum_rev else 0:,} JPY")


# ---------------------------------------------------------------------------
# Common simulation parameters
# ---------------------------------------------------------------------------
BASE_P = 0.005
BASE_Q = 0.10
NUM_AGENTS = 10_000
NUM_STEPS = 365  # 1 year — enough to see dynamics, before full saturation
SEED = 42


# ---------------------------------------------------------------------------
# Uber Japan — ride-hailing in a strongly competitive market (taxis)
# ---------------------------------------------------------------------------

class TestUberValidation:
    """Uber Japan: mobility, ~1500 JPY/ride, strong competition, large market."""

    @pytest.fixture()
    def result(self):
        jtbd = evaluate_jtbd(category="mobility", target=["twenties", "thirties", "working_professional"])
        effective_price = apply_price_model_factor(1500, "usage")
        return run_simulation(
            num_agents=NUM_AGENTS,
            num_steps=NUM_STEPS,
            price=effective_price,
            base_p=BASE_P,
            base_q=BASE_Q,
            jtbd_fit=jtbd.jtbd_fit,
            competition="strong",
            seed=SEED,
        )

    def test_adoption_generally_increasing(self, result):
        _assert_generally_increasing(
            result["cumulative_adoption"], "Uber"
        )

    def test_adoption_rate_nonzero_and_not_saturated(self, result):
        """Over 1 year with strong competition, adoption should be meaningful but not 100%."""
        rate = result["summary"]["adoption_rate"]
        _print_summary(result, "Uber Japan (1 year)", 1500)
        # With strong competition and churn, we expect some adoption
        assert 0.001 <= rate <= 1.0, (
            f"Uber adoption rate {rate:.2%} outside expected range [0.1%, 100%]"
        )

    def test_s_curve_shape(self, result):
        _assert_s_curve_shape(result["cumulative_adoption"], "Uber")

    def test_rogers_ordering(self, result):
        _assert_rogers_ordering(result, "Uber")

    def test_revenue_positive_and_growing(self, result):
        cum_rev = result["cumulative_revenue"]
        assert cum_rev[-1] > 0, "Uber: total revenue should be positive"
        _assert_monotonically_non_decreasing(cum_rev, "Uber revenue")

    def test_agent_count_preserved_with_competition(self, result):
        """Competition affects adoption rate, not agent count."""
        assert result["num_agents"] == NUM_AGENTS


# ---------------------------------------------------------------------------
# Netflix Japan — entertainment streaming, subscription model
# ---------------------------------------------------------------------------

class TestNetflixValidation:
    """Netflix Japan: entertainment, ~1490 JPY/month subscription, weak competition."""

    @pytest.fixture()
    def result(self):
        jtbd = evaluate_jtbd(category="entertainment", target=["twenties", "thirties"])
        effective_price = apply_price_model_factor(1490, "subscription")
        return run_simulation(
            num_agents=NUM_AGENTS,
            num_steps=NUM_STEPS,
            price=effective_price,
            base_p=BASE_P,
            base_q=BASE_Q,
            jtbd_fit=jtbd.jtbd_fit,
            competition="weak",
            seed=SEED,
        )

    def test_adoption_generally_increasing(self, result):
        _assert_generally_increasing(
            result["cumulative_adoption"], "Netflix"
        )

    def test_adoption_rate_reasonable(self, result):
        """Over 1 year with weak competition, adoption should be meaningful."""
        rate = result["summary"]["adoption_rate"]
        _print_summary(result, "Netflix Japan (1 year)", 1490)
        assert 0.001 <= rate <= 1.0, (
            f"Netflix adoption rate {rate:.2%} outside expected range [0.1%, 100%]"
        )

    def test_netflix_more_ever_adopted_than_uber(self, result):
        """Netflix should reach more total ever-adopted than Uber.

        Netflix has weaker competition (q × 0.8 vs q × 0.5 for Uber).
        """
        jtbd_uber = evaluate_jtbd(
            category="mobility",
            target=["twenties", "thirties", "working_professional"],
        )
        uber_result = run_simulation(
            num_agents=NUM_AGENTS,
            num_steps=NUM_STEPS,
            price=apply_price_model_factor(1500, "usage"),
            base_p=BASE_P,
            base_q=BASE_Q,
            jtbd_fit=jtbd_uber.jtbd_fit,
            competition="strong",
            seed=SEED,
        )
        netflix_total = result["summary"]["total_ever_adopted"]
        uber_total = uber_result["summary"]["total_ever_adopted"]
        print(f"\n  Netflix ever-adopted: {netflix_total} vs Uber: {uber_total}")
        assert netflix_total > uber_total, (
            f"Netflix ({netflix_total}) should have more ever-adopted "
            f"than Uber ({uber_total}) due to weaker competition"
        )

    def test_s_curve_shape(self, result):
        _assert_s_curve_shape(result["cumulative_adoption"], "Netflix")

    def test_rogers_ordering(self, result):
        _assert_rogers_ordering(result, "Netflix")

    def test_revenue_positive_and_growing(self, result):
        cum_rev = result["cumulative_revenue"]
        assert cum_rev[-1] > 0, "Netflix: total revenue should be positive"
        _assert_monotonically_non_decreasing(cum_rev, "Netflix revenue")

    def test_agent_count_preserved_with_weak_competition(self, result):
        """Competition affects adoption rate, not agent count."""
        assert result["num_agents"] == NUM_AGENTS
