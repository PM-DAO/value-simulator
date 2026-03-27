"""Social network generation using Watts-Strogatz small-world model."""

import networkx as nx


def build_network(
    num_agents: int,
    k: int = 6,
    p: float = 0.1,
    seed: int | None = None,
) -> nx.Graph:
    """Build a Watts-Strogatz small-world network.

    Args:
        num_agents: Number of nodes
        k: Each node connected to k nearest neighbors in ring topology
        p: Probability of rewiring each edge
        seed: Random seed

    Returns:
        NetworkX Graph
    """
    if num_agents < k + 1:
        k = max(2, num_agents - 1)
    # k must be even for watts_strogatz_graph
    if k % 2 != 0:
        k = max(2, k - 1)

    G = nx.watts_strogatz_graph(num_agents, k, p, seed=seed)
    return G
