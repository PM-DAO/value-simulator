"""Tests for per-agent JTBD fit integration.

Verifies that:
1. Agent demographics map to correct target categories
2. Per-agent jtbd_fit is computed and stored on each agent
3. desires.jobs_to_be_done is populated from category
4. Funnel uses per-agent jtbd_fit (not global)
5. Different demographics produce different jtbd_fit values
"""

from simulator.agent import Agent, Gender, Region, IncomeLevel, HouseholdType, RogersCategory, create_agent
from simulator.jtbd import agent_targets_from_demographics, compute_agent_jtbd_fit, CATEGORY_JOBS, evaluate_jtbd
from simulator.population import generate_population
from simulator.engine import run_simulation


# --- 1. Demographics → Target mapping ---

def test_age_to_target_teens():
    targets = agent_targets_from_demographics(age=17, household_type=HouseholdType.SINGLE)
    assert "teens" in targets

def test_age_to_target_twenties():
    targets = agent_targets_from_demographics(age=25, household_type=HouseholdType.SINGLE)
    assert "twenties" in targets

def test_age_to_target_thirties():
    targets = agent_targets_from_demographics(age=35, household_type=HouseholdType.COUPLE)
    assert "thirties" in targets

def test_age_to_target_sixties_plus():
    targets = agent_targets_from_demographics(age=65, household_type=HouseholdType.ELDERLY)
    assert "sixties_plus" in targets

def test_household_single_maps_to_single():
    targets = agent_targets_from_demographics(age=25, household_type=HouseholdType.SINGLE)
    assert "single" in targets

def test_household_family_young_maps_to_parent():
    targets = agent_targets_from_demographics(age=35, household_type=HouseholdType.FAMILY_YOUNG)
    assert "parent_young_child" in targets

def test_household_family_school_maps_to_parent():
    targets = agent_targets_from_demographics(age=40, household_type=HouseholdType.FAMILY_SCHOOL)
    assert "parent_school_child" in targets

def test_household_couple_maps_to_couple():
    targets = agent_targets_from_demographics(age=30, household_type=HouseholdType.COUPLE)
    assert "couple" in targets

def test_returns_both_age_and_household():
    """Should return at least age target + household target."""
    targets = agent_targets_from_demographics(age=25, household_type=HouseholdType.SINGLE)
    assert len(targets) >= 2


# --- 2. Per-agent jtbd_fit computation ---

def test_compute_agent_jtbd_fit_returns_float():
    fit = compute_agent_jtbd_fit(age=25, household_type=HouseholdType.SINGLE, category="saas")
    assert isinstance(fit, float)
    assert 0.0 <= fit <= 1.0

def test_compute_agent_jtbd_fit_varies_by_age():
    """Different ages should produce different jtbd_fit for the same category."""
    fit_young = compute_agent_jtbd_fit(age=20, household_type=HouseholdType.SINGLE, category="healthcare")
    fit_old = compute_agent_jtbd_fit(age=60, household_type=HouseholdType.SINGLE, category="healthcare")
    # Young vs old should differ (TARGET_ADJUSTMENTS differ)
    assert fit_young != fit_old

def test_compute_agent_jtbd_fit_varies_by_household():
    """Different households should produce different jtbd_fit."""
    fit_single = compute_agent_jtbd_fit(age=35, household_type=HouseholdType.SINGLE, category="healthcare")
    fit_parent = compute_agent_jtbd_fit(age=35, household_type=HouseholdType.FAMILY_YOUNG, category="healthcare")
    assert fit_single != fit_parent


# --- 3. Agent model has jtbd_fit and populated jobs ---

def test_agent_has_jtbd_fit_field():
    """Agent model should have jtbd_fit field."""
    agents = generate_population(5, category="saas", seed=42)
    for a in agents:
        assert hasattr(a, "jtbd_fit")
        assert 0.0 <= a.jtbd_fit <= 1.0

def test_agent_desires_jobs_populated():
    """Agent desires.jobs_to_be_done should be populated from category."""
    agents = generate_population(5, category="food", seed=42)
    for a in agents:
        assert len(a.desires.jobs_to_be_done) > 0

def test_agents_have_different_jtbd_fit():
    """Agents with different demographics should have varying jtbd_fit values."""
    agents = generate_population(50, category="healthcare", seed=42)
    fits = {a.jtbd_fit for a in agents}
    # With 50 agents, we expect more than 1 unique jtbd_fit value
    assert len(fits) > 1


# --- 4. Engine uses per-agent jtbd_fit ---

def test_engine_accepts_category():
    """run_simulation should accept category parameter."""
    result = run_simulation(num_agents=20, num_steps=30, price=500, category="food", seed=42)
    assert result["summary"]["total_adopters"] >= 0

def test_engine_category_affects_adoption():
    """Different categories should produce different adoption patterns."""
    result_health = run_simulation(num_agents=100, num_steps=90, price=500, category="healthcare", seed=42)
    result_entertainment = run_simulation(num_agents=100, num_steps=90, price=500, category="entertainment", seed=42)
    # They should differ (different ODI scores → different jtbd_fit distributions)
    assert result_health["summary"]["total_adopters"] != result_entertainment["summary"]["total_adopters"]

def test_engine_backward_compatible():
    """Without category, engine should still work (defaults to 'saas')."""
    result = run_simulation(num_agents=20, num_steps=30, price=500, seed=42)
    assert len(result["daily_adoption"]) == 30


# --- 5. Agent snapshot includes jtbd_fit ---

def test_agent_snapshot_has_jtbd_fit():
    result = run_simulation(num_agents=20, num_steps=10, price=500, category="food", seed=42)
    for a in result["agent_snapshot"]:
        assert "jtbd_fit" in a
        assert 0.0 <= a["jtbd_fit"] <= 1.0
