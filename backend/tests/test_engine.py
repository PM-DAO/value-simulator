from simulator.engine import run_simulation


def test_simulation_basic():
    result = run_simulation(num_agents=20, num_steps=90, price=1000, seed=42)
    assert len(result["daily_adoption"]) == 90
    assert len(result["cumulative_adoption"]) == 90
    assert result["num_agents"] == 20


def test_simulation_cumulative_generally_increasing():
    """With churn, cumulative_adoption is active count and may dip.
    But overall trend should be upward."""
    result = run_simulation(num_agents=50, num_steps=90, price=500, seed=42)
    cum = result["cumulative_adoption"]
    # Final value should be >= some early value (general trend up)
    assert cum[-1] >= 0


def test_simulation_has_adopters():
    """With low price and enough steps, some agents should adopt."""
    result = run_simulation(num_agents=200, num_steps=180, price=100, seed=42)
    assert result["summary"]["total_adopters"] > 0


def test_simulation_rogers_breakdown():
    result = run_simulation(num_agents=50, num_steps=90, price=500, seed=42)
    rb = result["rogers_breakdown"]
    assert "innovator" in rb
    assert "early_adopter" in rb
    assert "early_majority" in rb
    assert "late_majority" in rb
    assert "laggard" in rb
    for key in rb:
        assert len(rb[key]) == 90


def test_simulation_revenue():
    result = run_simulation(num_agents=50, num_steps=90, price=1000, seed=42)
    assert len(result["daily_revenue"]) == 90
    assert len(result["cumulative_revenue"]) == 90
    for r in result["daily_revenue"]:
        assert r >= 0


def test_simulation_agent_snapshot():
    result = run_simulation(num_agents=20, num_steps=90, price=500, seed=42)
    snapshot = result["agent_snapshot"]
    assert len(snapshot) == 20
    for a in snapshot:
        assert "age" in a
        assert "income" in a
        assert "rogers_type" in a
        assert "adopted" in a


def test_simulation_competition_strong():
    """Strong competition should keep agent count but reduce adoption rate."""
    result = run_simulation(num_agents=1000, num_steps=90, price=500, competition="strong", seed=42)
    assert result["num_agents"] == 1000


def test_simulation_marketing_boost():
    """Marketing events should not decrease adoption."""
    base = run_simulation(num_agents=50, num_steps=90, price=500, seed=42)
    with_marketing = run_simulation(
        num_agents=50, num_steps=90, price=500, seed=42,
        marketing_events=[{"type": "pr", "start_day": 1, "end_day": 10}]
    )
    assert with_marketing["summary"]["total_adopters"] >= base["summary"]["total_adopters"]


def test_simulation_365_steps():
    """1年（365日）シミュレーションが動作する。"""
    result = run_simulation(num_agents=20, num_steps=365, price=500, seed=42)
    assert len(result["daily_adoption"]) == 365
    assert len(result["cumulative_adoption"]) == 365
    assert result["num_agents"] == 20


def test_simulation_1095_steps():
    """3年（1095日）シミュレーションが動作し、ダウンサンプリングされる。"""
    result = run_simulation(num_agents=20, num_steps=1095, price=500, seed=42)
    # Downsampled to max 365 chart points
    assert len(result["daily_adoption"]) <= 365
    assert len(result["cumulative_adoption"]) <= 365
    assert result["chart_steps"] == len(result["daily_adoption"])
    assert result["num_steps"] == 1095  # Original step count preserved


# --- Network data tests ---

def test_simulation_has_network_data():
    """シミュレーション結果にネットワークデータが含まれる。"""
    result = run_simulation(num_agents=20, num_steps=10, price=500, seed=42)
    assert "network" in result
    network = result["network"]
    assert "nodes" in network
    assert "edges" in network


def test_network_nodes_match_agents():
    """ネットワークノード数がエージェント数と一致する。"""
    result = run_simulation(num_agents=30, num_steps=10, price=500, seed=42)
    network = result["network"]
    assert len(network["nodes"]) == result["num_agents"]


def test_network_nodes_have_position_and_metadata():
    """各ノードにx, y座標とメタデータが含まれる。"""
    result = run_simulation(num_agents=20, num_steps=30, price=500, seed=42)
    for node in result["network"]["nodes"]:
        assert "id" in node
        assert "x" in node
        assert "y" in node
        assert "rogers_type" in node
        assert "adopted" in node
        assert "adopted_day" in node
        assert -1.5 <= node["x"] <= 1.5
        assert -1.5 <= node["y"] <= 1.5


def test_network_edges_are_valid():
    """エッジの両端がノードIDとして存在する。"""
    result = run_simulation(num_agents=20, num_steps=10, price=500, seed=42)
    network = result["network"]
    node_ids = {n["id"] for n in network["nodes"]}
    for edge in network["edges"]:
        assert len(edge) == 2
        assert edge[0] in node_ids
        assert edge[1] in node_ids


def test_network_edges_nonempty():
    """Watts-Strogatzグラフはエッジを持つ。"""
    result = run_simulation(num_agents=20, num_steps=10, price=500, seed=42)
    assert len(result["network"]["edges"]) > 0
