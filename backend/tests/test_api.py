from fastapi.testclient import TestClient
from simulator.api import app

client = TestClient(app)

VALID_PAYLOAD = {
    "service_name": "テストサービス",
    "price": 1000,
    "market_size": "medium",
    "category": "saas",
    "price_model": "subscription",
    "competition": "none",
    "tam": 10_000_000,
}

# --- Phase 1 backward compatibility ---

def test_simulate_returns_200():
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    assert resp.status_code == 200

def test_simulate_response_has_all_fields():
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    data = resp.json()
    assert "service_name" in data
    assert "config" in data
    assert "daily_adoption" in data
    assert "cumulative_adoption" in data
    assert "summary" in data

def test_simulate_daily_has_90_elements():
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    data = resp.json()
    assert len(data["daily_adoption"]) == 90
    assert len(data["cumulative_adoption"]) == 90

def test_simulate_config_has_parameters():
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    config = resp.json()["config"]
    assert "num_agents" in config
    assert "num_steps" in config
    assert "p" in config
    assert "q" in config

def test_simulate_summary_fields():
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    summary = resp.json()["summary"]
    assert "total_adopters" in summary
    assert "peak_daily" in summary
    assert "adoption_rate" in summary

def test_simulate_missing_field_422():
    resp = client.post("/api/simulate", json={"price": 1000, "market_size": "medium"})
    assert resp.status_code == 422

def test_simulate_invalid_price_422():
    resp = client.post("/api/simulate", json={
        "service_name": "test",
        "price": -1,
        "market_size": "medium",
    })
    assert resp.status_code == 422

def test_simulate_name_too_long_422():
    resp = client.post("/api/simulate", json={
        "service_name": "a" * 101,
        "price": 1000,
        "market_size": "medium",
    })
    assert resp.status_code == 422

# --- Phase 2: Extended simulation ---

def test_simulate_has_rogers_breakdown():
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    data = resp.json()
    assert "rogers_breakdown" in data
    rb = data["rogers_breakdown"]
    assert "innovator" in rb
    assert "early_adopter" in rb
    assert len(rb["innovator"]) == 90

def test_simulate_has_revenue():
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    data = resp.json()
    assert "daily_revenue" in data
    assert "cumulative_revenue" in data
    assert len(data["daily_revenue"]) == 90

def test_simulate_has_odi():
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    data = resp.json()
    assert "odi_score" in data
    assert "odi_label" in data

def test_simulate_has_agent_snapshot():
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    data = resp.json()
    assert "agent_snapshot" in data
    assert len(data["agent_snapshot"]) > 0

def test_simulate_with_category_and_target():
    payload = {**VALID_PAYLOAD, "target": ["student"], "category": "education"}
    resp = client.post("/api/simulate", json=payload)
    assert resp.status_code == 200

def test_simulate_with_competition():
    payload = {**VALID_PAYLOAD, "competition": "strong"}
    resp = client.post("/api/simulate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["config"]["num_agents"] == 1000  # Competition affects q, not agent count

# --- Phase 2 backward compat: minimal payload ---

def test_simulate_minimal_payload():
    """Minimal payload with required fields."""
    resp = client.post("/api/simulate", json={
        "service_name": "Simple",
        "price": 500,
        "tam": 10_000_000,
    })
    assert resp.status_code == 200

# --- Phase 3: Auto simulate ---

def test_auto_simulate_returns_200():
    resp = client.post("/api/simulate/auto", json={
        "description": "通勤時間を有効活用できるオーディオブックサービス"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "inferred_params" in data
    assert "simulation" in data

def test_auto_simulate_fallback():
    """Without ANTHROPIC_API_KEY, should return 503."""
    resp = client.post("/api/simulate/auto", json={
        "description": "テストサービス"
    })
    assert resp.status_code == 503


# --- Period (time range) ---

def test_simulate_default_period_is_90days():
    """period未指定時はデフォルト90日。"""
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    data = resp.json()
    assert data["config"]["num_steps"] == 90
    assert len(data["daily_adoption"]) == 90

def test_simulate_period_1year():
    payload = {**VALID_PAYLOAD, "period": "1year"}
    resp = client.post("/api/simulate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["config"]["num_steps"] == 365
    assert len(data["daily_adoption"]) == 365

def test_simulate_period_3years():
    payload = {**VALID_PAYLOAD, "period": "3years"}
    resp = client.post("/api/simulate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["config"]["num_steps"] == 1095
    # Data is downsampled for large simulations (max 365 chart points)
    assert len(data["daily_adoption"]) <= 365
    assert data["chart_steps"] == len(data["daily_adoption"])

def test_simulate_period_invalid_422():
    payload = {**VALID_PAYLOAD, "period": "10years"}
    resp = client.post("/api/simulate", json=payload)
    assert resp.status_code == 422


# --- Network data ---

def test_simulate_has_network_data():
    """APIレスポンスにネットワークデータが含まれる。"""
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    data = resp.json()
    assert "network" in data
    network = data["network"]
    assert "nodes" in network
    assert "edges" in network
    assert len(network["nodes"]) > 0
    assert len(network["edges"]) > 0


def test_network_node_structure():
    """各ノードにid, x, y, rogers_type, adopted, adopted_dayが含まれる。"""
    resp = client.post("/api/simulate", json=VALID_PAYLOAD)
    node = resp.json()["network"]["nodes"][0]
    assert "id" in node
    assert "x" in node
    assert "y" in node
    assert "rogers_type" in node
    assert "adopted" in node
    assert "adopted_day" in node
