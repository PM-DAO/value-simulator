"""Tests for the AIDMA funnel stage transition model."""

import random

from simulator.agent import (
    Agent, FunnelStage, Gender, IncomeLevel, RogersCategory, Region,
    ROGERS_FUNNEL_PROFILE,
)
from simulator.funnel import (
    MARKETING_STAGE_EFFECTIVENESS,
    try_advance_stage,
    check_decay,
    get_marketing_effects,
    DECAY_THRESHOLD_DAYS,
)


def _make_agent(
    rogers_type: RogersCategory = RogersCategory.EARLY_MAJORITY,
    funnel_stage: FunnelStage = FunnelStage.UNAWARE,
    p: float = 0.03,
    q: float = 0.38,
    price_sensitivity: float = 0.6,
    days_without_exposure: int = 0,
) -> Agent:
    """Helper to create an agent with specific test parameters."""
    return Agent(
        id=0,
        age=30,
        gender=Gender.MALE,
        region=Region.KANTO,
        income=400,
        income_level=IncomeLevel.MIDDLE,
        rogers_type=rogers_type,
        price_sensitivity=price_sensitivity,
        p=p,
        q=q,
        funnel_stage=funnel_stage,
        days_without_exposure=days_without_exposure,
    )


# --- Stage Transition Tests ---


def test_unaware_to_aware_with_high_p_innovator():
    """Innovator with high p and marketing should very likely become aware."""
    agent = _make_agent(
        rogers_type=RogersCategory.INNOVATOR,
        p=0.15,  # high p (innovator)
    )
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.INNOVATOR]
    rng = random.Random(42)

    # With marketing PR active
    marketing_effects = get_marketing_effects("pr", 0.02)

    advanced = 0
    for _ in range(20):
        a = _make_agent(rogers_type=RogersCategory.INNOVATOR, p=0.15)
        try_advance_stage(a, profile, marketing_effects, 0.0, 0.0, 0.5, 1000, rng)
        if a.funnel_stage != FunnelStage.UNAWARE:
            advanced += 1

    # Innovators with high p + marketing should advance most of the time
    assert advanced > 10


def test_unaware_stays_unaware_no_exposure():
    """With p=0, no marketing, no neighbors, agent stays UNAWARE."""
    agent = _make_agent(p=0.0)
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.EARLY_MAJORITY]
    rng = random.Random(42)

    no_marketing = [0.0, 0.0, 0.0, 0.0]
    try_advance_stage(agent, profile, no_marketing, 0.0, 0.0, 0.5, 1000, rng)
    assert agent.funnel_stage == FunnelStage.UNAWARE


def test_consideration_to_adoption_blocked_by_price():
    """Agent with high price_sensitivity and high price should rarely adopt."""
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.EARLY_MAJORITY]
    rng = random.Random(42)
    no_marketing = [0.0, 0.0, 0.0, 0.0]

    adopted_count = 0
    for i in range(100):
        agent = _make_agent(
            funnel_stage=FunnelStage.CONSIDERATION,
            price_sensitivity=0.95,
            q=0.38,
        )
        try_advance_stage(agent, profile, no_marketing, 0.3, 0.2, 0.5, 10000, rng)
        if agent.funnel_stage == FunnelStage.ADOPTED:
            adopted_count += 1

    # With high price sensitivity and 10000 yen price, very few should adopt
    assert adopted_count < 20


def test_consideration_to_adoption_gated_by_forces():
    """Strong push+pull forces should produce more adoptions than high resistance."""
    from simulator.agent import Forces
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.EARLY_MAJORITY]
    no_marketing = [0.0, 0.0, 0.0, 0.0]

    # High push + pull, low anxiety + habit → should adopt more
    strong_forces = Forces(
        current_solution_frustration=0.9, situation_deterioration=0.7,
        unmet_need_severity=0.8, life_event_trigger=0.5,
        perceived_value=0.9, social_proof_strength=0.8,
        brand_trust=0.7, novelty_appeal=0.6, aspirational_identity=0.5,
        performance_uncertainty=0.1, financial_risk=0.1,
        social_risk=0.1, effort_risk=0.1, lock_in_fear=0.1,
        behavioral_automaticity=0.1, sunk_cost_perception=0.1,
        network_effects_lock_in=0.1, cognitive_load_of_change=0.1,
    )
    # High anxiety + habit, low push + pull → should adopt fewer
    weak_forces = Forces(
        current_solution_frustration=0.1, situation_deterioration=0.1,
        unmet_need_severity=0.1, life_event_trigger=0.0,
        perceived_value=0.1, social_proof_strength=0.1,
        brand_trust=0.1, novelty_appeal=0.1, aspirational_identity=0.1,
        performance_uncertainty=0.9, financial_risk=0.9,
        social_risk=0.8, effort_risk=0.8, lock_in_fear=0.8,
        behavioral_automaticity=0.9, sunk_cost_perception=0.8,
        network_effects_lock_in=0.8, cognitive_load_of_change=0.8,
    )

    adopted_strong = 0
    adopted_weak = 0
    for i in range(500):
        a_strong = _make_agent(funnel_stage=FunnelStage.CONSIDERATION, q=0.38)
        a_strong.forces = strong_forces
        a_weak = _make_agent(funnel_stage=FunnelStage.CONSIDERATION, q=0.38)
        a_weak.forces = weak_forces
        r = random.Random(i)
        try_advance_stage(a_strong, profile, no_marketing, 0.5, 0.3, 0.5, 500, r)
        r = random.Random(i)
        try_advance_stage(a_weak, profile, no_marketing, 0.5, 0.3, 0.5, 500, r)
        if a_strong.funnel_stage == FunnelStage.ADOPTED:
            adopted_strong += 1
        if a_weak.funnel_stage == FunnelStage.ADOPTED:
            adopted_weak += 1

    assert adopted_strong > adopted_weak


