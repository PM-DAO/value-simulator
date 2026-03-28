from typing import Literal
import os
import random

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field

from simulator.diffusion import bass_diffusion
from simulator.engine import run_simulation
from simulator.jtbd import evaluate_jtbd, infer_jtbd_with_llm, Job
from simulator.market import apply_price_model_factor
from simulator.whatif import (
    WHATIF_PRESETS,
    ParameterDelta,
    WhatIfEvent,
    WhatIfInterpretation,
    interpret_events,
)

app = FastAPI(title="Value Simulator API")

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://frontend:3000", "https://*.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Daily Bass coefficients calibrated for agent-based simulation.
# Academic literature (Sultan, Farley & Lehmann 1990) reports average
# p=0.03, q=0.38 per *period* (typically quarters/years).
# For daily timesteps over 90-365 day horizons, these are scaled down.
# p=0.005 => ~0.45 cumulative innovation probability over 90 days
# q=0.10  => moderate word-of-mouth effect
DEFAULT_P = 0.005
DEFAULT_Q = 0.10

PERIOD_STEPS = {
    "90days": 90,
    "1year": 365,
    "3years": 1095,
}
Period = Literal["90days", "1year", "3years"]

# --- Request Models ---

class SimulateRequest(BaseModel):
    service_name: str = Field(min_length=1, max_length=100)
    price: int = Field(ge=0, le=1_000_000, description="税込月額（円）")
    market_size: Literal["small", "medium", "large"] = "medium"
    description: str | None = Field(default=None, max_length=5000)
    target: list[Literal[
        "teens", "twenties", "thirties", "forties", "fifties", "sixties_plus",
        "student", "new_graduate", "working_professional", "freelancer", "homemaker", "retired",
        "single", "couple", "parent_young_child", "parent_school_child",
        "startup", "smb", "enterprise",
    ]] | None = None
    category: Literal[
        "saas", "ec", "media", "food", "mobility", "healthcare", "education", "entertainment", "finance",
        "pet", "real_estate", "automotive", "beauty", "sports_fitness", "travel", "gaming",
        "childcare", "elderly_care", "insurance", "fashion", "home_living", "dating_marriage",
        "career", "sustainability", "security",
    ] = "saas"
    price_model: Literal["free", "freemium", "subscription", "usage", "one_time"] = "subscription"
    competition: Literal["none", "weak", "strong"] = "none"
    period: Period = "3years"
    tam: int = Field(ge=10_000, description="推定TAM（JTBD推論から）")



class AutoSimulateRequest(BaseModel):
    description: str = Field(min_length=1, max_length=5000)
    period: Period = "3years"
    market_size: Literal["small", "medium", "large"] = "medium"

# --- Response Models ---

class ConfigOut(BaseModel):
    num_agents: int
    num_steps: int
    tam: int
    scale_factor: float
    p: float
    q: float

class ForcesOut(BaseModel):
    f1_push: float = 0.0
    f2_pull: float = 0.0
    f3_anxiety: float = 0.0
    f4_habit: float = 0.0
    switch_score: float = 0.0
    referral_likelihood: float = 0.0
    word_of_mouth_valence: float = 0.0

class SummaryOut(BaseModel):
    total_adopters: int | float
    total_ever_adopted: int | float = 0
    total_churned: int | float = 0
    churn_rate: float = 0.0
    peak_daily: int | float
    adoption_rate: float

class AgentStateEntry(BaseModel):
    day: int
    awareness: float
    adopted: bool
    funnel_stage: int = 0

class AgentSnapshotOut(BaseModel):
    id: int = 0
    age: int
    gender: str = ""
    region: str = ""
    income: int
    income_level: str = ""
    rogers_type: str
    price_sensitivity: float = 0.0
    jtbd_fit: float = 0.5
    awareness: float = 0.0
    adopted: bool
    adopted_day: int | None
    funnel_stage: int = 0
    lifestyle_tags: list[str] = []
    state_history: list[AgentStateEntry] = []
    forces: ForcesOut | None = None

class FunnelSnapshotEntry(BaseModel):
    unaware: int
    aware: int
    interest: int
    consideration: int
    adopted: int

class RogersBreakdown(BaseModel):
    innovator: list[int]
    early_adopter: list[int]
    early_majority: list[int]
    late_majority: list[int]
    laggard: list[int]

class NetworkNodeOut(BaseModel):
    id: int
    x: float
    y: float
    rogers_type: str
    adopted: bool
    adopted_day: int | None

class NetworkOut(BaseModel):
    nodes: list[NetworkNodeOut]
    edges: list[list[int]]

class SimulateResponse(BaseModel):
    service_name: str
    config: ConfigOut
    daily_adoption: list[int | float]
    cumulative_adoption: list[int | float]
    daily_churned: list[int | float] | None = None
    summary: SummaryOut
    rogers_breakdown: RogersBreakdown | None = None
    daily_revenue: list[int | float] | None = None
    cumulative_revenue: list[int | float] | None = None
    odi_score: float | None = None
    odi_label: str | None = None
    agent_snapshot: list[AgentSnapshotOut] | None = None
    daily_funnel_snapshot: list[FunnelSnapshotEntry] | None = None
    chart_steps: int | None = None
    day_labels: list[int] | None = None
    network: NetworkOut | None = None

