"""Simulation engine: orchestrates all modules."""

import random

import networkx as nx

from simulator.agent import FunnelStage, RogersCategory
from simulator.diffusion import agent_based_diffusion_step
from simulator.forces import (
    compute_f1_push,
    compute_f2_pull,
    compute_f3_anxiety,
    compute_f4_habit,
    compute_switch_score,
)
from simulator.market import apply_competition_effect
from simulator.network import build_network
from simulator.population import generate_population

FUNNEL_STAGE_NAMES = ["unaware", "aware", "interest", "consideration", "adopted"]

# Maximum number of data points to return for time-series data.
# Beyond this threshold, data is downsampled to keep responses lightweight.
MAX_CHART_POINTS = 365


def _downsample(data: list, max_points: int = MAX_CHART_POINTS) -> tuple[list, int]:
    """Downsample a time-series list by averaging consecutive buckets.

    Returns (downsampled_data, bucket_size).
    If len(data) <= max_points, returns original data unchanged.
    """
    n = len(data)
    if n <= max_points:
        return data, 1
    bucket_size = (n + max_points - 1) // max_points  # ceil division
    result = []
    for i in range(0, n, bucket_size):
        bucket = data[i : i + bucket_size]
        result.append(round(sum(bucket) / len(bucket), 2))
    return result, bucket_size


def _downsample_sum(data: list, max_points: int = MAX_CHART_POINTS) -> list:
    """Downsample by summing buckets (for daily counts like adoption)."""
    n = len(data)
    if n <= max_points:
        return data
    bucket_size = (n + max_points - 1) // max_points
    result = []
    for i in range(0, n, bucket_size):
        bucket = data[i : i + bucket_size]
        result.append(sum(bucket))
    return result


def _downsample_last(data: list, max_points: int = MAX_CHART_POINTS) -> list:
    """Downsample by taking the last value of each bucket (for cumulative series)."""
    n = len(data)
    if n <= max_points:
        return data
    bucket_size = (n + max_points - 1) // max_points
    result = []
    for i in range(0, n, bucket_size):
        end = min(i + bucket_size, n)
        result.append(data[end - 1])
    return result


def _downsample_funnel(data: list[dict], max_points: int = MAX_CHART_POINTS) -> list[dict]:
    """Downsample funnel snapshots by taking the last snapshot per bucket."""
    n = len(data)
    if n <= max_points:
        return data
    bucket_size = (n + max_points - 1) // max_points
    result = []
    for i in range(0, n, bucket_size):
        end = min(i + bucket_size, n)
        result.append(data[end - 1])
    return result


