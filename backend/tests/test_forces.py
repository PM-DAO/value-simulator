"""Tests for Forces of Progress computation module."""

from simulator.forces import (
    sigmoid,
    compute_f1_push,
    compute_f2_pull,
    compute_f3_anxiety,
    compute_f4_habit,
    compute_switch_score,
    compute_churn_probability,
)
from simulator.agent import Forces


# --- sigmoid ---

def test_sigmoid_zero():
    assert sigmoid(0.0) == 0.5

def test_sigmoid_large_positive():
    assert sigmoid(100.0) > 0.999

def test_sigmoid_large_negative():
    assert sigmoid(-100.0) < 0.001

def test_sigmoid_overflow_safe():
    assert sigmoid(1000.0) == 1.0
    assert sigmoid(-1000.0) == 0.0


# --- F1 Push ---

def test_f1_push_all_zero():
    f = Forces(
        current_solution_frustration=0.0,
        situation_deterioration=0.0,
        unmet_need_severity=0.0,
        life_event_trigger=0.0,
    )
    assert compute_f1_push(f) == 0.0

def test_f1_push_all_one():
    f = Forces(
        current_solution_frustration=1.0,
        situation_deterioration=1.0,
        unmet_need_severity=1.0,
        life_event_trigger=1.0,
    )
    assert compute_f1_push(f) == 1.0

def test_f1_push_weights_sum_to_one():
    """Weights should sum to 1.0 so all-ones gives 1.0."""
    assert 0.35 + 0.20 + 0.30 + 0.15 == 1.0


# --- F2 Pull ---

def test_f2_pull_all_zero():
    f = Forces(perceived_value=0.0, social_proof_strength=0.0,
               brand_trust=0.0, novelty_appeal=0.0, aspirational_identity=0.0)
    assert compute_f2_pull(f) == 0.0

def test_f2_pull_all_one():
    f = Forces(perceived_value=1.0, social_proof_strength=1.0,
               brand_trust=1.0, novelty_appeal=1.0, aspirational_identity=1.0)
    assert compute_f2_pull(f) == 1.0

def test_f2_pull_weights_sum_to_one():
    assert 0.30 + 0.25 + 0.20 + 0.15 + 0.10 == 1.0


# --- F3 Anxiety ---

def test_f3_anxiety_all_zero():
    f = Forces(performance_uncertainty=0.0, financial_risk=0.0,
               social_risk=0.0, effort_risk=0.0, lock_in_fear=0.0)
    assert compute_f3_anxiety(f) == 0.0

def test_f3_anxiety_all_one():
    f = Forces(performance_uncertainty=1.0, financial_risk=1.0,
               social_risk=1.0, effort_risk=1.0, lock_in_fear=1.0)
    assert compute_f3_anxiety(f) == 1.0

def test_f3_anxiety_weights_sum_to_one():
    assert 0.25 + 0.25 + 0.20 + 0.15 + 0.15 == 1.0


# --- F4 Habit ---

def test_f4_habit_all_zero():
    f = Forces(behavioral_automaticity=0.0, sunk_cost_perception=0.0,
               network_effects_lock_in=0.0, cognitive_load_of_change=0.0)
    assert compute_f4_habit(f) == 0.0

def test_f4_habit_all_one():
    f = Forces(behavioral_automaticity=1.0, sunk_cost_perception=1.0,
               network_effects_lock_in=1.0, cognitive_load_of_change=1.0)
    assert compute_f4_habit(f) == 1.0

def test_f4_habit_weights_sum_to_one():
    assert 0.30 + 0.25 + 0.25 + 0.20 == 1.0


# --- Switch Score ---

def test_switch_score_max_push_pull():
    """All push+pull maxed, all anxiety+habit zeroed → high switch."""
    f = Forces(
        current_solution_frustration=1.0, situation_deterioration=1.0,
        unmet_need_severity=1.0, life_event_trigger=1.0,
        perceived_value=1.0, social_proof_strength=1.0,
        brand_trust=1.0, novelty_appeal=1.0, aspirational_identity=1.0,
        performance_uncertainty=0.0, financial_risk=0.0,
        social_risk=0.0, effort_risk=0.0, lock_in_fear=0.0,
        behavioral_automaticity=0.0, sunk_cost_perception=0.0,
        network_effects_lock_in=0.0, cognitive_load_of_change=0.0,
    )
    score = compute_switch_score(f)
    assert score > 0.95

def test_switch_score_max_resistance():
    """All push+pull zeroed, all anxiety+habit maxed → very low switch."""
    f = Forces(
        current_solution_frustration=0.0, situation_deterioration=0.0,
        unmet_need_severity=0.0, life_event_trigger=0.0,
        perceived_value=0.0, social_proof_strength=0.0,
        brand_trust=0.0, novelty_appeal=0.0, aspirational_identity=0.0,
        performance_uncertainty=1.0, financial_risk=1.0,
        social_risk=1.0, effort_risk=1.0, lock_in_fear=1.0,
        behavioral_automaticity=1.0, sunk_cost_perception=1.0,
        network_effects_lock_in=1.0, cognitive_load_of_change=1.0,
    )
    score = compute_switch_score(f)
    assert score < 0.01

def test_switch_score_in_unit_range():
    """Default forces should produce a switch score in (0, 1)."""
    f = Forces()
    score = compute_switch_score(f)
    assert 0.0 < score < 1.0


# --- Churn Probability ---

def test_churn_high_satisfaction_low_churn():
    """High satisfaction should strongly suppress but not eliminate churn."""
    f = Forces(churn_probability=0.05, post_purchase_satisfaction=0.9,
               regret_probability=0.0, engagement_decay_rate=0.0)
    prob = compute_churn_probability(f, days_since_adoption=30)
    assert prob < 0.02  # satisfaction dampens churn significantly

def test_churn_low_satisfaction_high_regret():
    """Low satisfaction + high regret → measurable churn."""
    f = Forces(churn_probability=0.1, post_purchase_satisfaction=0.2,
               regret_probability=0.8, engagement_decay_rate=0.02)
    prob = compute_churn_probability(f, days_since_adoption=30)
    assert prob > 0.0

def test_churn_engagement_decay_increases_over_time():
    """Churn should increase with time due to engagement decay."""
    f = Forces(churn_probability=0.05, post_purchase_satisfaction=0.3,
               regret_probability=0.2, engagement_decay_rate=0.02)
    prob_early = compute_churn_probability(f, days_since_adoption=10)
    prob_late = compute_churn_probability(f, days_since_adoption=180)
    assert prob_late > prob_early

def test_churn_capped_at_max():
    """Churn probability should never exceed cap."""
    f = Forces(churn_probability=0.5, post_purchase_satisfaction=0.0,
               regret_probability=1.0, engagement_decay_rate=0.1)
    prob = compute_churn_probability(f, days_since_adoption=365)
    assert prob <= 0.2

def test_churn_never_negative():
    """Churn probability should never be negative."""
    f = Forces(churn_probability=0.01, post_purchase_satisfaction=1.0,
               regret_probability=0.0, engagement_decay_rate=0.0)
    prob = compute_churn_probability(f, days_since_adoption=0)
    assert prob >= 0.0
