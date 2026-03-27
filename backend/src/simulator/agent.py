"""Agent model with BDI state and Rogers adoption categories."""

from enum import Enum
import random

from pydantic import BaseModel, Field


class RogersCategory(str, Enum):
    INNOVATOR = "innovator"
    EARLY_ADOPTER = "early_adopter"
    EARLY_MAJORITY = "early_majority"
    LATE_MAJORITY = "late_majority"
    LAGGARD = "laggard"


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"


class Region(str, Enum):
    KANTO = "kanto"
    KANSAI = "kansai"
    CHUBU = "chubu"
    KYUSHU = "kyushu"
    TOHOKU = "tohoku"
    HOKKAIDO = "hokkaido"
    CHUGOKU = "chugoku"
    SHIKOKU = "shikoku"


class IncomeLevel(str, Enum):
    LOW = "low"
    MIDDLE = "middle"
    HIGH = "high"


class HouseholdType(str, Enum):
    SINGLE = "single"
    COUPLE = "couple"
    FAMILY_YOUNG = "family_young"
    FAMILY_SCHOOL = "family_school"
    ELDERLY = "elderly"


# --- BDI Sub-models ---

class Beliefs(BaseModel):
    product_awareness: float = Field(default=0.0, ge=0.0, le=1.0)
    brand_perception: float = Field(default=0.5, ge=0.0, le=1.0)
    price_expectation: float = Field(default=0.0, ge=0.0)
    peer_opinions: float = Field(default=0.0, ge=-1.0, le=1.0)


class Desires(BaseModel):
    jobs_to_be_done: list = Field(default_factory=list)
    unmet_needs: list[str] = Field(default_factory=list)
    budget_constraint: float = Field(default=0.0, ge=0.0)


class Intentions(BaseModel):
    consideration_set: list[str] = Field(default_factory=list)
    purchase_timeline: int = -1
    channel_preference: str = "online"


class Social(BaseModel):
    influence_susceptibility: float = Field(default=0.5, ge=0.0, le=1.0)
    opinion_leadership_score: float = Field(default=0.0, ge=0.0, le=1.0)


class Forces(BaseModel):
    """Forces of Progress (Moesta Switch Framework) + post-adoption dynamics."""

    # F1 Push — dissatisfaction with current situation
    current_solution_frustration: float = Field(default=0.5, ge=0.0, le=1.0)
    situation_deterioration: float = Field(default=0.3, ge=0.0, le=1.0)
    unmet_need_severity: float = Field(default=0.5, ge=0.0, le=1.0)
    life_event_trigger: float = Field(default=0.1, ge=0.0, le=1.0)

    # F2 Pull — attraction to new solution
    perceived_value: float = Field(default=0.5, ge=0.0, le=1.0)
    social_proof_strength: float = Field(default=0.3, ge=0.0, le=1.0)
    brand_trust: float = Field(default=0.4, ge=0.0, le=1.0)
    novelty_appeal: float = Field(default=0.4, ge=0.0, le=1.0)
    aspirational_identity: float = Field(default=0.3, ge=0.0, le=1.0)

    # F3 Anxiety — fear/uncertainty about new solution
    performance_uncertainty: float = Field(default=0.5, ge=0.0, le=1.0)
    financial_risk: float = Field(default=0.4, ge=0.0, le=1.0)
    social_risk: float = Field(default=0.3, ge=0.0, le=1.0)
    effort_risk: float = Field(default=0.3, ge=0.0, le=1.0)
    lock_in_fear: float = Field(default=0.3, ge=0.0, le=1.0)

    # F4 Habit — inertia of current behavior
    behavioral_automaticity: float = Field(default=0.5, ge=0.0, le=1.0)
    sunk_cost_perception: float = Field(default=0.4, ge=0.0, le=1.0)
    network_effects_lock_in: float = Field(default=0.3, ge=0.0, le=1.0)
    cognitive_load_of_change: float = Field(default=0.4, ge=0.0, le=1.0)

    # Post-adoption dynamics
    post_purchase_satisfaction: float = Field(default=0.7, ge=0.0, le=1.0)
    churn_probability: float = Field(default=0.05, ge=0.0, le=1.0)
    referral_likelihood: float = Field(default=0.3, ge=0.0, le=1.0)
    regret_probability: float = Field(default=0.1, ge=0.0, le=1.0)
    word_of_mouth_valence: float = Field(default=0.6, ge=0.0, le=1.0)
    engagement_decay_rate: float = Field(default=0.01, ge=0.0, le=1.0)


