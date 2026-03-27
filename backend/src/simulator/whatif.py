"""What-If event interpretation using LLM."""

import json
import logging
import os

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class WhatIfEvent(BaseModel):
    id: str
    text: str = Field(max_length=500)
    start_day: int | None = Field(default=None, ge=1)
    end_day: int | None = Field(default=None, ge=1)
    enabled: bool = True


class ParameterDelta(BaseModel):
    price_multiplier: float = 1.0
    p_multiplier: float = 1.0
    q_multiplier: float = 1.0
    competition_override: str | None = None
    extra_marketing_events: list[dict] = Field(default_factory=list)
    reasoning: str = ""


class WhatIfInterpretation(BaseModel):
    delta: ParameterDelta = Field(default_factory=ParameterDelta)
    per_card_reasoning: list[str] = Field(default_factory=list)
    fallback_used: bool = False


WHATIF_PRESETS: list[dict[str, str]] = [
    {"label": "競合値下げ", "text": "競合他社が20%値下げした"},
    {"label": "テレビCM", "text": "全国ネットでテレビCMを1週間放映した"},
    {"label": "SNS炎上", "text": "SNSで悪評が拡散し口コミが悪化した"},
    {"label": "インフルエンサー", "text": "フォロワー100万人のインフルエンサーが紹介した"},
    {"label": "価格改定(↑)", "text": "月額料金を30%値上げした"},
    {"label": "無料キャンペーン", "text": "1ヶ月間の無料トライアルキャンペーンを実施した"},
    {"label": "競合参入", "text": "大手企業が類似サービスを開始した"},
    {"label": "口コミ拡散", "text": "SNSでバズって口コミが急拡散した"},
    {"label": "規制強化", "text": "業界に対する規制が強化された"},
    {"label": "提携発表", "text": "大手企業とのパートナーシップを発表した"},
]

VALID_COMPETITIONS = {"none", "weak", "strong"}
VALID_MARKETING_TYPES = {"pr", "sns_ad", "influencer", "word_of_mouth"}


def _clamp(value: float, lo: float = 0.1, hi: float = 3.0) -> float:
    return max(lo, min(hi, value))


def _build_prompt(events: list[WhatIfEvent], context: dict) -> str:
    events_text = "\n".join(
        f"- イベント{i+1} (id={e.id}): {e.text}"
        + (f"（{e.start_day}日目〜{e.end_day}日目）" if e.start_day else "")
        for i, e in enumerate(events)
    )

    return f"""あなたは市場シミュレーションのパラメータ調整の専門家です。

現在のシミュレーション設定:
- カテゴリ: {context.get('category', 'saas')}
- 月額価格: {context.get('price', 1000)}円
- 競合状況: {context.get('competition', 'none')}

以下のWhat-Ifイベントそれぞれについて、シミュレーションパラメータへの影響を推定してください。

イベント一覧:
{events_text}

以下のJSON形式のみで回答してください（説明文不要）:
{{
  "price_multiplier": 1.0,
  "p_multiplier": 1.0,
  "q_multiplier": 1.0,
  "competition_override": null,
  "extra_marketing_events": [],
  "per_card_reasoning": ["イベント1の解釈...", "イベント2の解釈..."],
  "reasoning": "全体的な解釈"
}}

各フィールドの意味:
- price_multiplier: 価格変化率（値下げ20%→0.8, 値上げ30%→1.3）全イベントの複合効果
- p_multiplier: イノベーション係数の倍率（PR・広告強化→1.2〜1.5, 悪評→0.5〜0.8）
- q_multiplier: 口コミ係数の倍率（バイラル拡大→1.3〜1.8, 悪評→0.5〜0.8）
- competition_override: "none"|"weak"|"strong" または null（変更なし）
- extra_marketing_events: [{{"type": "pr"|"sns_ad"|"influencer"|"word_of_mouth", "start_day": N, "end_day": N}}]
- per_card_reasoning: 各イベントの解釈（入力順序と同じ）
- reasoning: 全体的な解釈の要約

判断基準:
- 「競合が値下げした」「競合参入」→ competition_override: "strong", q_multiplier低下
- 「テレビCM」「大規模広告」→ marketing_events + p_multiplier: 1.1〜1.3
- 「SNS広告」「インフルエンサー起用」→ marketing_events + q_multiplier: 1.3〜1.5
- 「値下げ」「無料期間」→ price_multiplier: 0.0〜0.9
- 「口コミ拡散」「バイラル」→ q_multiplier: 1.3〜1.8
- 「規制強化」「悪評」→ p_multiplier: 0.5〜0.7, q_multiplier: 0.6〜0.8
- 複数イベントの複合効果を考慮して総合的に判断してください
- multiplierは0.1〜3.0の範囲で設定してください"""


def _parse_llm_response(response_text: str, num_events: int) -> WhatIfInterpretation:
    """Parse LLM response into WhatIfInterpretation."""
    # Extract JSON from response
    if "```json" in response_text:
        json_str = response_text.split("```json")[1].split("```")[0].strip()
    elif "```" in response_text:
        json_str = response_text.split("```")[1].split("```")[0].strip()
    else:
        json_str = response_text.strip()

    result = json.loads(json_str)

    # Sanitize marketing events
    marketing_events = []
    for me in result.get("extra_marketing_events", []):
        if isinstance(me, dict) and me.get("type") in VALID_MARKETING_TYPES:
            marketing_events.append({
                "type": me["type"],
                "start_day": max(1, int(me.get("start_day", 1))),
                "end_day": max(1, int(me.get("end_day", me.get("start_day", 1)))),
            })

    # Sanitize competition override
    comp = result.get("competition_override")
    if comp not in VALID_COMPETITIONS:
        comp = None

    delta = ParameterDelta(
        price_multiplier=_clamp(float(result.get("price_multiplier", 1.0))),
        p_multiplier=_clamp(float(result.get("p_multiplier", 1.0))),
        q_multiplier=_clamp(float(result.get("q_multiplier", 1.0))),
        competition_override=comp,
        extra_marketing_events=marketing_events,
        reasoning=str(result.get("reasoning", "")),
    )

    per_card = result.get("per_card_reasoning", [])
    # Ensure list length matches events
    while len(per_card) < num_events:
        per_card.append("")

    return WhatIfInterpretation(
        delta=delta,
        per_card_reasoning=per_card[:num_events],
        fallback_used=False,
    )


async def interpret_events(
    events: list[WhatIfEvent],
    context: dict,
) -> WhatIfInterpretation:
    """Interpret What-If events using Claude API.

    Args:
        events: List of What-If events (may include disabled ones).
        context: Dict with category, price, competition.

    Returns:
        WhatIfInterpretation with combined parameter delta.
    """
    enabled = [e for e in events if e.enabled]
    if not enabled:
        return WhatIfInterpretation()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return WhatIfInterpretation(
            per_card_reasoning=["APIキーが設定されていないため解釈できません"] * len(enabled),
            fallback_used=True,
        )

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=api_key)

        prompt = _build_prompt(enabled, context)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        return _parse_llm_response(response_text, len(enabled))

    except Exception as e:
        logger.error(f"What-If LLM interpretation failed: {e}")
        return WhatIfInterpretation(
            per_card_reasoning=["解釈に失敗しました"] * len(enabled),
            fallback_used=True,
        )
