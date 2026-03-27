"""Jobs-to-be-Done (JTBD) module with ODI opportunity score calculation."""

from pydantic import BaseModel, Field

class Job(BaseModel):
    statement: str
    type: str = "functional"  # functional, emotional, social
    importance: int = Field(ge=1, le=5)
    current_satisfaction: int = Field(ge=1, le=5)

class JTBDResult(BaseModel):
    jobs: list[Job]
    odi_score: float
    odi_label: str  # "underserved", "served", "overserved"
    jtbd_fit: float  # 0.0 - 1.0 for engine input

# Preset jobs by category x target
CATEGORY_JOBS = {
    "saas": [
        Job(statement="業務を効率化する", type="functional", importance=4, current_satisfaction=3),
        Job(statement="チームコラボレーションを改善する", type="social", importance=3, current_satisfaction=2),
    ],
    "ec": [
        Job(statement="欲しい商品を素早く見つける", type="functional", importance=5, current_satisfaction=3),
        Job(statement="買い物の満足感を得る", type="emotional", importance=3, current_satisfaction=3),
    ],
    "media": [
        Job(statement="最新情報をキャッチアップする", type="functional", importance=4, current_satisfaction=3),
        Job(statement="退屈な時間を楽しく過ごす", type="emotional", importance=4, current_satisfaction=2),
    ],
    "food": [
        Job(statement="美味しい食事を手軽に得る", type="functional", importance=5, current_satisfaction=3),
        Job(statement="新しい食体験を楽しむ", type="emotional", importance=3, current_satisfaction=2),
    ],
    "mobility": [
        Job(statement="目的地に素早く到着する", type="functional", importance=5, current_satisfaction=2),
        Job(statement="移動のストレスを減らす", type="emotional", importance=4, current_satisfaction=2),
    ],
    "healthcare": [
        Job(statement="健康状態を管理する", type="functional", importance=5, current_satisfaction=2),
        Job(statement="健康への不安を軽減する", type="emotional", importance=4, current_satisfaction=2),
    ],
    "education": [
        Job(statement="新しいスキルを効率的に学ぶ", type="functional", importance=4, current_satisfaction=2),
        Job(statement="学びの達成感を得る", type="emotional", importance=3, current_satisfaction=3),
    ],
    "entertainment": [
        Job(statement="余暇を楽しく過ごす", type="functional", importance=4, current_satisfaction=3),
        Job(statement="他の人と体験を共有する", type="social", importance=3, current_satisfaction=3),
    ],
    "finance": [
        Job(statement="資産を効率的に管理する", type="functional", importance=5, current_satisfaction=2),
        Job(statement="お金の不安を軽減する", type="emotional", importance=4, current_satisfaction=2),
    ],
    # --- Expanded categories (16 new) ---
    "pet": [
        Job(statement="ペットの健康を維持する", type="functional", importance=5, current_satisfaction=3),
        Job(statement="ペットとの絆を深める", type="emotional", importance=4, current_satisfaction=3),
    ],
    "real_estate": [
        Job(statement="理想の住まいを見つける", type="functional", importance=5, current_satisfaction=2),
        Job(statement="住まいの安心感を得る", type="emotional", importance=4, current_satisfaction=3),
    ],
    "automotive": [
        Job(statement="快適に移動する手段を確保する", type="functional", importance=5, current_satisfaction=3),
        Job(statement="所有する車への満足感を得る", type="emotional", importance=3, current_satisfaction=3),
    ],
    "beauty": [
        Job(statement="自分の外見を整える", type="functional", importance=4, current_satisfaction=3),
        Job(statement="自信を持てる自分になる", type="emotional", importance=4, current_satisfaction=2),
    ],
    "sports_fitness": [
        Job(statement="体力・健康を維持向上する", type="functional", importance=4, current_satisfaction=2),
        Job(statement="運動を通じて達成感を得る", type="emotional", importance=3, current_satisfaction=3),
    ],
    "travel": [
        Job(statement="非日常の体験を楽しむ", type="emotional", importance=4, current_satisfaction=3),
        Job(statement="旅行の計画・手配を効率化する", type="functional", importance=4, current_satisfaction=2),
    ],
    "gaming": [
        Job(statement="余暇に没頭できる体験を得る", type="emotional", importance=4, current_satisfaction=3),
        Job(statement="他のプレイヤーと繋がる", type="social", importance=3, current_satisfaction=3),
    ],
    "childcare": [
        Job(statement="子供の成長を適切にサポートする", type="functional", importance=5, current_satisfaction=2),
        Job(statement="育児の不安やストレスを軽減する", type="emotional", importance=5, current_satisfaction=2),
    ],
    "elderly_care": [
        Job(statement="高齢の家族を安全に見守る", type="functional", importance=5, current_satisfaction=2),
        Job(statement="介護の負担を軽減する", type="emotional", importance=5, current_satisfaction=1),
    ],
    "insurance": [
        Job(statement="将来のリスクに備える", type="functional", importance=5, current_satisfaction=3),
        Job(statement="万が一の不安を軽減する", type="emotional", importance=4, current_satisfaction=3),
    ],
    "fashion": [
        Job(statement="自分らしいスタイルを表現する", type="emotional", importance=4, current_satisfaction=3),
        Job(statement="コスパ良く服を揃える", type="functional", importance=3, current_satisfaction=3),
    ],
    "home_living": [
        Job(statement="快適な住空間を維持する", type="functional", importance=4, current_satisfaction=3),
        Job(statement="住まいを自分好みにカスタマイズする", type="emotional", importance=3, current_satisfaction=3),
    ],
    "dating_marriage": [
        Job(statement="理想のパートナーと出会う", type="social", importance=5, current_satisfaction=1),
        Job(statement="恋愛・結婚への不安を解消する", type="emotional", importance=4, current_satisfaction=2),
    ],
    "career": [
        Job(statement="キャリアアップの機会を得る", type="functional", importance=5, current_satisfaction=2),
        Job(statement="仕事のやりがいを感じる", type="emotional", importance=4, current_satisfaction=3),
    ],
    "sustainability": [
        Job(statement="環境に配慮した生活をする", type="functional", importance=3, current_satisfaction=2),
        Job(statement="社会貢献している実感を得る", type="emotional", importance=3, current_satisfaction=2),
    ],
    "security": [
        Job(statement="自分と家族の安全を守る", type="functional", importance=5, current_satisfaction=3),
        Job(statement="犯罪やトラブルへの不安を軽減する", type="emotional", importance=4, current_satisfaction=3),
    ],
}

