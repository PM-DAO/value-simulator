"""Population generation module using Japan demographics."""

import random

from simulator.agent import Agent, create_agent


def generate_population(
    n: int,
    base_p: float = 0.005,
    base_q: float = 0.10,
    seed: int | None = None,
    category: str = "saas",
    custom_jobs: list | None = None,
    target_groups: list[str] | None = None,
    critical_lifestyle_tags: list[dict] | None = None,
) -> list[Agent]:
    """Generate a population of n agents with Japan-based demographics.

    Args:
        n: Number of agents to generate
        base_p: Base innovation coefficient (Bass model p)
        base_q: Base imitation coefficient (Bass model q)
        seed: Random seed for reproducibility
        category: Service category for per-agent JTBD fit calculation
        custom_jobs: LLM-inferred custom Job dicts for service-specific fit
        target_groups: LLM-inferred target demographics for affinity scoring
        critical_lifestyle_tags: LLM-inferred critical lifestyle tags for fit scoring

    Returns:
        List of Agent instances
    """
    rng = random.Random(seed)
    agents = [
        create_agent(
            i, base_p, base_q, rng,
            category=category,
            custom_jobs=custom_jobs,
            target_groups=target_groups,
            critical_lifestyle_tags=critical_lifestyle_tags,
        )
        for i in range(n)
    ]
    return agents