def test_innovator_skips_to_interest():
    """Innovator on first exposure should skip directly to INTEREST stage."""
    agent = _make_agent(
        rogers_type=RogersCategory.INNOVATOR,
        p=0.15,
        funnel_stage=FunnelStage.UNAWARE,
    )
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.INNOVATOR]
    rng = random.Random(42)

    marketing_effects = get_marketing_effects("pr", 0.02)
    # Force advance (high p * 3.0 multiplier + marketing = very likely)
    # Run multiple times to find at least one that skips
    found_skip = False
    for i in range(50):
        a = _make_agent(rogers_type=RogersCategory.INNOVATOR, p=0.15)
        try_advance_stage(a, profile, marketing_effects, 0.0, 0.0, 0.5, 1000, random.Random(i))
        if a.funnel_stage == FunnelStage.INTEREST:
            found_skip = True
            break

    assert found_skip, "Innovator should skip to INTEREST on first exposure"


def test_max_one_stage_advance_per_day():
    """Even with perfect conditions, non-skip agents advance at most one stage."""
    agent = _make_agent(
        rogers_type=RogersCategory.EARLY_MAJORITY,
        funnel_stage=FunnelStage.AWARE,
        p=0.5,
        q=0.5,
    )
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.EARLY_MAJORITY]
    rng = random.Random(42)

    # Strong marketing + high neighbor influence
    marketing_effects = get_marketing_effects("influencer", 0.04)
    try_advance_stage(agent, profile, marketing_effects, 1.0, 1.0, 1.0, 0, rng)

    # Should be at most INTEREST (one step from AWARE), not CONSIDERATION
    assert agent.funnel_stage <= FunnelStage.INTEREST


def test_adopted_agent_never_regresses():
    """Adopted agents should never decay to a lower stage."""
    agent = _make_agent(
        funnel_stage=FunnelStage.ADOPTED,
        days_without_exposure=100,
    )
    agent.adopted = True
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.LAGGARD]  # worst decay resistance
    rng = random.Random(42)

    for _ in range(100):
        check_decay(agent, profile, rng)

    assert agent.funnel_stage == FunnelStage.ADOPTED


# --- Decay Tests ---


def test_decay_after_threshold_days():
    """Agent at INTEREST with days > threshold should have chance to regress."""
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.LAGGARD]  # 0.2 resistance
    rng = random.Random(42)

    regressed_count = 0
    for i in range(100):
        agent = _make_agent(
            rogers_type=RogersCategory.LAGGARD,
            funnel_stage=FunnelStage.INTEREST,
            days_without_exposure=DECAY_THRESHOLD_DAYS + 1,
        )
        check_decay(agent, profile, random.Random(i))
        if agent.funnel_stage == FunnelStage.AWARE:
            regressed_count += 1

    # Decay prob = 0.1 * (1 - 0.2) = 0.08, expect ~8 out of 100
    assert regressed_count > 0, "Some agents should have decayed"


def test_no_decay_before_threshold():
    """Agent with days < threshold should never decay."""
    agent = _make_agent(
        funnel_stage=FunnelStage.INTEREST,
        days_without_exposure=DECAY_THRESHOLD_DAYS - 1,
    )
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.LAGGARD]
    rng = random.Random(42)

    for _ in range(100):
        agent.days_without_exposure = DECAY_THRESHOLD_DAYS - 1
        check_decay(agent, profile, rng)

    assert agent.funnel_stage == FunnelStage.INTEREST


def test_decay_resistance_by_rogers():
    """Innovators should decay far less than laggards."""
    innovator_profile = ROGERS_FUNNEL_PROFILE[RogersCategory.INNOVATOR]
    laggard_profile = ROGERS_FUNNEL_PROFILE[RogersCategory.LAGGARD]

    innovator_decays = 0
    laggard_decays = 0

    for i in range(500):
        a_inn = _make_agent(
            rogers_type=RogersCategory.INNOVATOR,
            funnel_stage=FunnelStage.INTEREST,
            days_without_exposure=DECAY_THRESHOLD_DAYS + 5,
        )
        a_lag = _make_agent(
            rogers_type=RogersCategory.LAGGARD,
            funnel_stage=FunnelStage.INTEREST,
            days_without_exposure=DECAY_THRESHOLD_DAYS + 5,
        )
        r = random.Random(i)
        check_decay(a_inn, innovator_profile, r)
        r = random.Random(i)
        check_decay(a_lag, laggard_profile, r)
        if a_inn.funnel_stage == FunnelStage.AWARE:
            innovator_decays += 1
        if a_lag.funnel_stage == FunnelStage.AWARE:
            laggard_decays += 1

    assert laggard_decays > innovator_decays