def run_simulation(
    num_agents: int = 1000,
    num_steps: int = 1095,
    price: int = 1000,
    base_p: float = 0.005,
    base_q: float = 0.10,
    jtbd_fit: float = 0.5,
    competition: str = "none",
    marketing_events: list[dict] | None = None,
    seed: int | None = None,
    category: str = "saas",
    custom_jobs: list | None = None,
    target_groups: list[str] | None = None,
    critical_lifestyle_tags: list[dict] | None = None,
) -> dict:
    """Run a full agent-based market simulation.

    Args:
        num_agents: Number of agents
        num_steps: Number of simulation days
        price: Product price (yen/month)
        base_p: Base innovation coefficient
        base_q: Base imitation coefficient
        jtbd_fit: JTBD fit score (0-1), fallback for agents without per-agent fit
        competition: "none", "weak", or "strong"
        marketing_events: List of {"type", "start_day", "end_day"} dicts
        seed: Random seed
        category: Service category for per-agent JTBD fit

    Returns:
        dict with simulation results
    """
    rng = random.Random(seed)

    # Apply competition effects
    effective_agents, effective_q = apply_competition_effect(num_agents, base_q, competition)

    # Generate population and network with per-agent JTBD fit
    agents = generate_population(
        effective_agents, base_p, effective_q,
        seed=rng.randint(0, 100000),
        category=category,
        custom_jobs=custom_jobs,
        target_groups=target_groups,
        critical_lifestyle_tags=critical_lifestyle_tags,
    )
    graph = build_network(effective_agents, seed=rng.randint(0, 100000))

    # Marketing event lookup: day -> list of (type, boost) tuples
    marketing_events = marketing_events or []
    boost_values = {"pr": 0.03, "sns_ad": 0.04, "influencer": 0.05, "word_of_mouth": 0.02}
    marketing_day_map: dict[int, list[tuple[str, float]]] = {}
    for event in marketing_events:
        mtype = event.get("type", "pr")
        boost = boost_values.get(mtype, 0.01)
        start = event.get("start_day", 1)
        end = event.get("end_day", start)
        for day in range(start, end + 1):
            if day not in marketing_day_map:
                marketing_day_map[day] = []
            marketing_day_map[day].append((mtype, boost))

    # Rogers category names
    rogers_names = [c.value for c in RogersCategory]

    # Run simulation
    daily_adoption: list[int] = []
    cumulative_adoption: list[int] = []
    daily_churned: list[int] = []
    rogers_breakdown: dict[str, list[int]] = {name: [] for name in rogers_names}
    daily_revenue: list[int] = []
    cumulative_revenue: list[int] = []

    # Per-agent state history: agent_id -> list of {day, awareness, adopted, funnel_stage}
    agent_state_history: dict[int, list[dict]] = {a.id: [] for a in agents}

    # Daily snapshots (aggregate only — per-agent snapshots removed for performance)
    daily_funnel_snapshot: list[dict[str, int]] = []

    total_ever_adopted = 0
    total_revenue = 0

    for day in range(1, num_steps + 1):
        events_today = marketing_day_map.get(day)

        new_adopters, churned = agent_based_diffusion_step(
            agents=agents,
            graph=graph,
            day=day,
            price=price,
            jtbd_fit=jtbd_fit,
            marketing_events_today=events_today,
            rng=rng,
        )

        total_ever_adopted += new_adopters
        active_adopters = sum(1 for a in agents if a.adopted)
        daily_adoption.append(new_adopters)
        daily_churned.append(churned)
        cumulative_adoption.append(active_adopters)

        # Revenue: active subscribers * price (recurring subscription model)
        day_revenue = active_adopters * price
        total_revenue += day_revenue
        daily_revenue.append(day_revenue)
        cumulative_revenue.append(total_revenue)

        # Record per-agent state (sample ~18-20 snapshots regardless of period length)
        sample_interval = max(1, num_steps // 18)
        if day == 1 or day == num_steps or day % sample_interval == 0:
            for a in agents:
                agent_state_history[a.id].append({
                    "day": day,
                    "awareness": round(a.awareness, 3),
                    "adopted": a.adopted,
                    "funnel_stage": a.funnel_stage.value,
                })

        # Daily funnel snapshot (aggregate counts per stage)
        stage_counts = {name: 0 for name in FUNNEL_STAGE_NAMES}
        for a in agents:
            stage_counts[FUNNEL_STAGE_NAMES[a.funnel_stage.value]] += 1
        daily_funnel_snapshot.append(stage_counts)

        # Rogers breakdown for this day
        for name in rogers_names:
            count = sum(
                1 for a in agents
                if a.rogers_type.value == name and a.adopted and a.adopted_day == day
            )
            rogers_breakdown[name].append(count)

    # Summary
    active_adopters_final = sum(1 for a in agents if a.adopted)
    peak_daily = max(daily_adoption) if daily_adoption else 0
    total_churned = sum(daily_churned)
    adoption_rate = active_adopters_final / effective_agents if effective_agents > 0 else 0.0

    summary = {
        "total_adopters": active_adopters_final,
        "total_ever_adopted": total_ever_adopted,
        "total_churned": total_churned,
        "churn_rate": round(min(1.0, total_churned / max(1, total_ever_adopted)), 4),
        "peak_daily": peak_daily,
        "adoption_rate": round(adoption_rate, 4),
    }

    # Agent snapshot
    agent_snapshot = [
        {
            "id": a.id,
            "age": a.age,
            "gender": a.gender.value,
            "region": a.region.value,
            "income": a.income,
            "income_level": a.income_level.value,
            "rogers_type": a.rogers_type.value,
            "price_sensitivity": round(a.price_sensitivity, 3),
            "jtbd_fit": round(a.jtbd_fit, 3),
            "awareness": round(a.awareness, 3),
            "adopted": a.adopted,
            "adopted_day": a.adopted_day,
            "funnel_stage": a.funnel_stage.value,
            "state_history": agent_state_history[a.id],
            "lifestyle_tags": a.lifestyle_tags,
            "forces": {
                "f1_push": round(compute_f1_push(a.forces), 3),
                "f2_pull": round(compute_f2_pull(a.forces), 3),
                "f3_anxiety": round(compute_f3_anxiety(a.forces), 3),
                "f4_habit": round(compute_f4_habit(a.forces), 3),
                "switch_score": round(compute_switch_score(a.forces), 3),
                "referral_likelihood": round(a.forces.referral_likelihood, 3),
                "word_of_mouth_valence": round(a.forces.word_of_mouth_valence, 3),
            },
        }
        for a in agents
    ]

    # Downsample time-series data for large simulations
    ds_daily_adoption = _downsample_sum(daily_adoption)
    ds_cumulative_adoption = _downsample_last(cumulative_adoption)
    ds_daily_churned = _downsample_sum(daily_churned)
    ds_daily_revenue = _downsample_sum(daily_revenue)
    ds_cumulative_revenue = _downsample_last(cumulative_revenue)
    ds_rogers = {name: _downsample_sum(vals) for name, vals in rogers_breakdown.items()}
    ds_funnel = _downsample_funnel(daily_funnel_snapshot)

    # Effective chart points after downsampling
    chart_steps = len(ds_daily_adoption)

    # Generate day labels mapping each downsampled point to its actual day
    if chart_steps == num_steps:
        # No downsampling occurred
        day_labels = list(range(1, num_steps + 1))
    else:
        bucket_size = (num_steps + MAX_CHART_POINTS - 1) // MAX_CHART_POINTS
        day_labels = [min(i + bucket_size, num_steps) for i in range(0, num_steps, bucket_size)]

    # Serialize network topology for visualization (force-directed layout)
    pos = nx.spring_layout(graph, seed=seed or 0, iterations=50, k=1.5 / (effective_agents ** 0.5))
    network_nodes = [
        {
            "id": a.id,
            "x": round(float(pos[a.id][0]), 4),
            "y": round(float(pos[a.id][1]), 4),
            "rogers_type": a.rogers_type.value,
            "adopted": a.adopted,
            "adopted_day": a.adopted_day,
        }
        for a in agents
    ]
    network_edges = [[u, v] for u, v in graph.edges()]

    return {
        "num_agents": effective_agents,
        "num_steps": num_steps,
        "chart_steps": chart_steps,
        "day_labels": day_labels,
        "base_p": base_p,
        "base_q": base_q,
        "daily_adoption": ds_daily_adoption,
        "cumulative_adoption": ds_cumulative_adoption,
        "daily_churned": ds_daily_churned,
        "rogers_breakdown": ds_rogers,
        "daily_revenue": ds_daily_revenue,
        "cumulative_revenue": ds_cumulative_revenue,
        "summary": summary,
        "agent_snapshot": agent_snapshot,
        "daily_funnel_snapshot": ds_funnel,
        "network": {
            "nodes": network_nodes,
            "edges": network_edges,
        },
    }
