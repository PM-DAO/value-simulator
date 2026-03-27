from simulator.agent import (
    Agent, RogersCategory, Gender, Region, IncomeLevel,
    HouseholdType, Beliefs, Desires, Intentions, Social,
    create_agent, ROGERS_CONFIG,
)
import random


def test_create_agent_basic():
    rng = random.Random(42)
    a = create_agent(agent_id=0, rng=rng)
    assert a.id == 0
    assert not a.adopted
    assert a.adopted_day is None
    assert a.p > 0
    assert a.q > 0


def test_agent_rogers_parameters():
    """Innovators should have higher p than laggards."""
    # Create many agents and find specific Rogers types
    rng = random.Random(42)
    agents = [create_agent(agent_id=i, rng=rng) for i in range(200)]

    innovators = [a for a in agents if a.rogers_type == RogersCategory.INNOVATOR]
    laggards = [a for a in agents if a.rogers_type == RogersCategory.LAGGARD]

    assert len(innovators) > 0
    assert len(laggards) > 0
    # Innovators have higher p (innovation coefficient)
    assert innovators[0].p > laggards[0].p


def test_agent_initial_state():
    rng = random.Random(42)
    a = create_agent(agent_id=0, rng=rng)
    assert a.awareness == 0.0
    assert a.adopted is False


def test_rogers_config_proportions_sum_to_one():
    total = sum(c["proportion"] for c in ROGERS_CONFIG.values())
    assert abs(total - 1.0) < 0.01


def test_all_rogers_categories_in_config():
    for cat in RogersCategory:
        assert cat in ROGERS_CONFIG


def test_agent_age_in_range():
    rng = random.Random(42)
    for i in range(100):
        a = create_agent(agent_id=i, rng=rng)
        assert 15 <= a.age <= 90


# --- Day 1: BDI State Model Tests ---


def test_agent_has_beliefs():
    rng = random.Random(42)
    a = create_agent(agent_id=0, rng=rng)
    assert isinstance(a.beliefs, Beliefs)
    assert 0.0 <= a.beliefs.product_awareness <= 1.0
    assert 0.0 <= a.beliefs.brand_perception <= 1.0
    assert a.beliefs.price_expectation >= 0.0
    assert -1.0 <= a.beliefs.peer_opinions <= 1.0


def test_agent_has_desires():
    rng = random.Random(42)
    a = create_agent(agent_id=0, rng=rng)
    assert isinstance(a.desires, Desires)
    assert isinstance(a.desires.jobs_to_be_done, list)
    assert isinstance(a.desires.unmet_needs, list)
    assert a.desires.budget_constraint >= 0.0


def test_agent_has_intentions():
    rng = random.Random(42)
    a = create_agent(agent_id=0, rng=rng)
    assert isinstance(a.intentions, Intentions)
    assert a.intentions.purchase_timeline == -1
    assert a.intentions.channel_preference in ("online", "offline", "mixed")


def test_agent_has_social():
    rng = random.Random(42)
    a = create_agent(agent_id=0, rng=rng)
    assert isinstance(a.social, Social)
    assert 0.0 <= a.social.influence_susceptibility <= 1.0
    assert 0.0 <= a.social.opinion_leadership_score <= 1.0


def test_agent_has_household_type():
    rng = random.Random(42)
    a = create_agent(agent_id=0, rng=rng)
    assert isinstance(a.household_type, HouseholdType)


def test_household_type_enum_values():
    assert len(HouseholdType) == 5
    values = {h.value for h in HouseholdType}
    assert "single" in values
    assert "couple" in values
    assert "family_young" in values
    assert "family_school" in values
    assert "elderly" in values


def test_agent_backward_compat_awareness():
    """awareness field should still work and sync with beliefs.product_awareness."""
    rng = random.Random(42)
    a = create_agent(agent_id=0, rng=rng)
    assert a.awareness == a.beliefs.product_awareness
    assert a.awareness == 0.0


def test_social_influence_varies_by_rogers():
    """Innovators should have lower susceptibility, higher leadership."""
    rng = random.Random(42)
    agents = [create_agent(agent_id=i, rng=rng) for i in range(200)]
    innovators = [a for a in agents if a.rogers_type == RogersCategory.INNOVATOR]
    laggards = [a for a in agents if a.rogers_type == RogersCategory.LAGGARD]
    assert len(innovators) > 0 and len(laggards) > 0
    # Innovators: lower susceptibility, higher leadership
    assert innovators[0].social.influence_susceptibility < laggards[0].social.influence_susceptibility
    assert innovators[0].social.opinion_leadership_score > laggards[0].social.opinion_leadership_score


def test_budget_constraint_correlates_with_income():
    """Higher income agents should have higher budget constraints."""
    rng = random.Random(42)
    agents = [create_agent(agent_id=i, rng=rng) for i in range(200)]
    high_income = [a for a in agents if a.income_level == IncomeLevel.HIGH]
    low_income = [a for a in agents if a.income_level == IncomeLevel.LOW]
    assert len(high_income) > 0 and len(low_income) > 0
    avg_high = sum(a.desires.budget_constraint for a in high_income) / len(high_income)
    avg_low = sum(a.desires.budget_constraint for a in low_income) / len(low_income)
    assert avg_high > avg_low
