from simulator.market import (
    calculate_wtp_distribution,
    price_acceptance,
    apply_price_model_factor,
    apply_competition_effect,
    estimate_tam,
    JAPAN_POPULATION,
)

def test_wtp_positive():
    samples = calculate_wtp_distribution(income_万円=400, price_sensitivity=0.5, n_samples=10)
    for s in samples:
        assert s > 0

def test_wtp_higher_income_higher_wtp():
    low = calculate_wtp_distribution(income_万円=200, price_sensitivity=0.5, n_samples=100)
    high = calculate_wtp_distribution(income_万円=800, price_sensitivity=0.5, n_samples=100)
    assert sum(high) / len(high) > sum(low) / len(low)

def test_price_acceptance():
    assert price_acceptance(1000, 2000) is True
    assert price_acceptance(3000, 2000) is False
    assert price_acceptance(1000, 1000) is True

def test_price_model_free():
    assert apply_price_model_factor(1000, "free") == 0

def test_price_model_subscription():
    assert apply_price_model_factor(1000, "subscription") == 1000

def test_price_model_freemium():
    result = apply_price_model_factor(1000, "freemium")
    assert result < 1000
    assert result > 0

def test_competition_none():
    agents, q = apply_competition_effect(100, 0.38, "none")
    assert agents == 100
    assert q == 0.38

def test_competition_weak():
    agents, q = apply_competition_effect(100, 0.38, "weak")
    assert agents == 100
    assert q < 0.38

def test_competition_strong():
    agents, q = apply_competition_effect(100, 0.38, "strong")
    assert agents == 100
    assert q < 0.38


# --- estimate_tam tests ---

def test_japan_population_constant():
    assert JAPAN_POPULATION == 125_000_000

def test_tam_returns_positive_int():
    tam = estimate_tam("saas", None, 1000)
    assert isinstance(tam, int)
    assert tam > 0

def test_tam_never_exceeds_japan_population():
    tam = estimate_tam("entertainment", None, 0)
    assert tam <= JAPAN_POPULATION

def test_tam_floor():
    """Even the most niche service has a minimum TAM."""
    tam = estimate_tam("saas", ["enterprise"], 100_000)
    assert tam >= 10_000

def test_tam_entertainment_larger_than_saas():
    """Entertainment addresses broader market than B2B SaaS."""
    tam_ent = estimate_tam("entertainment", None, 1000)
    tam_saas = estimate_tam("saas", None, 1000)
    assert tam_ent > tam_saas

def test_tam_high_price_reduces_market():
    """Higher price narrows the addressable market."""
    tam_cheap = estimate_tam("saas", None, 500)
    tam_expensive = estimate_tam("saas", None, 50000)
    assert tam_cheap > tam_expensive

def test_tam_free_maximizes_market():
    """Free (price=0) should not reduce TAM."""
    tam_free = estimate_tam("ec", None, 0)
    tam_paid = estimate_tam("ec", None, 3000)
    assert tam_free >= tam_paid

def test_tam_target_narrows_market():
    """Specifying targets should narrow the TAM."""
    tam_broad = estimate_tam("saas", None, 1000)
    tam_narrow = estimate_tam("saas", ["enterprise"], 1000)
    assert tam_broad > tam_narrow

def test_tam_multiple_age_targets_additive():
    """Multiple age targets should yield larger TAM than a single one."""
    tam_one = estimate_tam("ec", ["twenties"], 1000)
    tam_two = estimate_tam("ec", ["twenties", "thirties"], 1000)
    assert tam_two > tam_one

def test_tam_all_categories_reasonable():
    """Every category should produce a TAM in a reasonable range."""
    categories = ["saas", "ec", "media", "food", "mobility",
                  "healthcare", "education", "entertainment", "finance"]
    for cat in categories:
        tam = estimate_tam(cat, None, 1000)
        assert 1_000_000 <= tam <= 100_000_000, f"{cat}: TAM={tam} out of range"
