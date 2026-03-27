"""Bass diffusion model: both analytical and agent-based implementations."""

import math
import random

import networkx as nx

from simulator.agent import Agent, FunnelStage, ROGERS_FUNNEL_PROFILE
from simulator.forces import compute_churn_probability
from simulator.funnel import try_advance_stage, check_decay, get_marketing_effects


def bass_diffusion(
    p: float,
    q: float,
    m: int,
    t: int,
) -> dict:
    """Analytical Bass diffusion model.

    Args:
        p: Innovation coefficient
        q: Imitation coefficient
        m: Total market potential
        t: Number of time steps

    Returns:
        dict with daily_adoption, cumulative_adoption
    """
    daily = []
    cumulative = []
    total_adopted = 0.0

    for step in range(t):
        fraction_adopted = total_adopted / m if m > 0 else 0
        new_adopters = (p + q * fraction_adopted) * (m - total_adopted)
        new_adopters = max(0, new_adopters)
        new_adopters = min(new_adopters, m - total_adopted)

        daily.append(round(new_adopters))
        total_adopted += new_adopters
        cumulative.append(round(total_adopted))

    return {
        "daily_adoption": daily,
        "cumulative_adoption": cumulative,
    }


def agent_based_diffusion_step(
    agents: list[Agent],
    graph: nx.Graph,
    day: int,
    price: int,
    jtbd_fit: float = 0.5,
    marketing_boost: float = 0.0,
    marketing_events_today: list[tuple[str, float]] | None = None,
    rng: random.Random | None = None,
) -> tuple[int, int]:
    """Run one step of agent-based diffusion with AIDMA funnel model.

    Each non-adopted agent attempts to advance one funnel stage per day:
    UNAWARE -> AWARE -> INTEREST -> CONSIDERATION -> ADOPTED.

    Transition probabilities are influenced by Rogers type, marketing,
    network effects, JTBD fit, and price sensitivity.

    Args:
        agents: List of agents
        graph: Social network graph
        day: Current simulation day
        price: Product price
        jtbd_fit: 0-1 JTBD fit score
        marketing_boost: Legacy boost value (used if marketing_events_today is None)
        marketing_events_today: List of (type, boost) tuples for active marketing
        rng: Random number generator

    Returns:
        Tuple of (new_adopters, churned) counts
    """
    if rng is None:
        rng = random.Random()

    new_adopters = 0
    total = len(agents)
    adopted_count = sum(1 for a in agents if a.adopted)
    global_fraction = adopted_count / total if total > 0 else 0
    agent_map = {a.id: a for a in agents}

    # Compute aggregated marketing effects across all active events
    combined_marketing = [0.0, 0.0, 0.0, 0.0]
    if marketing_events_today:
        for mtype, mboost in marketing_events_today:
            effects = get_marketing_effects(mtype, mboost)
            for i in range(4):
                combined_marketing[i] += effects[i]
    elif marketing_boost > 0:
        # Legacy fallback: treat as generic "sns_ad" type
        effects = get_marketing_effects("sns_ad", marketing_boost)
        combined_marketing = effects

    has_marketing = any(e > 0 for e in combined_marketing)

    for agent in agents:
        if agent.adopted:
            continue

        # Calculate weighted neighbor influence (referral × WOM valence)
        neighbors = list(graph.neighbors(agent.id))
        if neighbors:
            weighted_influence = 0.0
            has_adopted_neighbor = False
            for n in neighbors:
                neighbor_agent = agent_map[n]
                if neighbor_agent.adopted:
                    has_adopted_neighbor = True
                    weight = (
                        neighbor_agent.forces.referral_likelihood
                        * neighbor_agent.forces.word_of_mouth_valence
                    )
                    weighted_influence += weight
            neighbor_fraction = min(1.0, weighted_influence / len(neighbors))
        else:
            neighbor_fraction = 0.0
            has_adopted_neighbor = False

        # Determine exposure: marketing active, adopted neighbor exists, or p-roll
        has_exposure = has_marketing or has_adopted_neighbor or rng.random() < agent.p
        if has_exposure:
            agent.days_without_exposure = 0
        else:
            agent.days_without_exposure += 1

        # Rogers funnel profile
        profile = ROGERS_FUNNEL_PROFILE[agent.rogers_type]

        # Try to advance one funnel stage
        advanced = try_advance_stage(
            agent, profile, combined_marketing,
            neighbor_fraction, global_fraction,
            jtbd_fit, price, rng,
        )

        # Check decay if no advancement
        if not advanced:
            check_decay(agent, profile, rng)

        # Check if just adopted via funnel
        if agent.funnel_stage == FunnelStage.ADOPTED and not agent.adopted:
            agent.adopted = True
            agent.adopted_day = day
            new_adopters += 1

    # Post-adoption churn pass
    churned = 0
    for agent in agents:
        if not agent.adopted:
            continue

        days_since = day - agent.adopted_day if agent.adopted_day is not None else 0
        churn_prob = compute_churn_probability(agent.forces, days_since)

        if rng.random() < churn_prob:
            agent.adopted = False
            agent.adopted_day = None
            agent.funnel_stage = FunnelStage.CONSIDERATION
            agent.awareness = FunnelStage.CONSIDERATION.value / 4.0
            agent.days_without_exposure = 0
            churned += 1

    return new_adopters, churned