class InferredParams(BaseModel):
    jobs: list[dict] | None = None
    target: list[str] | str | None = None
    category: str | None = None
    suggested_price: int | None = None
    competition: str | None = None
    tam_estimate: int | None = None
    critical_lifestyle_tags: list[dict] | None = None
    reasoning: str | None = None

class AutoSimulateResponse(BaseModel):
    inferred_params: InferredParams
    simulation: SimulateResponse

class WhatIfRequest(BaseModel):
    base: SimulateRequest
    events: list[WhatIfEvent] = Field(max_length=10)

class WhatIfEventResult(BaseModel):
    id: str
    reasoning: str = ""

class WhatIfDiff(BaseModel):
    total_adopters_delta: int = 0
    total_adopters_pct: float = 0.0
    total_revenue_delta: int = 0
    total_revenue_pct: float = 0.0
    adoption_rate_delta: float = 0.0

class WhatIfResponse(BaseModel):
    baseline: SimulateResponse
    whatif: SimulateResponse
    diff: WhatIfDiff
    interpretation: WhatIfInterpretation
    event_results: list[WhatIfEventResult] = []

# --- Helper ---

AGENT_SCALE = {"small": 500, "medium": 1000, "large": 5000}


def _scale_list(values: list[int | float], factor: float) -> list[int]:
    """Scale a list of agent-space values to real-world values."""
    return [round(v * factor) for v in values]


def _run_and_format(
    req: SimulateRequest,
    marketing_events: list[dict] | None = None,
    p_override: float | None = None,
    q_override: float | None = None,
    custom_jobs: list[dict] | None = None,
    target_groups: list[str] | None = None,
    seed: int | None = None,
    critical_lifestyle_tags: list[dict] | None = None,
) -> SimulateResponse:
    """Run simulation and format response."""
    num_steps = PERIOD_STEPS[req.period]

    # JTBD evaluation
    jtbd_result = evaluate_jtbd(category=req.category, target=req.target)

    # Apply price model
    effective_price = apply_price_model_factor(req.price, req.price_model)

    # Agent count (simulation granularity) — independent of market size
    num_agents = AGENT_SCALE.get(req.market_size, 1000)

    # TAM — JTBD推論から取得（必須）
    tam = req.tam

    scale_factor = tam / num_agents

    # Run agent-based simulation
    result = run_simulation(
        num_agents=num_agents,
        num_steps=num_steps,
        price=effective_price,
        base_p=p_override if p_override is not None else DEFAULT_P,
        base_q=q_override if q_override is not None else DEFAULT_Q,
        jtbd_fit=jtbd_result.jtbd_fit,
        competition=req.competition,
        marketing_events=marketing_events,
        seed=seed if seed is not None else random.randint(1, 100000),
        category=req.category,
        custom_jobs=custom_jobs,
        target_groups=target_groups,
        critical_lifestyle_tags=critical_lifestyle_tags,
    )

    # Scale agent-space results to real-world numbers
    summary_raw = result["summary"]
    scaled_summary = SummaryOut(
        total_adopters=round(summary_raw["total_adopters"] * scale_factor),
        total_ever_adopted=round(summary_raw["total_ever_adopted"] * scale_factor),
        total_churned=round(summary_raw["total_churned"] * scale_factor),
        churn_rate=summary_raw["churn_rate"],
        peak_daily=round(summary_raw["peak_daily"] * scale_factor),
        adoption_rate=summary_raw["adoption_rate"],
    )

    rogers_raw = result["rogers_breakdown"]
    scaled_rogers = RogersBreakdown(
        innovator=_scale_list(rogers_raw["innovator"], scale_factor),
        early_adopter=_scale_list(rogers_raw["early_adopter"], scale_factor),
        early_majority=_scale_list(rogers_raw["early_majority"], scale_factor),
        late_majority=_scale_list(rogers_raw["late_majority"], scale_factor),
        laggard=_scale_list(rogers_raw["laggard"], scale_factor),
    )

    scaled_funnel = [
        FunnelSnapshotEntry(
            unaware=round(s["unaware"] * scale_factor),
            aware=round(s["aware"] * scale_factor),
            interest=round(s["interest"] * scale_factor),
            consideration=round(s["consideration"] * scale_factor),
            adopted=round(s["adopted"] * scale_factor),
        )
        for s in result.get("daily_funnel_snapshot", [])
    ]

    return SimulateResponse(
        service_name=req.service_name,
        config=ConfigOut(
            num_agents=result["num_agents"],
            num_steps=num_steps,
            tam=tam,
            scale_factor=round(scale_factor, 2),
            p=DEFAULT_P,
            q=DEFAULT_Q,
        ),
        daily_adoption=_scale_list(result["daily_adoption"], scale_factor),
        cumulative_adoption=_scale_list(result["cumulative_adoption"], scale_factor),
        summary=scaled_summary,
        rogers_breakdown=scaled_rogers,
        daily_revenue=_scale_list(result["daily_revenue"], scale_factor),
        cumulative_revenue=_scale_list(result["cumulative_revenue"], scale_factor),
        odi_score=jtbd_result.odi_score,
        odi_label=jtbd_result.odi_label,
        agent_snapshot=[AgentSnapshotOut(**a) for a in result["agent_snapshot"]],
        daily_funnel_snapshot=scaled_funnel,
        chart_steps=result.get("chart_steps"),
        day_labels=result.get("day_labels"),
        network=NetworkOut(
            nodes=[NetworkNodeOut(**n) for n in result["network"]["nodes"]],
            edges=result["network"]["edges"],
        ),
    )