class FunnelStage(int, Enum):
    """AIDMA-inspired awareness funnel stages."""
    UNAWARE = 0        # 製品の存在を知らない
    AWARE = 1          # 存在は知っているが関心なし
    INTEREST = 2       # 関心を持ち情報収集中
    CONSIDERATION = 3  # 購入を具体的に検討中
    ADOPTED = 4        # 採用済み


# Rogers-based Social parameters: (influence_susceptibility, opinion_leadership_score)
ROGERS_SOCIAL_CONFIG = {
    RogersCategory.INNOVATOR: {"influence_susceptibility": 0.3, "opinion_leadership_score": 0.8},
    RogersCategory.EARLY_ADOPTER: {"influence_susceptibility": 0.4, "opinion_leadership_score": 0.6},
    RogersCategory.EARLY_MAJORITY: {"influence_susceptibility": 0.5, "opinion_leadership_score": 0.3},
    RogersCategory.LATE_MAJORITY: {"influence_susceptibility": 0.7, "opinion_leadership_score": 0.15},
    RogersCategory.LAGGARD: {"influence_susceptibility": 0.8, "opinion_leadership_score": 0.05},
}

# Household type distribution by age band
HOUSEHOLD_BY_AGE = {
    "young": {  # 15-29
        HouseholdType.SINGLE: 0.60,
        HouseholdType.COUPLE: 0.20,
        HouseholdType.FAMILY_YOUNG: 0.10,
        HouseholdType.FAMILY_SCHOOL: 0.05,
        HouseholdType.ELDERLY: 0.05,
    },
    "middle": {  # 30-49
        HouseholdType.SINGLE: 0.15,
        HouseholdType.COUPLE: 0.15,
        HouseholdType.FAMILY_YOUNG: 0.35,
        HouseholdType.FAMILY_SCHOOL: 0.25,
        HouseholdType.ELDERLY: 0.10,
    },
    "senior": {  # 50+
        HouseholdType.SINGLE: 0.15,
        HouseholdType.COUPLE: 0.30,
        HouseholdType.FAMILY_YOUNG: 0.05,
        HouseholdType.FAMILY_SCHOOL: 0.20,
        HouseholdType.ELDERLY: 0.30,
    },
}


# Rogers category distribution and parameters
# Proportions follow Rogers (1962): 2.5%, 13.5%, 34%, 34%, 16%
# p_multiplier: how much more/less likely to self-discover (innovation)
# q_multiplier: how much social influence affects adoption (imitation)
#   - Innovators: high p (self-discover), low q (not swayed by peers)
#   - Early Adopters: moderate p, moderate q
#   - Early/Late Majority: low p, high q (follow the crowd)
#   - Laggards: very low p, very low q (resist both innovation and imitation)
ROGERS_CONFIG = {
    RogersCategory.INNOVATOR: {
        "proportion": 0.025,
        "p_multiplier": 5.0,
        "q_multiplier": 0.3,
        "price_sensitivity": 0.2,
    },
    RogersCategory.EARLY_ADOPTER: {
        "proportion": 0.135,
        "p_multiplier": 2.5,
        "q_multiplier": 0.8,
        "price_sensitivity": 0.4,
    },
    RogersCategory.EARLY_MAJORITY: {
        "proportion": 0.34,
        "p_multiplier": 1.0,
        "q_multiplier": 1.5,
        "price_sensitivity": 0.6,
    },
    RogersCategory.LATE_MAJORITY: {
        "proportion": 0.34,
        "p_multiplier": 0.3,
        "q_multiplier": 1.2,
        "price_sensitivity": 0.8,
    },
    RogersCategory.LAGGARD: {
        "proportion": 0.16,
        "p_multiplier": 0.05,
        "q_multiplier": 0.2,
        "price_sensitivity": 0.9,
    },
}

