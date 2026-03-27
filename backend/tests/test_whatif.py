"""Tests for What-If event interpretation and simulation."""

import pytest

from simulator.whatif import (
    WHATIF_PRESETS,
    ParameterDelta,
    WhatIfEvent,
    WhatIfInterpretation,
    interpret_events,
)


def test_parameter_delta_defaults():
    """Default ParameterDelta should be identity (no change)."""
    delta = ParameterDelta()
    assert delta.price_multiplier == 1.0
    assert delta.p_multiplier == 1.0
    assert delta.q_multiplier == 1.0
    assert delta.competition_override is None
    assert delta.extra_marketing_events == []
    assert delta.reasoning == ""


def test_presets_not_empty():
    """Should have at least 5 preset events."""
    assert len(WHATIF_PRESETS) >= 5
    for preset in WHATIF_PRESETS:
        assert preset["label"]
        assert preset["text"]


def test_disabled_events_filtered():
    """Disabled events should not affect interpretation."""
    events = [
        WhatIfEvent(id="1", text="競合が値下げした", enabled=False),
        WhatIfEvent(id="2", text="テレビCMを放映した", enabled=False),
    ]
    # With all events disabled, should return identity delta
    result = interpret_events_sync(events, {"category": "saas", "price": 1000, "competition": "none"})
    assert result.delta.price_multiplier == 1.0
    assert result.delta.p_multiplier == 1.0
    assert result.delta.q_multiplier == 1.0
    assert result.fallback_used is False


def test_interpret_events_no_api_key(monkeypatch):
    """Without API key, should return fallback interpretation."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    events = [
        WhatIfEvent(id="1", text="競合が値下げした", enabled=True),
    ]
    result = interpret_events_sync(events, {"category": "saas", "price": 1000, "competition": "none"})
    assert result.fallback_used is True
    assert result.delta.price_multiplier == 1.0


def test_whatif_event_validation():
    """WhatIfEvent should validate fields properly."""
    event = WhatIfEvent(id="test-1", text="テスト", enabled=True, start_day=10, end_day=30)
    assert event.id == "test-1"
    assert event.start_day == 10
    assert event.end_day == 30


# --- API Integration Tests ---

from fastapi.testclient import TestClient
from simulator.api import app

client = TestClient(app)


def test_whatif_endpoint_no_events():
    """With no events, whatif result should equal baseline."""
    body = {
        "base": {
            "service_name": "テストサービス",
            "price": 1000,
            "market_size": "small",
            "period": "90days",
            "tam": 100000,
        },
        "events": [],
    }
    res = client.post("/api/simulate/whatif", json=body)
    assert res.status_code == 200
    data = res.json()
    assert "baseline" in data
    assert "whatif" in data
    assert "diff" in data
    # With no events, diff should be zero
    assert data["diff"]["total_adopters_delta"] == 0
    assert data["diff"]["total_adopters_pct"] == 0.0


def test_whatif_endpoint_with_disabled_event():
    """Disabled events should not change the result."""
    body = {
        "base": {
            "service_name": "テストサービス",
            "price": 1000,
            "market_size": "small",
            "period": "90days",
            "tam": 100000,
        },
        "events": [
            {"id": "1", "text": "競合が大幅値下げした", "enabled": False},
        ],
    }
    res = client.post("/api/simulate/whatif", json=body)
    assert res.status_code == 200
    data = res.json()
    assert data["diff"]["total_adopters_delta"] == 0


def test_whatif_endpoint_returns_presets():
    """Presets endpoint should return available presets."""
    res = client.get("/api/whatif/presets")
    assert res.status_code == 200
    data = res.json()
    assert "presets" in data
    assert len(data["presets"]) >= 5


def test_whatif_max_events_validation():
    """Should reject more than 10 events."""
    events = [
        {"id": str(i), "text": f"イベント{i}", "enabled": True}
        for i in range(11)
    ]
    body = {
        "base": {
            "service_name": "テスト",
            "price": 1000,
            "market_size": "small",
            "period": "90days",
            "tam": 100000,
        },
        "events": events,
    }
    res = client.post("/api/simulate/whatif", json=body)
    assert res.status_code == 422  # Validation error


# Helper to run async interpret_events synchronously in tests
import asyncio

def interpret_events_sync(events, context):
    return asyncio.run(interpret_events(events, context))