# --- Endpoints ---

@app.post("/api/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest) -> SimulateResponse:
    return _run_and_format(req)

@app.post("/api/simulate/auto", response_model=AutoSimulateResponse)
async def simulate_auto(req: AutoSimulateRequest) -> AutoSimulateResponse:
    """AI-powered auto simulation: just provide a description."""
    inferred = await infer_jtbd_with_llm(req.description)

    if inferred:
        # Normalize target to list
        raw_target = inferred.get("target")
        if isinstance(raw_target, str):
            raw_target = [raw_target]

        # Extract LLM jobs, target, and lifestyle tags for per-agent fit calculation
        inferred_jobs = inferred.get("jobs")
        inferred_target_groups = raw_target
        inferred_lifestyle_tags = inferred.get("critical_lifestyle_tags")

        tam_estimate = inferred.get("tam_estimate")
        if tam_estimate is None:
            raise HTTPException(
                status_code=400,
                detail="TAMの推定に失敗しました。サービス説明をより具体的にしてください。",
            )

        # Use inferred parameters
        sim_req = SimulateRequest(
            service_name=req.description[:50],
            price=inferred.get("suggested_price", 1000),
            category=inferred.get("category", "saas"),
            target=raw_target,
            competition=inferred.get("competition", "none"),
            description=req.description,
            period=req.period,
            market_size=req.market_size,
            tam=tam_estimate,
        )
        inferred_params = InferredParams(
            jobs=inferred.get("jobs"),
            target=inferred.get("target"),
            category=inferred.get("category"),
            suggested_price=inferred.get("suggested_price"),
            competition=inferred.get("competition"),
            tam_estimate=inferred.get("tam_estimate"),
            critical_lifestyle_tags=inferred_lifestyle_tags,
            reasoning=inferred.get("reasoning"),
        )
    else:
        raise HTTPException(
            status_code=503,
            detail="JTBD推論（Claude API）が利用できません。しばらくしてから再試行してください。",
        )

    simulation = _run_and_format(
        sim_req,
        custom_jobs=inferred_jobs,
        target_groups=inferred_target_groups,
        critical_lifestyle_tags=inferred_lifestyle_tags,
    )

    return AutoSimulateResponse(
        inferred_params=inferred_params,
        simulation=simulation,
    )

# --- What-If ---

def _apply_delta(
    req: SimulateRequest,
    delta: ParameterDelta,
) -> tuple[SimulateRequest, float | None, float | None, list[dict] | None]:
    """Apply a ParameterDelta to a SimulateRequest.

    Returns (modified_request, p_override, q_override, marketing_events).
    """
    updates: dict = {}
    if delta.price_multiplier != 1.0:
        updates["price"] = max(0, min(100_000, round(req.price * delta.price_multiplier)))
    if delta.competition_override and delta.competition_override != "none":
        updates["competition"] = delta.competition_override

    modified = req.model_copy(update=updates) if updates else req

    p_override = DEFAULT_P * delta.p_multiplier if delta.p_multiplier != 1.0 else None
    q_override = DEFAULT_Q * delta.q_multiplier if delta.q_multiplier != 1.0 else None

    marketing = (
        [{"type": m["type"], "start_day": m.get("start_day", 1), "end_day": m.get("end_day", m.get("start_day", 1))}
         for m in delta.extra_marketing_events]
        if delta.extra_marketing_events else None
    )

    return modified, p_override, q_override, marketing


def _compute_diff(baseline: SimulateResponse, whatif: SimulateResponse) -> WhatIfDiff:
    """Compute the diff between baseline and what-if results."""
    base_adopters = baseline.summary.total_adopters
    wi_adopters = whatif.summary.total_adopters
    adopters_delta = wi_adopters - base_adopters

    base_rev = baseline.cumulative_revenue[-1] if baseline.cumulative_revenue else 0
    wi_rev = whatif.cumulative_revenue[-1] if whatif.cumulative_revenue else 0
    rev_delta = wi_rev - base_rev

    return WhatIfDiff(
        total_adopters_delta=adopters_delta,
        total_adopters_pct=round(adopters_delta / max(1, base_adopters) * 100, 1),
        total_revenue_delta=rev_delta,
        total_revenue_pct=round(rev_delta / max(1, base_rev) * 100, 1),
        adoption_rate_delta=round(whatif.summary.adoption_rate - baseline.summary.adoption_rate, 4),
    )


@app.get("/api/whatif/presets")
def get_whatif_presets() -> dict:
    """Return available What-If event presets."""
    return {"presets": WHATIF_PRESETS}


@app.post("/api/simulate/whatif", response_model=WhatIfResponse)
async def simulate_whatif(req: WhatIfRequest) -> WhatIfResponse:
    """Run What-If simulation with event cards."""
    # Use the same seed for both runs to ensure deterministic comparison
    shared_seed = random.randint(1, 100000)

    # Run baseline
    baseline = _run_and_format(req.base, seed=shared_seed)

    # Filter enabled events
    enabled = [e for e in req.events if e.enabled]
    if not enabled:
        return WhatIfResponse(
            baseline=baseline,
            whatif=baseline,
            diff=WhatIfDiff(),
            interpretation=WhatIfInterpretation(),
            event_results=[],
        )

    # Interpret events via LLM
    interpretation = await interpret_events(
        enabled,
        {
            "category": req.base.category,
            "price": req.base.price,
            "competition": req.base.competition,
        },
    )

    # Apply delta and run what-if simulation
    modified, p_override, q_override, marketing = _apply_delta(req.base, interpretation.delta)
    whatif = _run_and_format(modified, marketing_events=marketing, p_override=p_override, q_override=q_override, seed=shared_seed)

    # Compute diff
    diff = _compute_diff(baseline, whatif)

    # Build per-event results
    event_results = [
        WhatIfEventResult(
            id=e.id,
            reasoning=interpretation.per_card_reasoning[i] if i < len(interpretation.per_card_reasoning) else "",
        )
        for i, e in enumerate(enabled)
    ]

    return WhatIfResponse(
        baseline=baseline,
        whatif=whatif,
        diff=diff,
        interpretation=interpretation,
        event_results=event_results,
    )


# --- Agent Explain Endpoint ---

class AgentExplainRequest(BaseModel):
    agent_id: int = Field(ge=0)
    rogers_type: Literal["innovator", "early_adopter", "early_majority", "late_majority", "laggard"]
    age: int = Field(ge=0, le=120)
    income_level: Literal["low", "middle", "high"]
    adopted: bool
    forces: ForcesOut
    jtbd_fit: float = Field(ge=0.0, le=1.0)
    service_name: str = Field(min_length=1, max_length=100)


class AgentExplainResponse(BaseModel):
    explanation: str
    agent_id: int


@app.post("/api/agent/explain", response_model=AgentExplainResponse)
async def explain_agent(req: AgentExplainRequest) -> AgentExplainResponse:
    """Generate LLM explanation for a single agent's Forces profile."""
    forces = req.forces

    prompt = (
        f"あなたは消費者行動の専門家です。以下のエージェントプロファイルを分析し、"
        f"このエージェントが「{req.service_name}」を採用するかどうかについて、"
        f"Bob MoestaのSwitch Framework（Forces of Progress）を使って200字以内の日本語で説明してください。\n\n"
        f"エージェント属性:\n"
        f"- ロジャース分類: {req.rogers_type}\n"
        f"- 年齢: {req.age}歳\n"
        f"- 収入層: {req.income_level}\n"
        f"- 採用状況: {'採用済み' if req.adopted else '未採用'}\n"
        f"- JTBDフィット: {req.jtbd_fit:.2f}\n\n"
        f"Forces of Progress:\n"
        f"- F1 Push（現状への不満）: {forces.f1_push:.2f}\n"
        f"- F2 Pull（新ソリューションへの引力）: {forces.f2_pull:.2f}\n"
        f"- F3 Anxiety（新ソリューションへの不安）: {forces.f3_anxiety:.2f}\n"
        f"- F4 Habit（現行動の慣性）: {forces.f4_habit:.2f}\n"
        f"- スイッチスコア: {forces.switch_score:.2f}\n\n"
        f"具体的に、なぜこのエージェントが採用/未採用なのか、主要なドライバーと障壁を挙げて説明してください。"
    )

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        # Fallback: rule-based
        if forces.switch_score > 0.5:
            explanation = (
                f"Agent#{req.agent_id}は採用確率{forces.switch_score:.0%}と高く、"
                f"F1不満({forces.f1_push:.2f})とF2魅力({forces.f2_pull:.2f})が採用を後押ししています。"
            )
        else:
            explanation = (
                f"Agent#{req.agent_id}は採用確率{forces.switch_score:.0%}と低く、"
                f"F3不安({forces.f3_anxiety:.2f})またはF4惰性({forces.f4_habit:.2f})が障壁となっています。"
            )
        return AgentExplainResponse(explanation=explanation, agent_id=req.agent_id)

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text.strip() if message.content else ""
        return AgentExplainResponse(
            explanation=text or "説明を生成できませんでした。",
            agent_id=req.agent_id,
        )
    except Exception:
        # Fallback on any LLM error
        if forces.switch_score > 0.5:
            fallback = (
                f"Agent#{req.agent_id}は採用確率{forces.switch_score:.0%}と高く、"
                f"F1不満({forces.f1_push:.2f})とF2魅力({forces.f2_pull:.2f})が採用を後押ししています。"
            )
        else:
            fallback = (
                f"Agent#{req.agent_id}は採用確率{forces.switch_score:.0%}と低く、"
                f"F3不安({forces.f3_anxiety:.2f})またはF4惰性({forces.f4_habit:.2f})が障壁となっています。"
            )
        return AgentExplainResponse(explanation=fallback, agent_id=req.agent_id)


# --- Report Generation Endpoint ---

class ReportRequestParams(BaseModel):
    price: int = 0
    category: str = "saas"
    price_model: str = "subscription"
    competition: str = "none"
    period: str = "3years"
    tam: int = 0
    target: list[str] | None = None

class ReportSummary(BaseModel):
    total_adopters: int = 0
    total_ever_adopted: int = 0
    total_churned: int = 0
    churn_rate: float = 0.0
    peak_daily: int = 0
    adoption_rate: float = 0.0

class ReportRogersFinal(BaseModel):
    innovator: int = 0
    early_adopter: int = 0
    early_majority: int = 0
    late_majority: int = 0
    laggard: int = 0

class ReportFunnelFinal(BaseModel):
    unaware: int = 0
    aware: int = 0
    interest: int = 0
    consideration: int = 0
    adopted: int = 0

class ReportWhatIf(BaseModel):
    diff: WhatIfDiff
    events: list[str] = []
    interpretation_reasoning: str = ""

class ReportRequest(BaseModel):
    service_name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    config: ConfigOut
    summary: ReportSummary
    odi_score: float | None = None
    odi_label: str | None = None
    sampled_daily_adoption: list[int] = []
    sampled_cumulative_adoption: list[int] = []
    sampled_daily_revenue: list[int] = []
    rogers_final: ReportRogersFinal | None = None
    funnel_final: ReportFunnelFinal | None = None
    request_params: ReportRequestParams
    whatif: ReportWhatIf | None = None


PERIOD_LABELS = {"90days": "90日間", "1year": "1年間（365日）", "3years": "約3年間（1,095日）"}

CATEGORY_LABELS = {
    "saas": "SaaS", "ec": "EC", "media": "メディア", "food": "フード",
    "mobility": "モビリティ", "healthcare": "ヘルスケア", "education": "教育",
    "entertainment": "エンターテインメント", "finance": "ファイナンス",
    "pet": "ペット", "real_estate": "不動産", "automotive": "自動車",
    "beauty": "美容", "sports_fitness": "スポーツ・フィットネス", "travel": "旅行",
    "gaming": "ゲーム", "childcare": "育児", "elderly_care": "介護",
    "insurance": "保険", "fashion": "ファッション", "home_living": "住まい・生活",
    "dating_marriage": "恋愛・婚活", "career": "キャリア",
    "sustainability": "サステナビリティ", "security": "セキュリティ",
}

PRICE_MODEL_LABELS = {
    "free": "無料", "freemium": "フリーミアム", "subscription": "サブスクリプション",
    "usage": "従量課金", "one_time": "買い切り",
}

COMPETITION_LABELS = {"none": "なし", "weak": "弱い", "strong": "強い"}


def _build_report_prompt(req: ReportRequest) -> str:
    period_label = PERIOD_LABELS.get(req.request_params.period, req.request_params.period)
    category_label = CATEGORY_LABELS.get(req.request_params.category, req.request_params.category)
    price_model_label = PRICE_MODEL_LABELS.get(req.request_params.price_model, req.request_params.price_model)
    competition_label = COMPETITION_LABELS.get(req.request_params.competition, req.request_params.competition)

    # Rogers final breakdown
    rogers_section = ""
    if req.rogers_final:
        rf = req.rogers_final
        rogers_section = f"""
## ロジャーズ分類別の最終採用数
| セグメント | 採用者数 |
|-----------|---------|
| イノベーター | {rf.innovator:,}人 |
| アーリーアダプター | {rf.early_adopter:,}人 |
| アーリーマジョリティ | {rf.early_majority:,}人 |
| レイトマジョリティ | {rf.late_majority:,}人 |
| ラガード | {rf.laggard:,}人 |
"""

    # Funnel final breakdown
    funnel_section = ""
    if req.funnel_final:
        ff = req.funnel_final
        total = ff.unaware + ff.aware + ff.interest + ff.consideration + ff.adopted
        if total > 0:
            funnel_section = f"""
## ファネル最終状態（TAM内訳）
| ステージ | 人数 | 比率 |
|---------|------|------|
| 未認知 | {ff.unaware:,}人 | {ff.unaware/total*100:.1f}% |
| 認知 | {ff.aware:,}人 | {ff.aware/total*100:.1f}% |
| 興味 | {ff.interest:,}人 | {ff.interest/total*100:.1f}% |
| 検討 | {ff.consideration:,}人 | {ff.consideration/total*100:.1f}% |
| 採用 | {ff.adopted:,}人 | {ff.adopted/total*100:.1f}% |
"""

    # What-If section
    whatif_section = ""
    if req.whatif:
        wd = req.whatif.diff
        events_text = "\n".join(f"- {e}" for e in req.whatif.events) if req.whatif.events else "（イベントなし）"
        whatif_section = f"""
## What-If分析の結果
### 適用したイベント
{events_text}

### ベースラインとの差分
| 指標 | 変化量 | 変化率 |
|------|--------|--------|
| 総採用者数 | {wd.total_adopters_delta:+,}人 | {wd.total_adopters_pct:+.1f}% |
| 累積売上 | {wd.total_revenue_delta:+,}円 | {wd.total_revenue_pct:+.1f}% |
| 採用率 | {wd.adoption_rate_delta:+.4f} | — |

{f"### LLMの解釈: {req.whatif.interpretation_reasoning}" if req.whatif.interpretation_reasoning else ""}
"""

    # Sampled adoption trend (show a few key points)
    adoption_trend = ""
    if req.sampled_cumulative_adoption:
        n = len(req.sampled_cumulative_adoption)
        points = []
        indices = [0, n // 4, n // 2, 3 * n // 4, n - 1]
        num_steps = req.config.num_steps
        for idx in indices:
            if 0 <= idx < n:
                day = round(idx / max(1, n - 1) * num_steps)
                points.append(f"Day {day}: {req.sampled_cumulative_adoption[idx]:,}人")
        adoption_trend = "累積採用推移のサンプルポイント: " + " → ".join(points)

    # ODI section
    odi_section = ""
    if req.odi_score is not None:
        odi_label_ja = {
            "underserved": "大きなチャンス — 顧客ニーズが満たされておらず参入機会が大きい",
            "served": "競合と同程度 — 既存製品である程度ニーズが満たされている",
            "overserved": "差別化が必要 — 既に十分な選択肢があり強い差別化が求められる",
        }.get(req.odi_label or "", str(req.odi_label))
        odi_section = f"- 市場機会スコア: {req.odi_score:.1f} / 10（{odi_label_ja}）"

    # Target description
    target_text = "全セグメント"
    if req.request_params.target:
        target_text = ", ".join(req.request_params.target)

    # Revenue info (sampled_daily_revenue actually contains cumulative revenue samples)
    revenue_section = ""
    if req.sampled_daily_revenue:
        total_cumulative_revenue = req.sampled_daily_revenue[-1] if req.sampled_daily_revenue else 0
        revenue_section = f"- 累積売上（シミュレーション期間合計）: {total_cumulative_revenue:,}円"

    return f"""あなたはプロダクト戦略コンサルタントです。以下のBass拡散モデルによる市場採用シミュレーション結果を分析し、
投資家や経営者に向けた構造化されたMarkdownレポートを日本語で生成してください。

# シミュレーション入力条件
- サービス名: {req.service_name}
{f"- サービス概要: {req.description}" if req.description else ""}
- カテゴリ: {category_label}
- 価格モデル: {price_model_label} / 月額{req.request_params.price:,}円
- 競合環境: {competition_label}
- シミュレーション期間: {period_label}
- 推定TAM: {req.config.tam:,}人
- ターゲット: {target_text}
- Bassモデル係数: p={req.config.p}, q={req.config.q}

# シミュレーション結果サマリー
| 指標 | 値 |
|------|-----|
| 総採用者数（現在アクティブ） | {req.summary.total_adopters:,}人 |
| 累計採用者数（チャーン含む） | {req.summary.total_ever_adopted:,}人 |
| 累計チャーン数 | {req.summary.total_churned:,}人 |
| チャーン率 | {req.summary.churn_rate:.1%} |
| ピーク日次採用数 | {req.summary.peak_daily:,}人 |
| 最終採用率（対TAM） | {req.summary.adoption_rate:.1%} |
{odi_section}

# 採用推移データ
{adoption_trend}

{rogers_section}
{funnel_section}
{revenue_section}
{whatif_section}

---

以下の構成でMarkdownレポートを出力してください。各セクションで具体的な数値を引用し、深い分析を行ってください。

1. **エグゼクティブサマリー**（3〜5文で全体を要約。TAMに対する採用率、成長フェーズの判断、最大の課題を含む）
2. **市場採用分析**（S字カーブの形状考察、成長フェーズの判断、ピーク時期、日次採用トレンドの評価）
3. **ファネル分析**（各ステージの滞留・ボトルネック分析、コンバージョン率の評価）
4. **ロジャーズ分類別インサイト**（各セグメントの反応差、キャズムの有無判断）
5. **収益ポテンシャル分析**（価格モデルの妥当性、マネタイズ戦略への示唆）
6. **エージェント属性分析**（年齢層・収入層別の採用傾向、ターゲットセグメントの特定）
{f"7. **What-If分析の考察**（シナリオ変更による影響の解釈）" if req.whatif else ""}
{"8" if req.whatif else "7"}. **戦略的推奨事項**（優先度付きの具体的アクション3〜5点）
{"9" if req.whatif else "8"}. **リスクと前提条件**（シミュレーションの限界、注意事項）

## グラフの埋め込み（必須）

各セクションの分析に関連するグラフを、以下のMarkdown画像記法で**必ず**本文中に埋め込んでください。
分析の流れの中で自然な位置（データに言及する直前または直後）に配置してください。

利用可能なグラフ:
- `![累積採用S字カーブ](chart:s-curve)` — 市場採用分析セクションで使用
- `![日次新規採用数](chart:daily-bell)` — 市場採用分析セクションで使用
- `![ファネル推移](chart:funnel-timeline)` — ファネル分析セクションで使用
- `![採用推移タイムライン](chart:adoption-timeline)` — ファネル分析セクションで使用
- `![ロジャーズカテゴリ別採用推移](chart:rogers-breakdown)` — ロジャーズ分類セクションで使用
- `![セグメント別採用率推移](chart:segment-adoption)` — ロジャーズ分類セクションで使用
- `![累積売上推移](chart:revenue)` — 収益分析セクションで使用
- `![年齢層別エージェント分布](chart:age-dist)` — エージェント属性分析セクションで使用
- `![収入層別エージェント分布](chart:income-dist)` — エージェント属性分析セクションで使用
{f"- `![What-If比較](chart:whatif-comparison)` — What-If分析セクションで使用" if req.whatif else ""}

上記の画像記法は **そのままコピーして** レポート本文に埋め込んでください。`src`部分（`chart:xxx`）は絶対に変更しないでください。

レポートのタイトルは「## {req.service_name} 市場採用シミュレーション分析レポート」としてください。
Markdownのみ出力してください。前置きや後置きのテキストは不要です。
テーブル、箇条書き、強調を効果的に使い、読みやすく構造化してください。"""


async def _generate_report_stream(req: ReportRequest):
    """Async generator that streams report chunks as SSE."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        yield b"data: [ERROR] ANTHROPIC_API_KEY is not set\n\n"
        return

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=api_key)
        prompt = _build_report_prompt(req)

        async with client.messages.stream(
            model="claude-sonnet-4-5-20241022",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                # Each chunk is a single SSE event
                # Replace newlines with a placeholder the frontend will decode
                escaped = text.replace("\n", "\\n")
                yield f"data: {escaped}\n\n".encode()
        yield b"data: [DONE]\n\n"
    except Exception as e:
        yield f"data: [ERROR] {str(e)}\n\n".encode()


@app.post("/api/report/generate")
async def generate_report(req: ReportRequest):
    """Generate an analysis report via LLM streaming."""
    return StreamingResponse(
        content=_generate_report_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# --- Chat Assistant Endpoint ---

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    message: str
    locale: str = "ja"
    history: list[ChatMessage] = Field(default_factory=list)
    # Context from frontend state
    simulation_result: dict | None = None
    user_input: dict | None = None
    inferred_params: dict | None = None
    whatif_result: dict | None = None

class ChatResponse(BaseModel):
    reply: str
    category: str  # which category the router determined

CHAT_CATEGORIES = {
    "simulation_results": "シミュレーション結果に関する質問（デフォルト。迷ったらこれを選ぶ）",
    "user_input": "ユーザーが入力した設定やパラメータに関する質問",
    "tool_usage": "このツールの使い方やUIの操作方法に関する質問",
    "logic": "シミュレーションのロジック・アルゴリズム・モデルに関する質問",
}


def _build_category_context(category: str, req: ChatRequest) -> str:
    """Build context string based on the routed category."""
    parts: list[str] = []

    if category == "simulation_results" and req.simulation_result:
        sr = req.simulation_result
        summary = sr.get("summary", {})
        config = sr.get("config", {})
        parts.append(f"""## シミュレーション結果
- サービス名: {sr.get('service_name', '不明')}
- エージェント数: {config.get('num_agents', '?')}
- シミュレーション日数: {config.get('num_steps', '?')}日
- TAM: {config.get('tam', '?')}
- スケールファクター: {config.get('scale_factor', '?')}
- Bass係数: p={config.get('p', '?')}, q={config.get('q', '?')}
- 総採用者数: {summary.get('total_adopters', '?')}
- 累計採用者数: {summary.get('total_ever_adopted', '?')}
- 離脱者数: {summary.get('total_churned', '?')}
- 離脱率: {summary.get('churn_rate', '?')}
- ピーク日次採用: {summary.get('peak_daily', '?')}
- 採用率: {summary.get('adoption_rate', '?')}
- ODIスコア: {sr.get('odi_score', '?')} ({sr.get('odi_label', '?')})""")
        if sr.get("daily_revenue"):
            rev = sr["daily_revenue"]
            cum_rev = sr.get("cumulative_revenue", [])
            parts.append(f"- 最終日累積売上: {cum_rev[-1] if cum_rev else '?'}")
        if sr.get("rogers_breakdown"):
            rb = sr["rogers_breakdown"]
            parts.append(f"- ロジャーズ分類（最終日）: イノベーター={rb.get('innovator',['?'])[-1] if rb.get('innovator') else '?'}, "
                         f"アーリーアダプター={rb.get('early_adopter',['?'])[-1] if rb.get('early_adopter') else '?'}, "
                         f"アーリーマジョリティ={rb.get('early_majority',['?'])[-1] if rb.get('early_majority') else '?'}, "
                         f"レイトマジョリティ={rb.get('late_majority',['?'])[-1] if rb.get('late_majority') else '?'}, "
                         f"ラガード={rb.get('laggard',['?'])[-1] if rb.get('laggard') else '?'}")

    elif category == "user_input" and req.user_input:
        ui = req.user_input
        parts.append(f"""## ユーザー入力パラメータ
- サービス名: {ui.get('service_name', '不明')}
- サービス説明: {ui.get('description', '未入力')}
- 価格: {ui.get('price', '?')}円
- 市場規模: {ui.get('market_size', '?')}
- ターゲット: {', '.join(ui.get('target', []) or ['未指定'])}
- カテゴリ: {ui.get('category', '?')}
- 価格モデル: {ui.get('price_model', '?')}
- 競合: {ui.get('competition', '?')}
- シミュレーション期間: {ui.get('period', '?')}
- TAM: {ui.get('tam', '?')}""")
        if req.inferred_params:
            ip = req.inferred_params
            parts.append(f"""## AI推論パラメータ
- 推論されたターゲット: {ip.get('target', '?')}
- カテゴリ: {ip.get('category', '?')}
- 推奨価格: {ip.get('suggested_price', '?')}円
- 競合レベル: {ip.get('competition', '?')}
- TAM推定: {ip.get('tam_estimate', '?')}
- 推論理由: {ip.get('reasoning', '?')}""")

    elif category == "tool_usage":
        parts.append("""## Value Simulator 使い方ガイド

### 基本の流れ
1. 左パネルでサービス説明を入力（日本語OK）
2. 「AIで分析」ボタンを押すと、AIがパラメータを自動推論
3. 推論されたパラメータを確認・調整
4. シミュレーションが自動実行され、右パネルに結果表示

### 結果の見方
- **サマリー**: 総採用者数、採用率、ピーク日次採用などの概要
- **ファネル分析**: Unaware→Aware→Interest→Consideration→Adoptedの遷移
- **エージェント分析**: 個別エージェントの属性・行動分析、ネットワーク可視化
- **What-Ifシナリオ**: 仮定条件を変えてシミュレーション比較
- **拡散曲線**: Bass拡散モデルによる日次・累積採用曲線

### 詳細設定
- 「詳細設定」で価格・ターゲット・カテゴリ等を手動調整可能
- ロジャーズ分類別の採用推移グラフあり
- レポート生成ボタンでAI分析レポートをPDF出力可能

### What-Ifシナリオ
- 「What-If」セクションでシナリオカードを追加
- 競合参入、価格変更、マーケティング施策等を設定
- ベースラインとの差分を比較分析""")

    elif category == "logic":
        parts.append("""## シミュレーションロジック解説

### Bass拡散モデル
- p（イノベーション係数）: 外部影響（広告等）による採用確率
- q（模倣係数）: 内部影響（口コミ）による採用確率
- 日次採用率 = p + q × (累積採用者/市場規模)

### BDI-LLMハイブリッドエージェント
- 各エージェントはBelief-Desire-Intentionモデルで行動
- 日常行動はルールベース、複雑判断時のみLLM
- エージェントはアーキタイプにクラスタリングされコスト最適化

### JTBD（Jobs-to-be-Done）
- ODI（Opportunity-Driven Innovation）スコアで機会を評価
- importance（重要度）とsatisfaction（満足度）から算出
- underserved/served/overservedの3分類

### ロジャーズ普及理論
- Innovators (2.5%) → Early Adopters (13.5%) → Early Majority (34%) → Late Majority (34%) → Laggards (16%)
- 各カテゴリで採用しきい値が異なる

### Forces of Progress（Bob Moesta Switch Framework）
- F1 Push: 現状への不満（採用を促進）
- F2 Pull: 新ソリューションの魅力（採用を促進）
- F3 Anxiety: 新ソリューションへの不安（採用を阻害）
- F4 Habit: 現行動の慣性（採用を阻害）
- Switch Score = (F1+F2) - (F3+F4) → 0.5超で採用

### ファネルステージ
0: Unaware → 1: Aware → 2: Interest → 3: Consideration → 4: Adopted
各ステージ間の遷移確率はエージェント属性とBass係数に依存

### チャーン（離脱）
- 採用後も一定確率で離脱が発生
- 離脱率は価格感度・JTBDフィット・競合状況で変動""")

    if category == "simulation_results" and req.whatif_result:
        wir = req.whatif_result
        diff = wir.get("diff", {})
        parts.append(f"""## What-If分析結果
- 採用者数差分: {diff.get('total_adopters_delta', '?')} ({diff.get('total_adopters_pct', '?')}%)
- 売上差分: {diff.get('total_revenue_delta', '?')} ({diff.get('total_revenue_pct', '?')}%)
- 採用率差分: {diff.get('adoption_rate_delta', '?')}""")

    return "\n\n".join(parts) if parts else "（該当するコンテキスト情報はありません）"


async def _chat_stream(req: ChatRequest):
    """Async generator that streams chat response as SSE."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        msg = ("Chat is unavailable because the API key is not configured."
               if req.locale == "en" else
               "APIキーが設定されていないため、チャット機能は利用できません。")
        yield f"data: {{}}\n\n".replace("{}", f'{{"category":"simulation_results"}}').encode()
        yield f"data: {msg}\n\n".encode()
        yield b"data: [DONE]\n\n"
        return

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=api_key)

        is_en = req.locale == "en"

        # Step 1: Route with Haiku
        route_prompt = (
            f"Classify the following user question. Return only the category name.\n"
            f"Categories: {', '.join(CHAT_CATEGORIES.keys())}\n\n"
            f"Category descriptions:\n"
            + "\n".join(f"- {k}: {v}" for k, v in CHAT_CATEGORIES.items())
            + f"\n\nIMPORTANT: If unsure, always default to 'simulation_results'.\n"
            + f"\n\nQuestion: {req.message}\n\nCategory name only:"
        )
        route_resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            messages=[{"role": "user", "content": route_prompt}],
        )
        category = route_resp.content[0].text.strip().lower() if route_resp.content else "simulation_results"
        if category not in CHAT_CATEGORIES:
            category = "simulation_results"

        # Send category as first SSE event (JSON metadata)
        import json
        yield f"data: {json.dumps({'category': category})}\n\n".encode()

        # Step 2: Build context and stream with Sonnet
        context = _build_category_context(category, req)

        lang_instruction = (
            "You MUST respond entirely in English. Do not use any Japanese."
            if is_en else
            "必ず日本語のみで回答してください。英語は使わないでください。"
        )

        system_prompt = (
            f"You are the AI assistant for Value Simulator, a market adoption simulator.\n"
            f"Answer the user's question concisely and accurately based on the context below.\n"
            f"Keep your response to 2-3 sentences. Avoid verbose explanations or excessive bullet points — focus on the key point.\n"
            f"Use Markdown formatting for readability.\n"
            f"CRITICAL: {lang_instruction}\n\n"
            f"{context}"
        )

        messages = [{"role": m.role, "content": m.content} for m in req.history[-10:]]
        messages.append({"role": "user", "content": req.message})

        async with client.messages.stream(
            model="claude-sonnet-4-5-20241022",
            max_tokens=300,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                escaped = text.replace("\n", "\\n")
                yield f"data: {escaped}\n\n".encode()

        yield b"data: [DONE]\n\n"

    except Exception as e:
        logging.exception("Chat assistant error")
        err_prefix = "An error occurred" if req.locale == "en" else "エラーが発生しました"
        yield f"data: [ERROR] {err_prefix}: {str(e)}\n\n".encode()


@app.post("/api/chat")
async def chat_assistant(req: ChatRequest):
    """AI chat assistant with Haiku routing + Sonnet streaming response."""
    return StreamingResponse(
        content=_chat_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
