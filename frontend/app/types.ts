// ---------- Shared Types ----------

export type MarketSize = "small" | "medium" | "large";
export type Target =
  | "teens"
  | "twenties"
  | "thirties"
  | "forties"
  | "fifties"
  | "sixties_plus"
  | "student"
  | "new_graduate"
  | "working_professional"
  | "freelancer"
  | "homemaker"
  | "retired"
  | "single"
  | "couple"
  | "parent_young_child"
  | "parent_school_child"
  | "startup"
  | "smb"
  | "enterprise";
export type Category =
  | "saas"
  | "ec"
  | "media"
  | "food"
  | "mobility"
  | "healthcare"
  | "education"
  | "entertainment"
  | "finance";
export type PriceModel = "free" | "freemium" | "subscription" | "usage" | "one_time";
export type Competition = "none" | "weak" | "strong";
export type Period = "90days" | "1year" | "3years";

export type SimulateRequest = {
  service_name: string;
  price: number;
  market_size: MarketSize;
  description?: string;
  target?: Target[] | null;
  category?: Category;
  price_model?: PriceModel;
  competition?: Competition;
  period?: Period;
  tam: number;
};

export type AgentStateEntry = {
  day: number;
  awareness: number;
  adopted: boolean;
  funnel_stage: number;
};

export type AgentForces = {
  f1_push: number;
  f2_pull: number;
  f3_anxiety: number;
  f4_habit: number;
  switch_score: number;
  referral_likelihood: number;
  word_of_mouth_valence: number;
};

export type AgentSnapshot = {
  id: number;
  age: number;
  gender: string;
  region: string;
  income: number;
  income_level: string;
  rogers_type: string;
  price_sensitivity: number;
  jtbd_fit: number;
  awareness: number;
  adopted: boolean;
  adopted_day: number | null;
  funnel_stage: number;
  state_history: AgentStateEntry[];
  forces: AgentForces | null;
};

export type FunnelSnapshotEntry = {
  unaware: number;
  aware: number;
  interest: number;
  consideration: number;
  adopted: number;
};

export type NetworkNode = {
  id: number;
  x: number;
  y: number;
  rogers_type: string;
  adopted: boolean;
  adopted_day: number | null;
};

export type NetworkData = {
  nodes: NetworkNode[];
  edges: [number, number][];
};

export type RogersBreakdown = {
  innovator: number[];
  early_adopter: number[];
  early_majority: number[];
  late_majority: number[];
  laggard: number[];
};

export type SimulateResponse = {
  service_name: string;
  config: { num_agents: number; num_steps: number; tam?: number; scale_factor?: number; p: number; q: number };
  daily_adoption: number[];
  cumulative_adoption: number[];
  summary: {
    total_adopters: number;
    total_ever_adopted?: number;
    total_churned?: number;
    churn_rate?: number;
    peak_daily: number;
    adoption_rate: number;
  };
  rogers_breakdown?: RogersBreakdown | null;
  daily_revenue?: number[] | null;
  cumulative_revenue?: number[] | null;
  odi_score?: number | null;
  odi_label?: "underserved" | "served" | "overserved" | null;
  agent_snapshot?: AgentSnapshot[] | null;
  daily_funnel_snapshot?: FunnelSnapshotEntry[] | null;
  chart_steps?: number | null;
  day_labels?: number[] | null;
  network?: NetworkData | null;
};

export type AutoResponse = {
  inferred_params: {
    jobs: { statement: string; type: string; importance: number; current_satisfaction: number }[] | string;
    target: string;
    category: string;
    suggested_price: number;
    competition: string;
    tam_estimate: number | null;
    reasoning: string;
  };
  simulation: SimulateResponse;
};

export type WhatIfEvent = {
  id: string;
  text: string;
  start_day?: number;
  end_day?: number;
  enabled: boolean;
};

export type WhatIfEventResult = {
  id: string;
  reasoning: string;
};

export type WhatIfInterpretation = {
  delta: {
    price_multiplier: number;
    p_multiplier: number;
    q_multiplier: number;
    competition_override: string | null;
    extra_marketing_events: { type: string; start_day: number; end_day?: number }[];
    reasoning: string;
  };
  per_card_reasoning: string[];
  fallback_used: boolean;
};

export type WhatIfDiff = {
  total_adopters_delta: number;
  total_adopters_pct: number;
  total_revenue_delta: number;
  total_revenue_pct: number;
  adoption_rate_delta: number;
};

export type WhatIfResponse = {
  baseline: SimulateResponse;
  whatif: SimulateResponse;
  diff: WhatIfDiff;
  interpretation: WhatIfInterpretation;
  event_results: WhatIfEventResult[];
};

export type WhatIfPreset = {
  label: string;
  text: string;
};

export type ErrorInfo = {
  message: string;
  type: "network" | "timeout" | "server" | "validation" | "unknown";
  retryable: boolean;
};

export type ChartColors = {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  scatterInactive: string;
};
