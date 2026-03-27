from simulator.diffusion import bass_diffusion, agent_based_diffusion_step
from simulator.population import generate_population
from simulator.network import build_network
import random


def test_bass_returns_correct_length():
    result = bass_diffusion(p=0.03, q=0.38, m=100_000, t=90)
    assert len(result["daily_adoption"]) == 90
    assert len(result["cumulative_adoption"]) == 90


def test_bass_cumulative_monotonic():
    result = bass_diffusion(p=0.03, q=0.38, m=100_000, t=90)
    cum = result["cumulative_adoption"]
    for i in range(len(cum) - 1):
        assert cum[i] <= cum[i + 1]


def test_bass_daily_nonnegative():
    result = bass_diffusion(p=0.03, q=0.38, m=100_000, t=90)
    for val in result["daily_adoption"]:
        assert val >= 0


def test_bass_total_within_market():
    result = bass_diffusion(p=0.03, q=0.38, m=100_000, t=90)
    assert result["cumulative_adoption"][-1] <= 100_000


def test_bass_higher_p_faster_adoption():
    slow = bass_diffusion(p=0.03, q=0.38, m=10000, t=90)
    fast = bass_diffusion(p=0.06, q=0.38, m=10000, t=90)
    assert fast["cumulative_adoption"][-1] >= slow["cumulative_adoption"][-1]


def test_agent_diffusion_step_basic():
    agents = generate_population(n=20, seed=42)
    G = build_network(20, seed=42)
    rng = random.Random(42)
    new_adopters, churned = agent_based_diffusion_step(agents, G, day=1, price=100, rng=rng)
    assert new_adopters >= 0
    assert churned >= 0


def test_agent_diffusion_no_adopt_already_adopted():
    """If all agents already adopted, no new adopters."""
    agents = generate_population(n=10, seed=42)
    G = build_network(10, seed=42)
    for a in agents:
        a.adopted = True
        a.adopted_day = 0
    rng = random.Random(42)
    new_adopters, churned = agent_based_diffusion_step(agents, G, day=1, price=100, rng=rng)
    assert new_adopters == 0