# Rogers category funnel behavior profiles
# transition_multiplier scales the base transition probability at each stage
# skip_to_stage allows Innovators to jump ahead in the funnel on first exposure
# decay_resistance reduces the chance of regressing when not exposed
ROGERS_FUNNEL_PROFILE = {
    RogersCategory.INNOVATOR: {
        "skip_to_stage": FunnelStage.INTEREST,  # skip Aware on first exposure
        "transition_multiplier": 4.0,
        "decay_resistance": 0.9,
    },
    RogersCategory.EARLY_ADOPTER: {
        "skip_to_stage": FunnelStage.AWARE,
        "transition_multiplier": 2.5,
        "decay_resistance": 0.7,
    },
    RogersCategory.EARLY_MAJORITY: {
        "skip_to_stage": FunnelStage.UNAWARE,
        "transition_multiplier": 1.0,
        "decay_resistance": 0.5,
    },
    RogersCategory.LATE_MAJORITY: {
        "skip_to_stage": FunnelStage.UNAWARE,
        "transition_multiplier": 0.5,
        "decay_resistance": 0.3,
    },
    RogersCategory.LAGGARD: {
        "skip_to_stage": FunnelStage.UNAWARE,
        "transition_multiplier": 0.2,
        "decay_resistance": 0.15,
    },
}


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    """Clamp value to [lo, hi]."""
    return max(lo, min(hi, v))


# Rogers-based Forces of Progress baselines
ROGERS_FORCES_CONFIG = {
    RogersCategory.INNOVATOR: {
        # F1 Push — high frustration, seeks novelty actively
        "current_solution_frustration": 0.6, "situation_deterioration": 0.4,
        "unmet_need_severity": 0.6, "life_event_trigger": 0.3,
        # F2 Pull — high attraction to new
        "perceived_value": 0.8, "social_proof_strength": 0.2,
        "brand_trust": 0.5, "novelty_appeal": 0.9, "aspirational_identity": 0.6,
        # F3 Anxiety — low fear
        "performance_uncertainty": 0.2, "financial_risk": 0.2,
        "social_risk": 0.1, "effort_risk": 0.15, "lock_in_fear": 0.15,
        # F4 Habit — low inertia
        "behavioral_automaticity": 0.2, "sunk_cost_perception": 0.15,
        "network_effects_lock_in": 0.1, "cognitive_load_of_change": 0.15,
        # Post-adoption
        "post_purchase_satisfaction": 0.8, "churn_probability": 0.02,
        "referral_likelihood": 0.7, "regret_probability": 0.05,
        "word_of_mouth_valence": 0.8, "engagement_decay_rate": 0.005,
    },
    RogersCategory.EARLY_ADOPTER: {
        "current_solution_frustration": 0.5, "situation_deterioration": 0.35,
        "unmet_need_severity": 0.55, "life_event_trigger": 0.2,
        "perceived_value": 0.7, "social_proof_strength": 0.4,
        "brand_trust": 0.5, "novelty_appeal": 0.7, "aspirational_identity": 0.5,
        "performance_uncertainty": 0.3, "financial_risk": 0.3,
        "social_risk": 0.2, "effort_risk": 0.2, "lock_in_fear": 0.2,
        "behavioral_automaticity": 0.3, "sunk_cost_perception": 0.25,
        "network_effects_lock_in": 0.2, "cognitive_load_of_change": 0.2,
        "post_purchase_satisfaction": 0.75, "churn_probability": 0.03,
        "referral_likelihood": 0.65, "regret_probability": 0.08,
        "word_of_mouth_valence": 0.75, "engagement_decay_rate": 0.008,
    },
    RogersCategory.EARLY_MAJORITY: {
        "current_solution_frustration": 0.45, "situation_deterioration": 0.3,
        "unmet_need_severity": 0.45, "life_event_trigger": 0.1,
        "perceived_value": 0.55, "social_proof_strength": 0.65,
        "brand_trust": 0.45, "novelty_appeal": 0.4, "aspirational_identity": 0.35,
        "performance_uncertainty": 0.45, "financial_risk": 0.45,
        "social_risk": 0.35, "effort_risk": 0.35, "lock_in_fear": 0.35,
        "behavioral_automaticity": 0.5, "sunk_cost_perception": 0.4,
        "network_effects_lock_in": 0.4, "cognitive_load_of_change": 0.4,
        "post_purchase_satisfaction": 0.65, "churn_probability": 0.04,
        "referral_likelihood": 0.45, "regret_probability": 0.12,
        "word_of_mouth_valence": 0.65, "engagement_decay_rate": 0.01,
    },
    RogersCategory.LATE_MAJORITY: {
        "current_solution_frustration": 0.35, "situation_deterioration": 0.25,
        "unmet_need_severity": 0.35, "life_event_trigger": 0.08,
        "perceived_value": 0.4, "social_proof_strength": 0.75,
        "brand_trust": 0.35, "novelty_appeal": 0.25, "aspirational_identity": 0.2,
        "performance_uncertainty": 0.6, "financial_risk": 0.6,
        "social_risk": 0.45, "effort_risk": 0.5, "lock_in_fear": 0.5,
        "behavioral_automaticity": 0.65, "sunk_cost_perception": 0.55,
        "network_effects_lock_in": 0.55, "cognitive_load_of_change": 0.55,
        "post_purchase_satisfaction": 0.6, "churn_probability": 0.05,
        "referral_likelihood": 0.25, "regret_probability": 0.18,
        "word_of_mouth_valence": 0.55, "engagement_decay_rate": 0.015,
    },
    RogersCategory.LAGGARD: {
        "current_solution_frustration": 0.25, "situation_deterioration": 0.2,
        "unmet_need_severity": 0.25, "life_event_trigger": 0.05,
        "perceived_value": 0.3, "social_proof_strength": 0.5,
        "brand_trust": 0.25, "novelty_appeal": 0.15, "aspirational_identity": 0.1,
        "performance_uncertainty": 0.75, "financial_risk": 0.7,
        "social_risk": 0.55, "effort_risk": 0.65, "lock_in_fear": 0.65,
        "behavioral_automaticity": 0.8, "sunk_cost_perception": 0.7,
        "network_effects_lock_in": 0.65, "cognitive_load_of_change": 0.7,
        "post_purchase_satisfaction": 0.55, "churn_probability": 0.06,
        "referral_likelihood": 0.1, "regret_probability": 0.25,
        "word_of_mouth_valence": 0.5, "engagement_decay_rate": 0.02,
    },
}


