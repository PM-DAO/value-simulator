"""Forces of Progress: switch decision math and post-adoption dynamics.

Implements Bob Moesta's Switch Framework:
- F1 Push: dissatisfaction with current situation
- F2 Pull: attraction to new solution
- F3 Anxiety: fear/uncertainty about new solution
- F4 Habit: inertia of current behavior

Switch probability = sigmoid(α × (F1 + F2 - F3 - F4) - bias)
"""

import math


def sigmoid(x: float) -> float:
    """Standard logistic sigmoid, maps any real to (0, 1)."""
    if x < -500:
        return 0.0
    if x > 500:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def compute_f1_push(forces) -> float:
    """F1 Push score: weighted sum of push factors. Range [0, 1]."""
    return (
        0.35 * forces.current_solution_frustration
        + 0.20 * forces.situation_deterioration
        + 0.30 * forces.unmet_need_severity
        + 0.15 * forces.life_event_trigger
    )


def compute_f2_pull(forces) -> float:
    """F2 Pull score: weighted sum of pull factors. Range [0, 1]."""
    return (
        0.30 * forces.perceived_value
        + 0.25 * forces.social_proof_strength
        + 0.20 * forces.brand_trust
        + 0.15 * forces.novelty_appeal
        + 0.10 * forces.aspirational_identity
    )


def compute_f3_anxiety(forces) -> float:
    """F3 Anxiety score: higher means more resistance. Range [0, 1]."""
    return (
        0.25 * forces.performance_uncertainty
        + 0.25 * forces.financial_risk
        + 0.20 * forces.social_risk
        + 0.15 * forces.effort_risk
        + 0.15 * forces.lock_in_fear
    )


def compute_f4_habit(forces) -> float:
    """F4 Habit score: higher means more inertia. Range [0, 1]."""
    return (
        0.30 * forces.behavioral_automaticity
        + 0.25 * forces.sunk_cost_perception
        + 0.25 * forces.network_effects_lock_in
        + 0.20 * forces.cognitive_load_of_change
    )


def compute_switch_score(forces) -> float:
    """Sigmoid switch score for adoption gate.

    switch = sigmoid(α × ((F1 + F2) - (F3 + F4)) - bias)

    α=4.0 controls steepness, bias=2.0 sets the threshold so that
    push+pull must meaningfully exceed anxiety+habit for adoption.

    Returns float in (0, 1).
    """
    f1 = compute_f1_push(forces)
    f2 = compute_f2_pull(forces)
    f3 = compute_f3_anxiety(forces)
    f4 = compute_f4_habit(forces)
    net = (f1 + f2) - (f3 + f4)
    return sigmoid(4.0 * net - 2.0)


def compute_churn_probability(forces, days_since_adoption: int) -> float:
    """Compute daily churn probability for an adopted agent.

    Churn increases with:
    - base churn_probability (Rogers-dependent)
    - engagement_decay_rate over time
    - regret_probability

    Churn decreases with:
    - post_purchase_satisfaction

    Returns daily churn probability in [0, 1].
    """
    decay_factor = 1.0 + forces.engagement_decay_rate * min(days_since_adoption, 365)
    base = forces.churn_probability * decay_factor
    # Multiplicative satisfaction dampening: high satisfaction reduces churn, never eliminates it
    satisfaction_factor = 1.0 - forces.post_purchase_satisfaction * 0.7  # range: 0.3 to 1.0
    regret_boost = 1.0 + forces.regret_probability * 2.0  # range: 1.0 to 3.0
    daily_prob = base * satisfaction_factor * regret_boost
    return max(0.0, min(0.2, daily_prob))  # cap at 20% daily churn