# Target adjustments: modify importance/satisfaction based on target user
TARGET_ADJUSTMENTS = {
    # Age groups
    "teens": {"importance_mod": 0, "satisfaction_mod": -1},
    "twenties": {"importance_mod": 1, "satisfaction_mod": -1},
    "thirties": {"importance_mod": 1, "satisfaction_mod": 0},
    "forties": {"importance_mod": 0, "satisfaction_mod": 0},
    "fifties": {"importance_mod": -1, "satisfaction_mod": 1},
    "sixties_plus": {"importance_mod": -1, "satisfaction_mod": 1},
    # Occupation / role
    "student": {"importance_mod": 0, "satisfaction_mod": -1},
    "new_graduate": {"importance_mod": 1, "satisfaction_mod": -1},
    "working_professional": {"importance_mod": 1, "satisfaction_mod": 0},
    "freelancer": {"importance_mod": 1, "satisfaction_mod": -1},
    "homemaker": {"importance_mod": 0, "satisfaction_mod": 0},
    "retired": {"importance_mod": -1, "satisfaction_mod": 1},
    # Household
    "single": {"importance_mod": 0, "satisfaction_mod": -1},
    "couple": {"importance_mod": 0, "satisfaction_mod": 0},
    "parent_young_child": {"importance_mod": 1, "satisfaction_mod": -1},
    "parent_school_child": {"importance_mod": 0, "satisfaction_mod": 0},
    # Business
    "startup": {"importance_mod": 1, "satisfaction_mod": -1},
    "smb": {"importance_mod": 1, "satisfaction_mod": 0},
    "enterprise": {"importance_mod": 0, "satisfaction_mod": 1},
}

def calculate_odi_score(importance: int, satisfaction: int) -> float:
    """ODI Opportunity Score = importance + max(importance - satisfaction, 0)"""
    return importance + max(importance - satisfaction, 0)