class Agent(BaseModel):
    id: int
    age: int = Field(ge=15, le=90)
    gender: Gender
    region: Region
    income: int  # annual income in 万円
    income_level: IncomeLevel
    household_type: HouseholdType = HouseholdType.SINGLE
    rogers_type: RogersCategory
    price_sensitivity: float = Field(ge=0.0, le=1.0)
    p: float  # individual innovation coefficient
    q: float  # individual imitation coefficient
    adopted: bool = False
    adopted_day: int | None = None
    awareness: float = 0.0  # 0-1 (derived: funnel_stage / 4.0)
    jtbd_fit: float = Field(default=0.5, ge=0.0, le=1.0)
    funnel_stage: FunnelStage = FunnelStage.UNAWARE
    stage_entered_day: int = 0
    days_without_exposure: int = 0
    # Lifestyle tags (assigned during population generation)
    lifestyle_tags: list[str] = Field(default_factory=list)
    # BDI sub-models
    beliefs: Beliefs = Field(default_factory=Beliefs)
    desires: Desires = Field(default_factory=Desires)
    intentions: Intentions = Field(default_factory=Intentions)
    social: Social = Field(default_factory=Social)
    forces: Forces = Field(default_factory=Forces)


def create_agent(
    agent_id: int,
    base_p: float = 0.005,
    base_q: float = 0.10,
    rng: random.Random | None = None,
    category: str = "saas",
    custom_jobs: list | None = None,
    target_groups: list[str] | None = None,
    critical_lifestyle_tags: list[dict] | None = None,
) -> Agent:
    """Create a single agent with randomized demographics based on Japan stats."""
    if rng is None:
        rng = random.Random()

    # Age distribution (simplified Japan demographics)
    age = rng.choices(
        population=[20, 30, 40, 50, 60, 70],
        weights=[0.15, 0.18, 0.20, 0.18, 0.16, 0.13],
    )[0]
    age += rng.randint(-5, 5)
    age = max(15, min(90, age))

    gender = rng.choice(list(Gender))

    region = rng.choices(
        population=list(Region),
        weights=[0.35, 0.20, 0.15, 0.10, 0.07, 0.05, 0.05, 0.03],
    )[0]

    # Income based on age
    base_income = {20: 250, 30: 350, 40: 450, 50: 500, 60: 400, 70: 300}
    closest_age = min(base_income.keys(), key=lambda x: abs(x - age))
    income = max(100, base_income[closest_age] + rng.randint(-100, 100))

    if income < 300:
        income_level = IncomeLevel.LOW
    elif income < 500:
        income_level = IncomeLevel.MIDDLE
    else:
        income_level = IncomeLevel.HIGH

    # Assign Rogers category
    categories = list(ROGERS_CONFIG.keys())
    proportions = [ROGERS_CONFIG[c]["proportion"] for c in categories]
    rogers_type = rng.choices(categories, weights=proportions)[0]

    config = ROGERS_CONFIG[rogers_type]
    p = base_p * config["p_multiplier"]
    q = base_q * config["q_multiplier"]
    price_sensitivity = config["price_sensitivity"]

    # Household type based on age
    if age < 30:
        age_band = "young"
    elif age < 50:
        age_band = "middle"
    else:
        age_band = "senior"
    hh_dist = HOUSEHOLD_BY_AGE[age_band]
    household_type = rng.choices(
        list(hh_dist.keys()), weights=list(hh_dist.values())
    )[0]

    # Assign lifestyle tags based on demographics
    from simulator.lifestyle import assign_lifestyle_tags
    lifestyle_tags = assign_lifestyle_tags(
        age=age,
        gender=gender.value,
        region=region.value,
        income_level=income_level.value,
        household_type=household_type.value,
        rng=rng,
    )

    # BDI sub-models
    social_cfg = ROGERS_SOCIAL_CONFIG[rogers_type]
    social = Social(
        influence_susceptibility=social_cfg["influence_susceptibility"],
        opinion_leadership_score=social_cfg["opinion_leadership_score"],
    )

    # budget_constraint: 30% of monthly gross income (income is annual in 万円)
    monthly_income_yen = income * 10000 / 12
    budget_constraint = round(monthly_income_yen * 0.3)

    # Per-agent JTBD fit based on demographics
    from simulator.jtbd import compute_agent_jtbd_fit, CATEGORY_JOBS, Job
    # Convert custom_jobs dicts to Job objects if needed
    job_objects = None
    if custom_jobs:
        job_objects = [
            Job(**j) if isinstance(j, dict) else j
            for j in custom_jobs
        ]
    agent_jtbd_fit = compute_agent_jtbd_fit(
        age, household_type, category,
        custom_jobs=job_objects,
        target_groups=target_groups,
        agent_lifestyle_tags=lifestyle_tags,
        critical_lifestyle_tags=critical_lifestyle_tags,
    )
    category_jobs = CATEGORY_JOBS.get(category, CATEGORY_JOBS["saas"])
    jobs_list = [j.model_dump() for j in category_jobs]

    beliefs = Beliefs()
    desires = Desires(budget_constraint=budget_constraint, jobs_to_be_done=jobs_list)
    intentions = Intentions()

    # Forces of Progress: Rogers baseline + demographic adjustments + noise
    forces_cfg = ROGERS_FORCES_CONFIG[rogers_type]
    forces_vals = dict(forces_cfg)  # copy

    # Demographic correlations
    if age > 50:
        forces_vals["behavioral_automaticity"] += 0.1
        forces_vals["cognitive_load_of_change"] += 0.1
    if age < 30:
        forces_vals["novelty_appeal"] += 0.1
        forces_vals["life_event_trigger"] += 0.1
    if income_level == IncomeLevel.HIGH:
        forces_vals["financial_risk"] -= 0.1
        forces_vals["perceived_value"] += 0.05
    if income_level == IncomeLevel.LOW:
        forces_vals["financial_risk"] += 0.1
    if household_type in (HouseholdType.FAMILY_YOUNG, HouseholdType.FAMILY_SCHOOL):
        forces_vals["unmet_need_severity"] += 0.1
        forces_vals["effort_risk"] += 0.05

    # Add per-agent noise (σ=0.08)
    noisy_forces = {
        k: _clamp(v + rng.gauss(0, 0.08))
        for k, v in forces_vals.items()
    }
    forces = Forces(**noisy_forces)

    return Agent(
        id=agent_id,
        age=age,
        gender=gender,
        region=region,
        income=income,
        income_level=income_level,
        household_type=household_type,
        rogers_type=rogers_type,
        price_sensitivity=price_sensitivity,
        p=p,
        q=q,
        jtbd_fit=agent_jtbd_fit,
        lifestyle_tags=lifestyle_tags,
        beliefs=beliefs,
        desires=desires,
        intentions=intentions,
        social=social,
        forces=forces,
    )
