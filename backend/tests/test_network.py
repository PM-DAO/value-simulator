import networkx as nx
from simulator.network import build_network


def test_network_node_count():
    G = build_network(100, seed=42)
    assert G.number_of_nodes() == 100


def test_network_connected():
    G = build_network(100, k=6, p=0.1, seed=42)
    assert nx.is_connected(G)


def test_network_small_world_properties():
    """Small-world: high clustering, short path length."""
    G = build_network(100, k=6, p=0.1, seed=42)
    clustering = nx.average_clustering(G)
    path_length = nx.average_shortest_path_length(G)
    assert clustering > 0.1
    assert path_length < 10


def test_small_network():
    G = build_network(10, k=4, seed=42)
    assert G.number_of_nodes() == 10


def test_network_has_edges():
    G = build_network(50, seed=42)
    assert G.number_of_edges() > 0