def evaluate_jtbd(
    category: str,
    target: list[str] | str | None = None,
    custom_jobs: list[Job] | None = None,
) -> JTBDResult:
    """Evaluate JTBD for a given category and target(s).

    Returns JTBDResult with ODI score and fit value.
    Target can be a single string or a list of strings.
    When multiple targets are given, their adjustments are averaged.
    """
    if custom_jobs:
        jobs = custom_jobs
    else:
        jobs = list(CATEGORY_JOBS.get(category, CATEGORY_JOBS["saas"]))

    # Normalize target to list
    targets: list[str] = []
    if isinstance(target, str):
        targets = [target]
    elif isinstance(target, list):
        targets = target

    # Filter to known targets
    valid_targets = [t for t in targets if t in TARGET_ADJUSTMENTS]

    # Apply target adjustments (average across multiple targets)
    if valid_targets:
        avg_imp_mod = sum(TARGET_ADJUSTMENTS[t]["importance_mod"] for t in valid_targets) / len(valid_targets)
        avg_sat_mod = sum(TARGET_ADJUSTMENTS[t]["satisfaction_mod"] for t in valid_targets) / len(valid_targets)
        adjusted_jobs = []
        for job in jobs:
            imp = max(1, min(5, round(job.importance + avg_imp_mod)))
            sat = max(1, min(5, round(job.current_satisfaction + avg_sat_mod)))
            adjusted_jobs.append(Job(
                statement=job.statement,
                type=job.type,
                importance=imp,
                current_satisfaction=sat,
            ))
        jobs = adjusted_jobs

    # Calculate average ODI score
    if not jobs:
        return JTBDResult(jobs=[], odi_score=0.0, odi_label="served", jtbd_fit=0.5)

    scores = [calculate_odi_score(j.importance, j.current_satisfaction) for j in jobs]
    avg_score = sum(scores) / len(scores)

    # Classify
    if avg_score > 7:
        label = "underserved"
    elif avg_score >= 4:
        label = "served"
    else:
        label = "overserved"

    # Convert to 0-1 fit score (higher ODI = better opportunity = higher fit)
    # Max possible ODI = 10 (importance=5, satisfaction=0 -> 5+5=10)
    jtbd_fit = min(1.0, avg_score / 10.0)

    return JTBDResult(
        jobs=jobs,
        odi_score=round(avg_score, 2),
        odi_label=label,
        jtbd_fit=round(jtbd_fit, 2),
    )


# --- Agent demographics → target mapping ---

from simulator.agent import HouseholdType

AGE_TO_TARGET = {
    (15, 19): "teens",
    (20, 29): "twenties",
    (30, 39): "thirties",
    (40, 49): "forties",
    (50, 59): "fifties",
    (60, 90): "sixties_plus",
}

HOUSEHOLD_TO_TARGET = {
    HouseholdType.SINGLE: "single",
    HouseholdType.COUPLE: "couple",
    HouseholdType.FAMILY_YOUNG: "parent_young_child",
    HouseholdType.FAMILY_SCHOOL: "parent_school_child",
    HouseholdType.ELDERLY: "retired",
}


def agent_targets_from_demographics(age: int, household_type: HouseholdType) -> list[str]:
    """Map agent demographics to JTBD target categories.

    Returns a list of target strings (age group + household type).
    """
    targets: list[str] = []
    for (lo, hi), target in AGE_TO_TARGET.items():
        if lo <= age <= hi:
            targets.append(target)
            break
    hh_target = HOUSEHOLD_TO_TARGET.get(household_type)
    if hh_target:
        targets.append(hh_target)
    return targets


def _apply_lifestyle_tag_multiplier(
    base_fit: float,
    agent_lifestyle_tags: list[str] | None,
    critical_lifestyle_tags: list[dict] | None,
) -> float:
    """Apply lifestyle tag matching multiplier to base fit.

    match_ratio=1.0 → 1.5x boost; match_ratio=0.0 → 0.3x reduction (5:1 ratio).
    If no critical_lifestyle_tags, returns base_fit unchanged.
    """
    if not critical_lifestyle_tags or not agent_lifestyle_tags:
        return base_fit

    tag_set = set(agent_lifestyle_tags)
    total_weight = sum(ct["weight"] for ct in critical_lifestyle_tags)
    if total_weight <= 0:
        return base_fit

    matched_weight = sum(
        ct["weight"] for ct in critical_lifestyle_tags
        if ct["tag"] in tag_set
    )
    match_ratio = matched_weight / total_weight  # 0.0 to 1.0
    lifestyle_multiplier = 0.3 + 1.2 * match_ratio
    return min(1.0, base_fit * lifestyle_multiplier)


