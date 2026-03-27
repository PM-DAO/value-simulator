"""Market dynamics module: WTP distribution, utility, competition effects, TAM estimation."""

import math
import random

JAPAN_POPULATION = 125_000_000

# Fraction of Japan population addressable by each service category
CATEGORY_TAM_FRACTION: dict[str, float] = {
    "saas": 0.08,           # ~10M working-age knowledge workers
    "ec": 0.55,             # broad consumer base
    "media": 0.55,          # broad consumer base
    "food": 0.50,           # broad
    "mobility": 0.25,       # urban + suburban drivers
    "healthcare": 0.40,     # health-conscious adults
    "education": 0.25,      # students + skill upgraders
    "entertainment": 0.60,  # broadest
    "finance": 0.30,        # financially active adults
}

# Fraction of population each target segment represents
TARGET_POPULATION_FRACTION: dict[str, float] = {
    # Age groups (roughly based on Japan demographics)
    "teens": 0.08,
    "twenties": 0.10,
    "thirties": 0.11,
    "forties": 0.13,
    "fifties": 0.12,
    "sixties_plus": 0.28,
    # Occupation / life stage
    "student": 0.12,
    "new_graduate": 0.02,
    "working_professional": 0.45,
    "freelancer": 0.05,
    "homemaker": 0.10,
    "retired": 0.20,
    # Household
    "single": 0.30,
    "couple": 0.20,
    "parent_young_child": 0.08,
    "parent_school_child": 0.10,
    # B2B (fraction of working population that represents these orgs)
    "startup": 0.01,
    "smb": 0.05,
    "enterprise": 0.03,
}

# Target groups: targets within the same group are additive (union),
# targets across groups are multiplicative (intersection)
TARGET_GROUPS: dict[str, list[str]] = {
    "age": ["teens", "twenties", "thirties", "forties", "fifties", "sixties_plus"],
    "occupation": ["student", "new_graduate", "working_professional", "freelancer", "homemaker", "retired"],
    "household": ["single", "couple", "parent_young_child", "parent_school_child"],
    "business": ["startup", "smb", "enterprise"],
}


def _price_ceiling_factor(price: int) -> float:
    """Higher price reduces the addressable market."""
    if price <= 0:
        return 1.0
    if price < 1000:
        return 1.0
    if price < 3000:
        return 0.85
    if price < 10000:
        return 0.6
    return 0.3


def _target_group_of(target: str) -> str | None:
    for group, members in TARGET_GROUPS.items():
        if target in members:
            return group
    return None


def estimate_tam(
    category: str,
    target: list[str] | None,
    price: int,
) -> int:
    """Estimate Total Addressable Market from service characteristics.

    Args:
        category: Service category (saas, ec, media, etc.)
        target: Target segments (optional)
        price: Monthly price in yen

    Returns:
        Estimated TAM as integer (number of people)
    """
    base = JAPAN_POPULATION * CATEGORY_TAM_FRACTION.get(category, 0.10)

    # Apply target narrowing
    if target:
        # Group targets by their group, then:
        #   within a group: additive (union) — sum of fractions
        #   across groups: multiplicative (intersection)
        groups: dict[str, float] = {}
        for t in target:
            group = _target_group_of(t)
            if group is None:
                continue
            frac = TARGET_POPULATION_FRACTION.get(t, 0.10)
            groups[group] = groups.get(group, 0.0) + frac

        # Cap each group at 1.0, then multiply across groups
        if groups:
            multiplier = 1.0
            for frac_sum in groups.values():
                multiplier *= min(frac_sum, 1.0)
            base *= multiplier

    # Apply price ceiling
    base *= _price_ceiling_factor(price)

    # Floor
    return max(10_000, round(base))

def calculate_wtp_distribution(
    income_万円: int,
    price_sensitivity: float,
    n_samples: int = 1,
) -> list[float]:
    """Generate WTP (Willingness to Pay) samples from log-normal distribution.

    Args:
        income_万円: Annual income in 万円
        price_sensitivity: 0-1 (higher = more sensitive to price)
        n_samples: Number of samples

    Returns:
        List of monthly WTP values in yen
    """
    # Monthly disposable income calculation for Japan:
    # - Monthly gross = annual / 12
    # - After tax & social insurance: ~75% of gross (effective rate ~25%)
    # - After fixed costs (housing, food, utilities): ~30% remains as discretionary
    # - WTP for a *single new service* is a fraction of discretionary spending
    monthly_gross = income_万円 * 10000 / 12
    monthly_discretionary = monthly_gross * 0.75 * 0.30  # ~22.5% of gross

    # Log-normal parameters based on income and sensitivity
    # Median WTP = fraction of discretionary income, reduced by price sensitivity
    # A typical Japanese consumer might spend 3-10% of discretionary income on a new service
    median_wtp = monthly_discretionary * 0.08 * (1.0 - price_sensitivity * 0.5)
    median_wtp = max(100, median_wtp)  # Floor at 100 yen

    mu = math.log(median_wtp)
    sigma = 0.4 + price_sensitivity * 0.4  # More price-sensitive = more variance

    samples = [random.lognormvariate(mu, sigma) for _ in range(n_samples)]
    return [round(s, 0) for s in samples]

def price_acceptance(price: int, wtp: float) -> bool:
    """Check if agent accepts the price."""
    return price <= wtp

def apply_price_model_factor(price: int, price_model: str) -> int:
    """Adjust effective price based on pricing model.

    free: price = 0
    freemium: price * 0.3 (most users on free tier)
    subscription: price as-is
    usage: price * 0.7 (perceived as cheaper)
    one_time: price / 12 (amortized monthly)
    """
    factors = {
        "free": 0.0,
        "freemium": 0.3,
        "subscription": 1.0,
        "usage": 0.7,
        "one_time": 1.0 / 12.0,
    }
    factor = factors.get(price_model, 1.0)
    return max(0, round(price * factor))

def apply_competition_effect(
    num_agents: int,
    base_q: float,
    competition: str,
) -> tuple[int, float]:
    """Apply competition effects on adoption rate (q parameter).

    Competition reduces the imitation coefficient, making adoption harder,
    but does NOT reduce the number of agents (market size is user-specified).

    Returns (num_agents, adjusted_q)
    """
    if competition == "weak":
        return num_agents, base_q * 0.8
    elif competition == "strong":
        return num_agents, base_q * 0.5
    return num_agents, base_q