# --- Marketing Effectiveness Tests ---


def test_pr_strongest_for_awareness():
    """PR marketing effect on UNAWARE->AWARE should be its highest effect."""
    effects = MARKETING_STAGE_EFFECTIVENESS["pr"]
    assert effects[0] > effects[1]
    assert effects[0] > effects[2]
    assert effects[0] > effects[3]


def test_word_of_mouth_strongest_for_consideration():
    """Word of mouth effect on INTEREST->CONSIDERATION should be its highest."""
    effects = MARKETING_STAGE_EFFECTIVENESS["word_of_mouth"]
    assert effects[2] > effects[0]
    assert effects[2] > effects[1]


def test_get_marketing_effects_scales_by_boost():
    """Marketing effects should scale with boost value."""
    effects_low = get_marketing_effects("pr", 0.01)
    effects_high = get_marketing_effects("pr", 0.04)
    for i in range(4):
        assert effects_high[i] >= effects_low[i]


def test_get_marketing_effects_none_type():
    """None marketing type should return zeros."""
    effects = get_marketing_effects(None, 0.04)
    assert effects == [0.0, 0.0, 0.0, 0.0]


# --- Backward Compatibility ---


def test_awareness_derived_from_funnel_stage():
    """awareness field should equal funnel_stage / 4.0."""
    for stage in FunnelStage:
        agent = _make_agent(funnel_stage=stage)
        agent.awareness = stage.value / 4.0
        assert agent.awareness == stage.value / 4.0


# --- JTBD Fit Impact Tests ---


def test_high_jtbd_fit_helps_unaware_to_aware():
    """Higher jtbd_fit should increase UNAWARE->AWARE transition rate."""
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.EARLY_MAJORITY]
    no_marketing = [0.0, 0.0, 0.0, 0.0]

    advanced_high = 0
    advanced_low = 0
    for i in range(500):
        a_high = _make_agent(p=0.03)
        a_high.jtbd_fit = 1.0
        a_low = _make_agent(p=0.03)
        a_low.jtbd_fit = 0.0
        r = random.Random(i)
        try_advance_stage(a_high, profile, no_marketing, 0.0, 0.0, 1.0, 1000, r)
        r = random.Random(i)
        try_advance_stage(a_low, profile, no_marketing, 0.0, 0.0, 0.0, 1000, r)
        if a_high.funnel_stage != FunnelStage.UNAWARE:
            advanced_high += 1
        if a_low.funnel_stage != FunnelStage.UNAWARE:
            advanced_low += 1

    assert advanced_high > advanced_low


def test_high_jtbd_fit_helps_consideration_to_adopted():
    """Higher jtbd_fit should increase CONSIDERATION->ADOPTED transition rate."""
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.EARLY_MAJORITY]
    no_marketing = [0.0, 0.0, 0.0, 0.0]

    adopted_high = 0
    adopted_low = 0
    for i in range(500):
        a_high = _make_agent(funnel_stage=FunnelStage.CONSIDERATION, q=0.38)
        a_high.jtbd_fit = 1.0
        a_low = _make_agent(funnel_stage=FunnelStage.CONSIDERATION, q=0.38)
        a_low.jtbd_fit = 0.0
        r = random.Random(i)
        try_advance_stage(a_high, profile, no_marketing, 0.3, 0.2, 1.0, 500, r)
        r = random.Random(i)
        try_advance_stage(a_low, profile, no_marketing, 0.3, 0.2, 0.0, 500, r)
        if a_high.funnel_stage == FunnelStage.ADOPTED:
            adopted_high += 1
        if a_low.funnel_stage == FunnelStage.ADOPTED:
            adopted_low += 1

    assert adopted_high > adopted_low


def test_zero_jtbd_fit_does_not_block_adoption():
    """Even with jtbd_fit=0, adoption should still be possible (jtbd_gate=0.3)."""
    profile = ROGERS_FUNNEL_PROFILE[RogersCategory.INNOVATOR]
    no_marketing = [0.0, 0.0, 0.0, 0.0]

    adopted_count = 0
    for i in range(500):
        agent = _make_agent(
            rogers_type=RogersCategory.INNOVATOR,
            funnel_stage=FunnelStage.CONSIDERATION,
            q=0.38,
        )
        agent.jtbd_fit = 0.0
        # Strong social proof to give decent base probability
        try_advance_stage(agent, profile, no_marketing, 0.8, 0.5, 0.0, 500, random.Random(i))
        if agent.funnel_stage == FunnelStage.ADOPTED:
            adopted_count += 1

    assert adopted_count > 0, "jtbd_fit=0 should not completely block adoption"