def compute_agent_jtbd_fit(
    age: int,
    household_type: HouseholdType,
    category: str,
    custom_jobs: list[Job] | None = None,
    target_groups: list[str] | None = None,
    agent_lifestyle_tags: list[str] | None = None,
    critical_lifestyle_tags: list[dict] | None = None,
) -> float:
    """Compute per-agent jtbd_fit based on demographics, category, and lifestyle tags.

    When custom_jobs and target_groups are provided (from LLM inference),
    uses target affinity scoring: agents matching target_groups get higher fit,
    non-matching agents get reduced fit. This ensures service-specific
    demographics (e.g., 40+ for digital legacy) are properly reflected.

    Lifestyle tag matching (critical_lifestyle_tags) applies an additional
    multiplier: matched agents get up to 1.5x boost, unmatched get 0.3x.

    Without target_groups, falls back to generic TARGET_ADJUSTMENTS behavior.
    """
    agent_targets = agent_targets_from_demographics(age, household_type)

    if target_groups and custom_jobs:
        # LLM-inferred mode: use custom jobs without generic target adjustments
        # and apply target affinity scoring
        base_result = evaluate_jtbd(category=category, custom_jobs=custom_jobs)
        base_fit = base_result.jtbd_fit

        # Check how many of the agent's demographic targets match LLM target_groups
        matches = sum(1 for t in agent_targets if t in target_groups)
        if matches > 0:
            # Agent matches target: full fit + small boost
            fit = min(1.0, base_fit * (1.0 + 0.15 * matches))
        else:
            # Agent doesn't match target: reduced fit
            fit = base_fit * 0.4
    elif custom_jobs:
        # Custom jobs but no target groups: use custom jobs with generic adjustments
        result = evaluate_jtbd(category=category, target=agent_targets, custom_jobs=custom_jobs)
        fit = result.jtbd_fit
    else:
        # Default: category preset jobs + generic target adjustments
        result = evaluate_jtbd(category=category, target=agent_targets)
        fit = result.jtbd_fit

    # Apply lifestyle tag matching multiplier
    fit = _apply_lifestyle_tag_multiplier(
        fit, agent_lifestyle_tags, critical_lifestyle_tags,
    )
    return fit


# --- Claude API Integration for Day 5 ---

import json
import os

async def infer_jtbd_with_llm(description: str, api_key: str | None = None) -> dict | None:
    """Use Claude API to infer JTBD from service description.

    Returns dict with jobs, target, category, suggested_price, competition,
    critical_lifestyle_tags, reasoning.
    Falls back to None if API is unavailable.
    """
    api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        import anthropic
        from simulator.lifestyle import build_compact_tag_prompt
        client = anthropic.AsyncAnthropic(api_key=api_key)

        tag_pool = build_compact_tag_prompt()

        prompt = f"""あなたはJobs-to-be-Done (JTBD)フレームワークの専門家です。
以下のサービス説明文を分析し、JSON形式で回答してください。

サービス説明: {description}

## ライフスタイルタグプール（このサービスに重要なタグを選択）
{tag_pool}

以下のJSON形式で回答してください（日本語で）:
{{
  "jobs": [
    {{
      "statement": "ジョブの記述",
      "type": "functional" | "emotional" | "social",
      "importance": 1-5,
      "current_satisfaction": 1-5
    }}
  ],
  "target": ["teens" | "twenties" | "thirties" | "forties" | "fifties" | "sixties_plus" | "student" | "new_graduate" | "working_professional" | "freelancer" | "homemaker" | "retired" | "single" | "couple" | "parent_young_child" | "parent_school_child" | "startup" | "smb" | "enterprise"],
  "category": "saas" | "ec" | "media" | "food" | "mobility" | "healthcare" | "education" | "entertainment" | "finance" | "pet" | "real_estate" | "automotive" | "beauty" | "sports_fitness" | "travel" | "gaming" | "childcare" | "elderly_care" | "insurance" | "fashion" | "home_living" | "dating_marriage" | "career" | "sustainability" | "security",
  "critical_lifestyle_tags": [
    {{"tag": "タグID（上記プールから選択）", "weight": 0.0-1.0（このサービスにとっての重要度）}}
  ],
  "suggested_price": 数値（月額円）,
  "competition": "none" | "weak" | "strong",
  "tam_estimate": 数値（日本市場における推定TAM人数。日本の総人口約1.25億人のうち、このサービスが対象とする市場規模を推定）,
  "reasoning": "推論の理由（日本語）"
}}

重要: critical_lifestyle_tagsは、このサービスの利用者にとって最も決定的なライフスタイル属性を3〜10個選んでください。weightはそのタグがサービス利用の前提条件に近いほど1.0に、あれば望ましい程度なら0.3-0.5にしてください。"""

        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        # Extract JSON from response
        # Try to find JSON block
        if "```json" in response_text:
            json_str = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            json_str = response_text.split("```")[1].split("```")[0].strip()
        else:
            json_str = response_text.strip()

        result = json.loads(json_str)
        return result

    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"LLM inference failed: {e}")
        return None
