"""AIDMA-inspired awareness funnel model.

Agents progress through stages: UNAWARE -> AWARE -> INTEREST -> CONSIDERATION -> ADOPTED.
Each transition has a probability influenced by Rogers type, marketing, network effects,
JTBD fit, and price sensitivity.
"""

import random

from simulator.agent import Agent, FunnelStage, ROGERS_FUNNEL_PROFILE
from simulator.forces import (
    compute_f1_push,
    compute_f2_pull,
    compute_f3_anxiety,
    compute_switch_score,
)

# Days without exposure before decay can start
DECAY_THRESHOLD_DAYS = 7

# Base decay probability per day (modified by Rogers decay_resistance)
BASE_DECAY_PROBABILITY = 0.1

# Marketing effectiveness by type and stage transition index:
# [UNAWARE->AWARE, AWARE->INTEREST, INTEREST->CONSIDERATION, CONSIDERATION->ADOPTED]
MARKETING_STAGE_EFFECTIVENESS: dict[str, list[float]] = {
    "pr":              [0.08, 0.03, 0.01, 0.00],
    "sns_ad":          [0.06, 0.05, 0.02, 0.01],
    "influencer":      [0.03, 0.07, 0.04, 0.02],
    "word_of_mouth":   [0.01, 0.03, 0.06, 0.03],
}


def get_marketing_effects(
    marketing_type: str | None,
    boost: float,
) -> list[float]:
    """Get per-stage marketing effects scaled by boost value.

    Args:
        marketing_type: Type of marketing event (pr, sns_ad, influencer, word_of_mouth)
        boost: Boost intensity multiplier

    Returns:
        List of 4 floats, one per stage transition
    """
    if marketing_type is None or marketing_type not in MARKETING_STAGE_EFFECTIVENESS:
        return [0.0, 0.0, 0.0, 0.0]

    base_effects = MARKETING_STAGE_EFFECTIVENESS[marketing_type]
    # Scale by boost relative to a baseline of 0.02
    scale = boost / 0.02 if boost > 0 else 0.0
    return [e * scale for e in base_effects]


def try_advance_stage(
    agent: Agent,
    profile: dict,
    marketing_effects: list[float],
    neighbor_fraction: float,
    global_fraction: float,
    jtbd_fit: float,
    price: int,
    rng: random.Random,
) -> bool:
    """Try to advance the agent one funnel stage.

    Args:
        agent: The agent to potentially advance
        profile: Rogers funnel profile dict (from ROGERS_FUNNEL_PROFILE)
        marketing_effects: Per-stage marketing effect values [4 floats]
        neighbor_fraction: Fraction of neighbors who have adopted
        global_fraction: Global adoption fraction
        jtbd_fit: JTBD fit score (0-1), used as fallback if agent has no per-agent fit
        price: Product price in yen
        rng: Random number generator

    Returns:
        True if the agent advanced a stage, False otherwise
    """
    # Always use per-agent jtbd_fit (set during agent creation via compute_agent_jtbd_fit)
    effective_jtbd_fit = agent.jtbd_fit
    stage = agent.funnel_stage

    if stage == FunnelStage.ADOPTED:
        return False

    multiplier = profile["transition_multiplier"]
    skip_to = profile["skip_to_stage"]

    # Calculate transition probability based on current stage.
    # Base rates are calibrated for DAILY timesteps with base_p ~0.005, base_q ~0.10.
    # Target adoption curve (no marketing, 1000 agents):
    #   90 days:  ~5-15% adoption
    #   180 days: ~15-35% adoption
    #   365 days: ~30-60% adoption
    if stage == FunnelStage.UNAWARE:
        # Discovery: driven by innovation (p) and marketing exposure
        # F1 Push amplifies: high frustration → more active seeking
        # JTBD fit: stronger unmet needs → more active information seeking
        prob = (
            agent.p * multiplier
            + marketing_effects[0]
            + 0.01 * neighbor_fraction
            + 0.01 * effective_jtbd_fit
        )
        f1 = compute_f1_push(agent.forces)
        prob *= (0.5 + f1 * 0.5)
    elif stage == FunnelStage.AWARE:
        # Interest formation: slow organic process — takes weeks to months
        # F2 Pull amplifies: high perceived value → faster interest
        prob = (
            0.012 * multiplier
            + marketing_effects[1]
            + 0.02 * neighbor_fraction
            + 0.015 * effective_jtbd_fit
        )
        f2 = compute_f2_pull(agent.forces)
        prob *= (0.5 + f2 * 0.5)
    elif stage == FunnelStage.INTEREST:
        # Consideration: social proof (q) becomes important
        # F3 Anxiety attenuates: high anxiety → harder to move to consideration
        prob = (
            0.008 * multiplier
            + marketing_effects[2]
            + agent.q * 0.15 * max(neighbor_fraction, global_fraction)
            + 0.02 * effective_jtbd_fit
        )
        f3 = compute_f3_anxiety(agent.forces)
        prob *= (1.0 - f3 * 0.6)
    elif stage == FunnelStage.CONSIDERATION:
        # Adoption decision: Forces of Progress sigmoid gate + price affordability
        # switch_score integrates all four forces (F1+F2 vs F3+F4)
        base = (
            0.008 * multiplier
            + marketing_effects[3]
            + agent.q * 0.25 * max(neighbor_fraction, global_fraction)
        )
        switch = compute_switch_score(agent.forces)
        price_ratio = min(1.0, price / 30000) if price > 0 else 0.0
        price_gate = 1.0 - agent.price_sensitivity * price_ratio * 0.8
        jtbd_gate = 0.3 + 0.7 * effective_jtbd_fit
        prob = base * switch * price_gate * jtbd_gate
    else:
        return False

    prob = max(0.0, min(1.0, prob))

    if rng.random() < prob:
        # Advance stage
        if stage == FunnelStage.UNAWARE and skip_to.value > FunnelStage.AWARE.value:
            # Innovators/Early Adopters can skip stages on first exposure
            agent.funnel_stage = skip_to
        else:
            agent.funnel_stage = FunnelStage(stage.value + 1)

        # Update derived awareness
        agent.awareness = agent.funnel_stage.value / 4.0
        return True

    return False


def check_decay(
    agent: Agent,
    profile: dict,
    rng: random.Random,
) -> None:
    """Check if agent should regress one funnel stage due to lack of exposure.

    Args:
        agent: The agent to potentially decay
        profile: Rogers funnel profile dict
        rng: Random number generator
    """
    # UNAWARE and ADOPTED never decay
    if agent.funnel_stage in (FunnelStage.UNAWARE, FunnelStage.ADOPTED):
        return

    if agent.days_without_exposure < DECAY_THRESHOLD_DAYS:
        return

    decay_resistance = profile["decay_resistance"]
    decay_prob = BASE_DECAY_PROBABILITY * (1.0 - decay_resistance)

    if rng.random() < decay_prob:
        agent.funnel_stage = FunnelStage(agent.funnel_stage.value - 1)
        agent.awareness = agent.funnel_stage.value / 4.0
        agent.days_without_exposure = 0
