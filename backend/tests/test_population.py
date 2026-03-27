from simulator.population import generate_population
from simulator.agent import (
    RogersCategory, IncomeLevel, HouseholdType,
    Beliefs, Desires, Intentions, Social,
)


def test_generate_correct_count():
    pop = generate_population(n=100, seed=42)
    assert len(pop) == 100


def test_generate_10_agents():
    pop = generate_population(n=10, seed=42)
    assert len(pop) == 10


def test_unique_ids():
    pop = generate_population(n=50, seed=42)
    ids = [a.id for a in pop]
    assert len(set(ids)) == 50


def test_age_in_range():
    pop = generate_population(n=100, seed=42)
    for a in pop:
        assert 15 <= a.age <= 90


def test_all_agents_not_adopted():
    pop = generate_population(n=50, seed=42)
    for a in pop:
        assert not a.adopted
        assert a.adopted_day is None


def test_reproducibility_with_seed():
    pop1 = generate_population(n=50, seed=123)
    pop2 = generate_population(n=50, seed=123)
    for a1, a2 in zip(pop1, pop2):
        assert a1.age == a2.age
        assert a1.rogers_type == a2.rogers_type


def test_rogers_types_present():
    """With 100 agents, most Rogers categories should be represented."""
    pop = generate_population(n=100, seed=42)
    types_present = {a.rogers_type for a in pop}
    assert len(types_present) >= 3


# --- Day 1: BDI Population Tests ---


def test_population_has_bdi_models():
    pop = generate_population(n=50, seed=42)
    for a in pop:
        assert isinstance(a.beliefs, Beliefs)
        assert isinstance(a.desires, Desires)
        assert isinstance(a.intentions, Intentions)
        assert isinstance(a.social, Social)


def test_population_has_household_type():
    pop = generate_population(n=100, seed=42)
    types_present = {a.household_type for a in pop}
    assert len(types_present) >= 3
    for a in pop:
        assert isinstance(a.household_type, HouseholdType)


def test_population_budget_constraint_positive():
    pop = generate_population(n=50, seed=42)
    for a in pop:
        assert a.desires.budget_constraint > 0


def test_population_social_initialized():
    pop = generate_population(n=50, seed=42)
    for a in pop:
        assert 0.0 <= a.social.influence_susceptibility <= 1.0
        assert 0.0 <= a.social.opinion_leadership_score <= 1.0


def test_population_bdi_reproducibility():
    pop1 = generate_population(n=50, seed=123)
    pop2 = generate_population(n=50, seed=123)
    for a1, a2 in zip(pop1, pop2):
        assert a1.household_type == a2.household_type
        assert a1.desires.budget_constraint == a2.desires.budget_constraint
        assert a1.social.influence_susceptibility == a2.social.influence_susceptibility
