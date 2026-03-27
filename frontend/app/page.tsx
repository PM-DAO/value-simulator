"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { ReportPanel, captureAllCharts, type ChartCaptures } from "./report/ReportPanel";
import type {
  MarketSize, Target, Category, PriceModel, Competition, Period,
  SimulateRequest, AgentStateEntry, AgentForces, AgentSnapshot,
  FunnelSnapshotEntry, NetworkNode, NetworkData, RogersBreakdown,
  SimulateResponse, AutoResponse, WhatIfEvent, WhatIfEventResult,
  WhatIfInterpretation, WhatIfDiff, WhatIfResponse, WhatIfPreset,
  ErrorInfo, ChartColors,
} from "./types";

// ---------- Constants ----------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const FOOTER_CAVEATS = [
  {
    icon: "📢",
    title: "マーケティング・認知経路",
    body: "プロダクトが市場に存在し最低限の認知経路がある状態を前提としています。実際の市場では、マーケティング施策なしにユーザーが製品を発見することは極めて稀です。結果の絶対値よりも、拡散カーブの形状やパラメータ間の相対比較としてご活用ください。",
  },
  {
    icon: "🧮",
    title: "Bass拡散モデルの特性",
    body: "採用の拡散はBassモデル（p: イノベーション係数、q: 模倣係数）に基づいています。pが0より大きい限り、時間経過とともに一定の採用が発生します。これはモデルの構造的な性質であり、どんなプロダクトでも時間をかければ採用が進むように見えます。",
  },
  {
    icon: "🎯",
    title: "JTBDフィットスコア",
    body: "JTBDフィットスコアは、ターゲット層のデモグラフィクスとサービスカテゴリから算出されます。実際のプロダクト機能の充実度・品質・UXなどは反映されていません。同じカテゴリであれば、具体的なサービス内容に関わらず同様のフィットスコアになります。",
  },
  {
    icon: "👥",
    title: "エージェントの行動",
    body: "各エージェントはRogersの普及理論（イノベーター〜ラガード）に基づく行動特性を持ちます。ソーシャルネットワーク上の口コミ伝播はモデル化されていますが、SNSでのバイラル拡散やメディア露出による急激な認知拡大などは簡略化されています。",
  },
  {
    icon: "💰",
    title: "価格・競合の影響",
    body: "価格は主にファネル最終段階（検討→採用）のゲートとして機能します。「無料なら気軽に試す」といった初期段階への影響は限定的です。競合の影響は市場サイズの縮小と模倣係数の低下として簡易的にモデル化されています。",
  },
  {
    icon: "📊",
    title: "結果の活用方法",
    body: "このシミュレータは、市場採用の定量予測ツールではなく、定性的な意思決定支援ツールです。「パラメータを変えたときのカーブ変化」「ターゲット層による採用パターンの違い」など、相対的な比較や感度分析に最も適しています。",
  },
];

// ---------- Theme ----------

type ThemeMode = "light" | "dark" | "system";

function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");

  // Read saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem("vs_theme") as ThemeMode | null;
    if (saved === "light" || saved === "dark" || saved === "system") {
      setMode(saved);
    }
  }, []);

  const [isDark, setIsDark] = useState(false);

  // Apply class to <html> whenever mode changes
  useEffect(() => {
    const applyDark = (dark: boolean) => {
      document.documentElement.classList.toggle("dark", dark);
      setIsDark(dark);
    };

    if (mode === "dark") { applyDark(true); return; }
    if (mode === "light") { applyDark(false); return; }
    // system
    const mq = matchMedia("(prefers-color-scheme: dark)");
    applyDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => applyDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setTheme = useCallback((next: ThemeMode) => {
    setMode(next);
    localStorage.setItem("vs_theme", next);
  }, []);

  return { mode, setTheme, isDark };
}

function ThemeToggle({ mode, onChange }: { mode: ThemeMode; onChange: (m: ThemeMode) => void }) {
  const cycle = () => {
    const next: ThemeMode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    onChange(next);
  };

  const icon = mode === "light" ? (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ) : mode === "dark" ? (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ) : (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );

  const label = mode === "light" ? "ライト" : mode === "dark" ? "ダーク" : "システム";

  return (
    <button
      type="button"
      onClick={cycle}
      className="fixed bottom-4 left-4 z-50 flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 shadow-md hover:bg-zinc-50 transition-colors dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 safe-bottom"
      aria-label={`テーマ切替: ${label}`}
      title={`テーマ: ${label}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ---------- Chart colors (theme-aware) ----------

const CHART_COLORS_LIGHT = {
  grid: "#e4e4e7",       // zinc-200
  axis: "#71717a",       // zinc-500
  tooltipBg: "#ffffff",
  tooltipBorder: "#e4e4e7",
  scatterInactive: "#d1d5db",
} as const;

const CHART_COLORS_DARK = {
  grid: "#3f3f46",       // zinc-700
  axis: "#a1a1aa",       // zinc-400
  tooltipBg: "#18181b",  // zinc-900
  tooltipBorder: "#3f3f46",
  scatterInactive: "#52525b",
} as const;

// ---------- Canvas colors (theme-aware) ----------

const CANVAS_COLORS_LIGHT = {
  edgeSelected: "rgba(59,130,246,0.6)",
  edgeAdopted: "rgba(59,130,246,0.2)",
  edgeDimmed: "rgba(156,163,175,0.05)",
  edgeDefault: "rgba(156,163,175,0.15)",
  nodeInactive: "#d1d5db",
  selectionRing: "#2563eb",
} as const;

const CANVAS_COLORS_DARK = {
  edgeSelected: "rgba(96,165,250,0.6)",
  edgeAdopted: "rgba(96,165,250,0.3)",
  edgeDimmed: "rgba(161,161,170,0.05)",
  edgeDefault: "rgba(161,161,170,0.25)",
  nodeInactive: "#52525b",
  selectionRing: "#60a5fa",
} as const;

const ROGERS_COLORS = {
  innovator: "#ef4444",
  early_adopter: "#f97316",
  early_majority: "#eab308",
  late_majority: "#22c55e",
  laggard: "#6366f1",
} as const;

const ROGERS_LABELS: Record<string, string> = {
  innovator: "イノベーター",
  early_adopter: "アーリーアダプター",
  early_majority: "アーリーマジョリティ",
  late_majority: "レイトマジョリティ",
  laggard: "ラガード",
};

const ROGERS_KEYS = Object.keys(ROGERS_LABELS) as Array<keyof typeof ROGERS_LABELS>;

const TARGET_GROUPS: { group: string; options: { value: Target; label: string }[] }[] = [
  {
    group: "年代",
    options: [
      { value: "teens", label: "10代" },
      { value: "twenties", label: "20代" },
      { value: "thirties", label: "30代" },
      { value: "forties", label: "40代" },
      { value: "fifties", label: "50代" },
      { value: "sixties_plus", label: "60代以上" },
    ],
  },
  {
    group: "職業・立場",
    options: [
      { value: "student", label: "学生" },
      { value: "new_graduate", label: "新卒・第二新卒" },
      { value: "working_professional", label: "会社員" },
      { value: "freelancer", label: "フリーランス" },
      { value: "homemaker", label: "主婦・主夫" },
      { value: "retired", label: "リタイア層" },
    ],
  },
  {
    group: "世帯構成",
    options: [
      { value: "single", label: "単身" },
      { value: "couple", label: "夫婦・カップル" },
      { value: "parent_young_child", label: "子育て（未就学児）" },
      { value: "parent_school_child", label: "子育て（学童）" },
    ],
  },
  {
    group: "法人",
    options: [
      { value: "startup", label: "スタートアップ" },
      { value: "smb", label: "中小企業" },
      { value: "enterprise", label: "大企業" },
    ],
  },
];

const ALL_TARGET_OPTIONS = TARGET_GROUPS.flatMap((g) => g.options);
const TARGET_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ALL_TARGET_OPTIONS.map((o) => [o.value, o.label])
);

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "saas", label: "SaaS" },
  { value: "ec", label: "EC" },
  { value: "media", label: "メディア" },
  { value: "food", label: "フード" },
  { value: "mobility", label: "モビリティ" },
  { value: "healthcare", label: "ヘルスケア" },
  { value: "education", label: "教育" },
  { value: "entertainment", label: "エンタメ" },
  { value: "finance", label: "金融" },
];

const PRICE_MODEL_OPTIONS: { value: PriceModel; label: string }[] = [
  { value: "free", label: "無料" },
  { value: "freemium", label: "フリーミアム" },
  { value: "subscription", label: "サブスクリプション" },
  { value: "usage", label: "従量課金" },
  { value: "one_time", label: "買い切り" },
];

const COMPETITION_OPTIONS: { value: Competition; label: string }[] = [
  { value: "none", label: "なし" },
  { value: "weak", label: "弱い" },
  { value: "strong", label: "強い" },
];

const PERIOD_STEPS: Record<Period, number> = {
  "90days": 90,
  "1year": 365,
  "3years": 1095,
};

const PERIOD_LABELS: Record<Period, string> = {
  "90days": "90日間",
  "1year": "1年間",
  "3years": "3年間",
};

const GENDER_LABELS: Record<string, string> = {
  male: "男性",
  female: "女性",
};

const REGION_LABELS: Record<string, string> = {
  kanto: "関東",
  kansai: "関西",
  chubu: "中部",
  kyushu: "九州",
  tohoku: "東北",
  hokkaido: "北海道",
  chugoku: "中国",
  shikoku: "四国",
};

const INCOME_LEVEL_LABELS: Record<string, string> = {
  low: "低",
  middle: "中",
  high: "高",
};

const FUNNEL_COLORS: Record<number, string> = {
  0: "#94a3b8",  // UNAWARE - slate
  1: "#60a5fa",  // AWARE - blue
  2: "#a78bfa",  // INTEREST - violet
  3: "#f59e0b",  // CONSIDERATION - amber
  4: "#22c55e",  // ADOPTED - green
};

const FUNNEL_LABELS: Record<number, string> = {
  0: "未認知",
  1: "認知",
  2: "興味",
  3: "検討",
  4: "採用",
};

const FUNNEL_KEYS = ["unaware", "aware", "interest", "consideration", "adopted"] as const;

// ---------- Error Helpers ----------

function classifyError(err: unknown, status?: number): ErrorInfo {
  if (err instanceof TypeError && (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("Failed"))) {
    return {
      message: "サーバーに接続できません。バックエンドが起動しているか確認してください。",
      type: "network",
      retryable: true,
    };
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return {
      message: "リクエストがタイムアウトしました。時間をおいて再度お試しください。",
      type: "timeout",
      retryable: true,
    };
  }
  if (status && status >= 500) {
    return {
      message: `サーバーエラーが発生しました（${status}）。しばらくしてから再度お試しください。`,
      type: "server",
      retryable: true,
    };
  }
  if (status && status >= 400 && status < 500) {
    return {
      message: `入力内容に問題があります（${status}）。内容を確認してください。`,
      type: "validation",
      retryable: false,
    };
  }
  return {
    message: "予期しないエラーが発生しました。再度お試しください。",
    type: "unknown",
    retryable: true,
  };
}

// ---------- What-If Presets ----------

const WHATIF_PRESETS: WhatIfPreset[] = [
  { label: "競合値下げ", text: "競合他社が20%値下げした" },
  { label: "テレビCM", text: "全国ネットでテレビCMを1週間放映した" },
  { label: "SNS炎上", text: "SNSで悪評が拡散し口コミが悪化した" },
  { label: "インフルエンサー", text: "フォロワー100万人のインフルエンサーが紹介した" },
  { label: "価格改定(↑)", text: "月額料金を30%値上げした" },
  { label: "無料キャンペーン", text: "1ヶ月間の無料トライアルキャンペーンを実施した" },
  { label: "競合参入", text: "大手企業が類似サービスを開始した" },
  { label: "口コミ拡散", text: "SNSでバズって口コミが急拡散した" },
  { label: "規制強化", text: "業界に対する規制が強化された" },
  { label: "提携発表", text: "大手企業とのパートナーシップを発表した" },
];

// ---------- LocalStorage Helpers ----------

const STORAGE_KEYS = {
  detailedResult: "vs_detailed_result",
  autoResult: "vs_auto_result",
  whatifEvents: "vs_whatif_events",
  formState: "vs_form_state",
  lastRequest: "vs_last_request",
} as const;

type SavedFormState = {
  description: string;
  serviceName: string;
  price: number;
  marketSize: MarketSize;
  targets: Target[];
  category: Category;
  priceModel: PriceModel;
  competition: Competition;
  inferredParams: AutoResponse["inferred_params"] | null;
  showManualForm: boolean;
  showAdvanced: boolean;
};

function loadFromStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable -- silently ignore
  }
}

// ---------- Helper Components ----------

function SummaryCard({
  label,
  value,
  unit,
  accent,
  sub,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs sm:text-sm text-zinc-500">{label}</p>
      <p
        className="mt-1 text-lg sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100"
        style={accent ? { color: accent } : undefined}
      >
        {value}
        <span className="ml-1 text-xs sm:text-sm font-normal text-zinc-500">{unit}</span>
      </p>
      {sub && <p className="mt-0.5 text-[10px] sm:text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

function LoadingSpinner({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
      {message && (
        <p className="text-sm text-zinc-500 animate-pulse-text loading-dots">
          {message}
        </p>
      )}
    </div>
  );
}

function ErrorAlert({
  error,
  onRetry,
  onDismiss,
}: {
  error: ErrorInfo;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const iconByType: Record<ErrorInfo["type"], string> = {
    network: "接続",
    timeout: "タイムアウト",
    server: "サーバー",
    validation: "入力",
    unknown: "不明な",
  };

  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {iconByType[error.type]}エラー
          </p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            {error.message}
          </p>
          <div className="mt-3 flex gap-2">
            {error.retryable && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800 transition-colors"
              >
                再試行
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900 transition-colors"
              >
                閉じる
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ODIBadge({ score, label }: { score: number; label: string }) {
  const colorMap: Record<string, string> = {
    underserved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    served: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    overserved: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  const labelMap: Record<string, string> = {
    underserved: "大きなチャンス",
    served: "競合と同程度",
    overserved: "差別化が必要",
  };
  const descMap: Record<string, string> = {
    underserved: "顧客ニーズが満たされておらず、市場に大きな参入機会があります",
    served: "顧客ニーズはある程度満たされており、既存競合と同水準です",
    overserved: "既に十分な選択肢があり、強い差別化が必要です",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[label] ?? ""}`}
      title={descMap[label] ?? ""}
    >
      市場機会: {score.toFixed(1)} / 10 — {labelMap[label] ?? label}
    </span>
  );
}

function InputField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 transition-colors";

const PRICE_TICKS = [0, 1000, 5000, 10000, 30000, 50000, 100000];
const SLIDER_MAX = 1000;

function sliderToPrice(s: number): number {
  if (s <= 0) return 0;
  const ratio = s / SLIDER_MAX;
  const price = (Math.pow(10, ratio * 3) - 1) / 999 * 100000;
  return Math.min(100000, Math.max(0, Math.round(price / 100) * 100));
}

function priceToSlider(p: number): number {
  if (p <= 0) return 0;
  return Math.round(Math.log10(p / 100000 * 999 + 1) / 3 * SLIDER_MAX);
}

function formatPriceTick(t: number): string {
  if (t === 0) return "\u00a50";
  if (t >= 10000) return `${t / 10000}万`;
  return `${t / 1000}k`;
}

function PriceSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <input
        type="range"
        min={0}
        max={SLIDER_MAX}
        step={1}
        value={priceToSlider(value)}
        onChange={(e) => onChange(sliderToPrice(Number(e.target.value)))}
        disabled={disabled}
        aria-label="価格スライダー"
        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-600 bg-zinc-200 dark:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="relative h-4 text-[10px] text-zinc-400 dark:text-zinc-500">
        {PRICE_TICKS.map((t) => {
          const pct = (priceToSlider(t) / SLIDER_MAX) * 100;
          return (
            <span
              key={t}
              className="absolute -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {formatPriceTick(t)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Chart Helpers ----------
// API returns pre-scaled real-world numbers (agent-space × scale_factor)

function buildDailyChartData(result: SimulateResponse) {
  const dayLabels = result.day_labels;
  return result.daily_adoption.map((daily, i) => ({
    day: dayLabels?.[i] ?? i + 1,
    daily,
    cumulative: result.cumulative_adoption[i],
    revenue_daily: result.daily_revenue?.[i] ?? 0,
    revenue_cumulative: result.cumulative_revenue?.[i] ?? 0,
    innovator: result.rogers_breakdown?.innovator?.[i] ?? 0,
    early_adopter: result.rogers_breakdown?.early_adopter?.[i] ?? 0,
    early_majority: result.rogers_breakdown?.early_majority?.[i] ?? 0,
    late_majority: result.rogers_breakdown?.late_majority?.[i] ?? 0,
    laggard: result.rogers_breakdown?.laggard?.[i] ?? 0,
  }));
}

function buildAgeDistribution(
  adopted: AgentSnapshot[],
  notAdopted: AgentSnapshot[],
) {
  const bins = [
    "0-9",
    "10-19",
    "20-29",
    "30-39",
    "40-49",
    "50-59",
    "60-69",
    "70-79",
    "80+",
  ];
  const getBin = (age: number) => {
    if (age >= 80) return "80+";
    const idx = Math.floor(age / 10);
    return bins[idx] ?? "80+";
  };
  const counts: Record<
    string,
    { label: string; adopted: number; notAdopted: number }
  > = {};
  for (const b of bins)
    counts[b] = { label: b, adopted: 0, notAdopted: 0 };
  for (const a of adopted) counts[getBin(a.age)].adopted++;
  for (const a of notAdopted) counts[getBin(a.age)].notAdopted++;
  return bins.map((b) => counts[b]);
}

function buildIncomeDistribution(
  adopted: AgentSnapshot[],
  notAdopted: AgentSnapshot[],
) {
  const bins = [
    { label: "~200万", max: 200 },
    { label: "200-300万", max: 300 },
    { label: "300-400万", max: 400 },
    { label: "400-500万", max: 500 },
    { label: "500-600万", max: 600 },
    { label: "600万~", max: Infinity },
  ];
  const getBin = (income: number) => {
    for (const b of bins) if (income < b.max) return b.label;
    return bins[bins.length - 1].label;
  };
  const counts: Record<
    string,
    { label: string; adopted: number; notAdopted: number }
  > = {};
  for (const b of bins)
    counts[b.label] = { label: b.label, adopted: 0, notAdopted: 0 };
  for (const a of adopted) counts[getBin(a.income)].adopted++;
  for (const a of notAdopted) counts[getBin(a.income)].notAdopted++;
  return bins.map((b) => counts[b.label]);
}

// ---------- Dashboard Component ----------

function stepsToPeriodLabel(steps: number): string {
  if (steps <= 90) return "90日間";
  if (steps <= 365) return "1年間";
  return "3年間";
}

/** Section 1: Executive Summary — TAM, adopters, ODI at a glance */
function SummarySection({ result }: { result: SimulateResponse }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="推定TAM"
          value={(result.config.tam ?? 0).toLocaleString()}
          unit="人"
        />
        <SummaryCard
          label="総採用者数"
          value={result.summary.total_adopters.toLocaleString()}
          unit="人"
        />
        <SummaryCard
          label="最大日次採用数"
          value={result.summary.peak_daily.toLocaleString()}
          unit="人/日"
        />
        <SummaryCard
          label="採用率"
          value={result.summary.adoption_rate.toFixed(1)}
          unit="%"
        />
        <SummaryCard
          label="市場機会スコア"
          value={(result.odi_score ?? 0).toFixed(1)}
          unit="/ 10"
          accent={
            result.odi_label === "underserved"
              ? "#22c55e"
              : result.odi_label === "overserved"
                ? "#ef4444"
                : "#eab308"
          }
          sub={
            result.odi_label === "underserved"
              ? "大きなチャンス"
              : result.odi_label === "overserved"
                ? "差別化が必要"
                : "競合と同程度"
          }
        />
      </div>
      <div className="flex items-center gap-2">
        <ODIBadge score={result.odi_score ?? 0} label={result.odi_label ?? "served"} />
      </div>
    </div>
  );
}

/** Section 2: Diffusion Curves — S-curve, bell, Rogers, revenue */
function DiffusionCurvesSection({ result, chartColors }: { result: SimulateResponse; chartColors: ChartColors }) {
  const chartData = buildDailyChartData(result);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
      {/* Cumulative S-Curve */}
      <ChartCard title="累積採用者数（S字カーブ）" chartId="s-curve">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="day"
              label={{ value: "日数", position: "insideBottom", offset: -5, fill: chartColors.axis }}
              tick={{ fill: chartColors.axis }}
            />
            <YAxis tick={{ fill: chartColors.axis }} />
            <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }} />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              name="累積採用者数"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Daily Bell Curve */}
      <ChartCard title="日次新規採用者数（ベル型カーブ）" chartId="daily-bell">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="day"
              label={{ value: "日数", position: "insideBottom", offset: -5, fill: chartColors.axis }}
              tick={{ fill: chartColors.axis }}
            />
            <YAxis tick={{ fill: chartColors.axis }} />
            <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }} />
            <Area
              type="monotone"
              dataKey="daily"
              stroke="#7c3aed"
              fill="#7c3aed"
              fillOpacity={0.2}
              strokeWidth={2}
              name="新規採用者数"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Rogers Stacked Area */}
      <ChartCard title="ロジャーズカテゴリ別採用推移" chartId="rogers-breakdown">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="day"
              label={{ value: "日数", position: "insideBottom", offset: -5, fill: chartColors.axis }}
              tick={{ fill: chartColors.axis }}
            />
            <YAxis tick={{ fill: chartColors.axis }} />
            <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }} />
            <Legend
              formatter={(value) => ROGERS_LABELS[value as string] ?? value}
            />
            {(
              Object.keys(ROGERS_COLORS) as Array<keyof typeof ROGERS_COLORS>
            ).map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId="rogers"
                stroke={ROGERS_COLORS[key]}
                fill={ROGERS_COLORS[key]}
                fillOpacity={0.6}
                name={key}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Revenue Chart */}
      <ChartCard title="累積売上推移" chartId="revenue">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="day"
              label={{ value: "日数", position: "insideBottom", offset: -5, fill: chartColors.axis }}
              tick={{ fill: chartColors.axis }}
            />
            <YAxis tick={{ fill: chartColors.axis }} />
            <Tooltip
              contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }}
              formatter={(value) => [
                `${Number(value).toLocaleString()}円`,
                "累積売上（推計）",
              ]}
            />
            <Line
              type="monotone"
              dataKey="revenue_cumulative"
              stroke="#059669"
              strokeWidth={2}
              dot={false}
              name="累積売上"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

/** Section 4: Agent-level analysis — network graph + demographic distributions */
function AgentAnalysisSection({ result, chartColors, isDark }: { result: SimulateResponse; chartColors: ChartColors; isDark: boolean }) {
  const agents = result.agent_snapshot ?? [];
  const adoptedAgents = agents.filter((a) => a.adopted);
  const notAdoptedAgents = agents.filter((a) => !a.adopted);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Social Network Graph - full width */}
      {result.network && result.network.nodes.length > 0 && (
        <ChartCard title="ソーシャルグラフ（口コミ拡散ネットワーク）">
          <NetworkGraph
            network={result.network}
            numSteps={result.config.num_steps}
            agents={result.agent_snapshot ?? []}
            scaleFactor={result.config.scale_factor ?? 1000}
            isDark={isDark}
            serviceName={result.service_name}
          />
        </ChartCard>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ChartCard title="エージェント分布（年齢）" chartId="age-dist">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={buildAgeDistribution(adoptedAgents, notAdoptedAgents)}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="label" tick={{ fill: chartColors.axis }} />
              <YAxis tick={{ fill: chartColors.axis }} />
              <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }} />
              <Legend />
              <Bar name="採用済み" dataKey="adopted" fill="#2563eb" />
              <Bar name="未採用" dataKey="notAdopted" fill={chartColors.scatterInactive} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="エージェント分布（収入）" chartId="income-dist">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={buildIncomeDistribution(adoptedAgents, notAdoptedAgents)}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="label" tick={{ fill: chartColors.axis }} />
              <YAxis tick={{ fill: chartColors.axis }} />
              <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }} />
              <Legend />
              <Bar name="採用済み" dataKey="adopted" fill="#2563eb" />
              <Bar name="未採用" dataKey="notAdopted" fill={chartColors.scatterInactive} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  chartId,
  children,
}: {
  title: string;
  chartId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900" data-chart-id={chartId}>
      <h2 className="mb-3 sm:mb-4 text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ---------- Network Graph ----------

function NetworkGraph({
  network,
  numSteps,
  agents,
  scaleFactor,
  isDark,
  serviceName,
}: {
  network: NetworkData;
  numSteps: number;
  agents: AgentSnapshot[];
  scaleFactor: number;
  isDark: boolean;
  serviceName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentDay, setCurrentDay] = useState(numSteps);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Store pixel positions for hit-testing
  const nodePixelPos = useRef<Map<number, { cx: number; cy: number; r: number }>>(new Map());

  const nodeMap = useMemo(() => {
    const m = new Map<number, NetworkNode>();
    for (const n of network.nodes) m.set(n.id, n);
    return m;
  }, [network.nodes]);

  const agentMap = useMemo(() => {
    const m = new Map<number, AgentSnapshot>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  // Neighbor list per node
  const neighborMap = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const [u, v] of network.edges) {
      if (!m.has(u)) m.set(u, []);
      if (!m.has(v)) m.set(v, []);
      m.get(u)!.push(v);
      m.get(v)!.push(u);
    }
    return m;
  }, [network.edges]);

  // Compute bounds for coordinate mapping
  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of network.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const pad = 0.1;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [network.nodes]);

  const cc = isDark ? CANVAS_COLORS_DARK : CANVAS_COLORS_LIGHT;

  const draw = useCallback(
    (day: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }
      ctx.clearRect(0, 0, w, h);

      const mapX = (x: number) =>
        ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * (w - 40) + 20;
      const mapY = (y: number) =>
        ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * (h - 40) + 20;

      const selectedNeighbors = selectedNodeId !== null
        ? new Set(neighborMap.get(selectedNodeId) ?? [])
        : null;

      // Draw edges
      for (const [u, v] of network.edges) {
        const nu = nodeMap.get(u);
        const nv = nodeMap.get(v);
        if (!nu || !nv) continue;

        const uAdopted = nu.adopted_day !== null && nu.adopted_day <= day;
        const vAdopted = nv.adopted_day !== null && nv.adopted_day <= day;
        const isSelectedEdge = selectedNodeId !== null &&
          (u === selectedNodeId || v === selectedNodeId);

        if (isSelectedEdge) {
          ctx.strokeStyle = cc.edgeSelected;
          ctx.lineWidth = 1.5;
        } else if (uAdopted && vAdopted) {
          ctx.strokeStyle = cc.edgeAdopted;
          ctx.lineWidth = 0.8;
        } else {
          ctx.strokeStyle = selectedNodeId !== null ? cc.edgeDimmed : cc.edgeDefault;
          ctx.lineWidth = 0.5;
        }
        ctx.beginPath();
        ctx.moveTo(mapX(nu.x), mapY(nu.y));
        ctx.lineTo(mapX(nv.x), mapY(nv.y));
        ctx.stroke();
      }

      // Draw nodes
      const nodeCount = network.nodes.length;
      const baseRadius = nodeCount > 500 ? 2 : nodeCount > 100 ? 3 : 4;
      const pixelPos = new Map<number, { cx: number; cy: number; r: number }>();

      for (const node of network.nodes) {
        const adopted = node.adopted_day !== null && node.adopted_day <= day;
        const cx = mapX(node.x);
        const cy = mapY(node.y);
        const isSelected = node.id === selectedNodeId;
        const isNeighbor = selectedNeighbors?.has(node.id);
        const dimmed = selectedNodeId !== null && !isSelected && !isNeighbor;

        let r = adopted ? baseRadius + 1 : baseRadius;
        if (isSelected) r = baseRadius + 3;
        else if (isNeighbor) r = baseRadius + 1.5;

        pixelPos.set(node.id, { cx, cy, r: Math.max(r, baseRadius + 2) });

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (adopted) {
          ctx.fillStyle = ROGERS_COLORS[node.rogers_type as keyof typeof ROGERS_COLORS] || "#3b82f6";
          ctx.globalAlpha = dimmed ? 0.15 : 1.0;
        } else {
          ctx.fillStyle = cc.nodeInactive;
          ctx.globalAlpha = dimmed ? 0.1 : 0.5;
        }
        ctx.fill();

        // Selection ring
        if (isSelected) {
          ctx.globalAlpha = 1.0;
          ctx.strokeStyle = cc.selectionRing;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = 1.0;
      }
      nodePixelPos.current = pixelPos;
    },
    [network, nodeMap, bounds, selectedNodeId, neighborMap, cc]
  );

  useEffect(() => {
    draw(currentDay);
  }, [currentDay, draw]);

  // Animation playback
  useEffect(() => {
    if (isPlaying) {
      setCurrentDay(0);
      animRef.current = setInterval(() => {
        setCurrentDay((prev) => {
          if (prev >= numSteps) {
            setIsPlaying(false);
            return numSteps;
          }
          return prev + Math.max(1, Math.floor(numSteps / 120));
        });
      }, 50);
    }
    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [isPlaying, numSteps]);

  // Click handler for node selection
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Find closest node within hit radius
      let closest: number | null = null;
      let closestDist = Infinity;
      for (const [id, pos] of nodePixelPos.current) {
        const dx = x - pos.cx;
        const dy = y - pos.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hitRadius = Math.max(pos.r + 4, 8);
        if (dist < hitRadius && dist < closestDist) {
          closestDist = dist;
          closest = id;
        }
      }
      setSelectedNodeId((prev) => (prev === closest ? null : closest));
    },
    []
  );

  const adoptedAtDay = network.nodes.filter(
    (n) => n.adopted_day !== null && n.adopted_day <= currentDay
  ).length;

  const selectedAgent = selectedNodeId !== null ? agentMap.get(selectedNodeId) : null;
  const selectedNode = selectedNodeId !== null ? nodeMap.get(selectedNodeId) : null;
  const selectedNeighborIds = selectedNodeId !== null ? (neighborMap.get(selectedNodeId) ?? []) : [];

  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState(288); // default lg:w-72 = 288px
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const delta = dragStartX.current - e.clientX;
      const newWidth = Math.min(Math.max(dragStartWidth.current + delta, 200), 600);
      setPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelWidth]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 transition-colors"
          aria-label={isPlaying ? "一時停止" : "拡散アニメーション再生"}
        >
          {isPlaying ? "⏸ 停止" : "▶ 拡散を再生"}
        </button>
        <input
          type="range"
          min={0}
          max={numSteps}
          value={currentDay}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentDay(Number(e.target.value));
          }}
          className="flex-1 min-w-[120px]"
          aria-label="シミュレーション日数スライダー"
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          Day {currentDay} / {numSteps} — 採用: {Math.round(adoptedAtDay * scaleFactor).toLocaleString()}人
        </span>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Canvas */}
        <div className="flex-1 min-w-0">
          <canvas
            ref={canvasRef}
            className="w-full rounded border border-zinc-200 dark:border-zinc-700 cursor-pointer"
            style={{ height: "clamp(250px, 50vw, 400px)" }}
            onClick={handleCanvasClick}
          />
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            {Object.entries(ROGERS_LABELS).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: ROGERS_COLORS[key as keyof typeof ROGERS_COLORS] }}
                />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
              未採用
            </span>
          </div>
        </div>

        {/* Agent Profile Panel with draggable divider */}
        {selectedAgent && selectedNode && (
          <>
            {/* Drag handle */}
            <div
              className="hidden lg:flex items-center justify-center w-2 cursor-col-resize group shrink-0"
              onMouseDown={handleDragStart}
            >
              <div className="w-0.5 h-12 rounded-full bg-zinc-300 group-hover:bg-zinc-400 group-active:bg-blue-500 dark:bg-zinc-600 dark:group-hover:bg-zinc-500 dark:group-active:bg-blue-400 transition-colors" />
            </div>
            <div
              className="w-full shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50 text-sm animate-in overflow-y-auto resizable-panel"
              style={{ "--panel-width": `${panelWidth}px`, maxHeight: "clamp(300px, 60vh, 500px)" } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                Agent #{selectedAgent.id}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                aria-label="パネルを閉じる"
              >
                ✕
              </button>
            </div>

            {/* Status badge */}
            <div className="mb-3">
              {selectedNode.adopted_day !== null ? (
                <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  採用済み（Day {selectedNode.adopted_day}）
                </span>
              ) : (
                <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                  {FUNNEL_LABELS[selectedAgent.funnel_stage] ?? "未認知"}
                </span>
              )}
            </div>

            {/* Profile details */}
            <dl className="space-y-1.5 text-xs">
              <ProfileRow label="タイプ" value={ROGERS_LABELS[selectedAgent.rogers_type] ?? selectedAgent.rogers_type} color={(ROGERS_COLORS as Record<string, string>)[selectedAgent.rogers_type]} />
              <ProfileRow label="年齢" value={`${selectedAgent.age}歳`} />
              <ProfileRow label="性別" value={GENDER_LABELS[selectedAgent.gender] ?? selectedAgent.gender} />
              <ProfileRow label="地域" value={REGION_LABELS[selectedAgent.region] ?? selectedAgent.region} />
              <ProfileRow label="年収" value={`${selectedAgent.income.toLocaleString()}万円`} />
              <ProfileRow label="収入層" value={INCOME_LEVEL_LABELS[selectedAgent.income_level] ?? selectedAgent.income_level} />
              <ProfileRow label="価格感度" value={selectedAgent.price_sensitivity.toFixed(2)} />
              <ProfileRow label="認知度" value={`${(selectedAgent.awareness * 100).toFixed(1)}%`} />
              <ProfileRow label="JTBDフィット" value={`${(selectedAgent.jtbd_fit * 100).toFixed(0)}%`}
                color={selectedAgent.jtbd_fit > 0.6 ? "#22c55e" : selectedAgent.jtbd_fit > 0.35 ? "#f59e0b" : "#9ca3af"} />
            </dl>

            {/* Forces of Progress */}
            {selectedAgent.forces && (
              <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Forces of Progress</p>
                <ForcesDisplay forces={selectedAgent.forces} compact />
              </div>
            )}

            {/* Behavioral explanation */}
            <AgentExplanation agent={selectedAgent} serviceName={serviceName} />

            {/* Neighbor Forces comparison */}
            <NeighborComparison
              selected={selectedAgent}
              neighbors={selectedNeighborIds.map((id) => agentMap.get(id)).filter((a): a is AgentSnapshot => a !== undefined)}
            />

            {/* Neighbors */}
            <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                隣接エージェント（{selectedNeighborIds.length}人）
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedNeighborIds.slice(0, 20).map((nid) => {
                  const nn = nodeMap.get(nid);
                  const adopted = nn && nn.adopted_day !== null && nn.adopted_day <= currentDay;
                  return (
                    <button
                      key={nid}
                      type="button"
                      onClick={() => setSelectedNodeId(nid)}
                      className="rounded px-1.5 py-0.5 text-[10px] border transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      style={{
                        borderColor: adopted ? ((ROGERS_COLORS as Record<string, string>)[nn?.rogers_type ?? ""] ?? "#3b82f6") : "#d1d5db",
                        color: adopted ? ((ROGERS_COLORS as Record<string, string>)[nn?.rogers_type ?? ""] ?? "#3b82f6") : "#9ca3af",
                      }}
                    >
                      #{nid}
                    </button>
                  );
                })}
                {selectedNeighborIds.length > 20 && (
                  <span className="text-[10px] text-zinc-400 self-center">
                    +{selectedNeighborIds.length - 20}
                  </span>
                )}
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProfileRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-900 dark:text-zinc-100" style={color ? { color } : undefined}>
        {value}
      </dd>
    </div>
  );
}

// ---------- Forces & Explanation Components ----------

const FORCES_BARS = [
  { key: "f1_push" as const, label: "F1 Push（不満）", color: "#f97316" },
  { key: "f2_pull" as const, label: "F2 Pull（引力）", color: "#22c55e" },
  { key: "f3_anxiety" as const, label: "F3 Anxiety（不安）", color: "#ef4444" },
  { key: "f4_habit" as const, label: "F4 Habit（慣性）", color: "#8b5cf6" },
] as const;

function ForcesDisplay({ forces, compact = false }: { forces: AgentForces; compact?: boolean }) {
  const barData = FORCES_BARS.map(({ key, label, color }) => ({
    name: label,
    value: Math.round(forces[key] * 100),
    color,
  }));
  const barHeight = compact ? 90 : 140;
  const switchColor = forces.switch_score > 0.6 ? "#22c55e" : forces.switch_score > 0.35 ? "#f59e0b" : "#ef4444";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">スイッチスコア</span>
        <span className="text-sm font-bold" style={{ color: switchColor }}>
          {(forces.switch_score * 100).toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 mb-3">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${forces.switch_score * 100}%`, backgroundColor: switchColor }}
        />
      </div>
      <ResponsiveContainer width="100%" height={barHeight}>
        <BarChart layout="vertical" data={barData} margin={{ top: 0, right: 24, bottom: 0, left: compact ? 80 : 100 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: compact ? 9 : 10 }} width={compact ? 78 : 98} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]}>
            {barData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <dl className="mt-2 space-y-1 text-xs">
        <ProfileRow label="紹介可能性" value={`${(forces.referral_likelihood * 100).toFixed(0)}%`} />
        <ProfileRow label="口コミ感情価" value={`${(forces.word_of_mouth_valence * 100).toFixed(0)}%`} />
      </dl>
    </div>
  );
}

function generateRuleBasedExplanation(agent: AgentSnapshot): string {
  const f = agent.forces;
  if (!f) return "フォース情報が利用できません。";

  const parts: string[] = [];

  if (f.switch_score > 0.6) {
    parts.push(`スイッチスコアが${(f.switch_score * 100).toFixed(0)}%と高く、採用する可能性が高いプロファイルです。`);
  } else if (f.switch_score > 0.35) {
    parts.push(`スイッチスコアは${(f.switch_score * 100).toFixed(0)}%と中程度で、採用には追加のきっかけが必要です。`);
  } else {
    parts.push(`スイッチスコアが${(f.switch_score * 100).toFixed(0)}%と低く、現状維持を好む傾向があります。`);
  }

  if (f.f2_pull > f.f1_push && f.f2_pull > 0.55) {
    parts.push(`新サービスへの引力（Pull: ${(f.f2_pull * 100).toFixed(0)}%）が採用の主な動機です。`);
  } else if (f.f1_push > 0.55) {
    parts.push(`現状への不満（Push: ${(f.f1_push * 100).toFixed(0)}%）が変化の原動力です。`);
  }

  if (f.f3_anxiety > f.f4_habit && f.f3_anxiety > 0.5) {
    parts.push(`不安・リスク（Anxiety: ${(f.f3_anxiety * 100).toFixed(0)}%）が採用の主な障壁です。`);
  } else if (f.f4_habit > 0.5) {
    parts.push(`習慣・現状維持バイアス（Habit: ${(f.f4_habit * 100).toFixed(0)}%）が乗り換えを抑制しています。`);
  }

  if (agent.adopted) {
    if (f.referral_likelihood > 0.5) {
      parts.push(`採用後の紹介可能性が高く（${(f.referral_likelihood * 100).toFixed(0)}%）、口コミ拡散の起点になりえます。`);
    } else if (f.word_of_mouth_valence < 0.45) {
      parts.push(`口コミの感情価が低め（${(f.word_of_mouth_valence * 100).toFixed(0)}%）で、ネガティブな評判リスクがあります。`);
    }
  }

  if (agent.jtbd_fit > 0.7) {
    parts.push(`JTBDフィットが高く（${(agent.jtbd_fit * 100).toFixed(0)}%）、ニーズ適合度が良好です。`);
  } else if (agent.jtbd_fit < 0.4) {
    parts.push(`JTBDフィットが低く（${(agent.jtbd_fit * 100).toFixed(0)}%）、ニーズ適合度に課題があります。`);
  }

  return parts.join(" ");
}

function NeighborComparison({
  selected,
  neighbors,
}: {
  selected: AgentSnapshot;
  neighbors: AgentSnapshot[];
}) {
  if (!selected.forces || neighbors.length === 0) return null;
  const visible = neighbors.filter((n) => n.forces).slice(0, 5);
  if (visible.length === 0) return null;

  const cols: { key: keyof AgentForces; label: string; isResistance: boolean }[] = [
    { key: "f1_push", label: "F1", isResistance: false },
    { key: "f2_pull", label: "F2", isResistance: false },
    { key: "f3_anxiety", label: "F3", isResistance: true },
    { key: "f4_habit", label: "F4", isResistance: true },
    { key: "switch_score", label: "Switch", isResistance: false },
  ];

  const cellColor = (value: number, isResistance: boolean) => {
    const isHigh = value > 0.55;
    if (isResistance) return isHigh ? "text-red-500 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400";
    return isHigh ? "text-green-600 dark:text-green-400" : "text-zinc-500 dark:text-zinc-400";
  };

  return (
    <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">隣接エージェントとのForces比較</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="text-left text-zinc-400 pr-2 font-medium">Agent</th>
              {cols.map((c) => (
                <th key={c.key} className="text-center text-zinc-400 px-1 font-medium">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="pr-2 text-blue-600 dark:text-blue-400 font-medium py-1">#{selected.id} (自)</td>
              {cols.map((c) => (
                <td key={c.key} className={`text-center px-1 font-medium ${cellColor(selected.forces![c.key], c.isResistance)}`}>
                  {(selected.forces![c.key] * 100).toFixed(0)}
                </td>
              ))}
            </tr>
            {visible.map((n) => (
              <tr key={n.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <td className="pr-2 text-zinc-500 py-1">#{n.id}{n.adopted ? " ✓" : ""}</td>
                {cols.map((c) => (
                  <td key={c.key} className={`text-center px-1 ${cellColor(n.forces![c.key], c.isResistance)}`}>
                    {(n.forces![c.key] * 100).toFixed(0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentExplanation({ agent, serviceName }: { agent: AgentSnapshot; serviceName: string }) {
  const ruleText = generateRuleBasedExplanation(agent);
  const [llmText, setLlmText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLlm, setShowLlm] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setLlmText(null);
    setShowLlm(false);
    setError(null);
    setLoading(false);
  }, [agent.id]);

  const fetchLlmExplanation = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/agent/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          agent_id: agent.id,
          rogers_type: agent.rogers_type,
          age: agent.age,
          income_level: agent.income_level,
          adopted: agent.adopted,
          forces: agent.forces,
          jtbd_fit: agent.jtbd_fit,
          service_name: serviceName,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (typeof data.explanation !== "string") throw new Error("unexpected response");
      setLlmText(data.explanation);
      setShowLlm(true);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("LLM説明の生成に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [agent, serviceName]);

  const displayed = showLlm && llmText ? llmText : ruleText;

  return (
    <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          行動説明{" "}
          {showLlm ? (
            <span className="text-[9px] text-blue-500">AI</span>
          ) : (
            <span className="text-[9px] text-zinc-400">ルールベース</span>
          )}
        </p>
        <div className="flex gap-1">
          {llmText && (
            <button
              type="button"
              onClick={() => setShowLlm(!showLlm)}
              className="text-[9px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 transition-colors"
            >
              {showLlm ? "ルールベースへ" : "AIへ"}
            </button>
          )}
          {!llmText && (
            <button
              type="button"
              onClick={fetchLlmExplanation}
              disabled={loading}
              className="text-[9px] text-blue-600 dark:text-blue-400 hover:text-blue-700 px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? "生成中..." : "詳細説明"}
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">{displayed}</p>
      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ---------- Unified Simulation Form ----------

const CATEGORY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label])
);

const COMPETITION_LABEL_MAP: Record<string, string> = Object.fromEntries(
  COMPETITION_OPTIONS.map((o) => [o.value, o.label])
);

function SimulationForm({
  onResult,
  onRequestCapture,
  onLoadingChange,
}: {
  onResult: (r: SimulateResponse) => void;
  onRequestCapture?: (req: SimulateRequest) => void;
  onLoadingChange?: (loading: boolean) => void;
}) {
  // AI inference state
  const [description, setDescription] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Restore API key from sessionStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("vs_api_key");
      if (saved) setApiKey(saved);
    }
  }, []);

  // Save API key to sessionStorage when changed
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (apiKey.trim()) {
        sessionStorage.setItem("vs_api_key", apiKey.trim());
      } else {
        sessionStorage.removeItem("vs_api_key");
      }
    }
  }, [apiKey]);
  const [inferredParams, setInferredParams] = useState<AutoResponse["inferred_params"] | null>(null);

  // Simulation parameters (prefilled by AI, overridable by user)
  const [serviceName, setServiceName] = useState("");
  const [price, setPrice] = useState(1000);
  const [marketSize, setMarketSize] = useState<MarketSize>("medium");
  const [targets, setTargets] = useState<Target[]>([]);
  const [category, setCategory] = useState<Category>("saas");
  const [priceModel, setPriceModel] = useState<PriceModel>("subscription");
  const [competition, setCompetition] = useState<Competition>("none");
  const period: Period = "3years";

  // Simulation run state
  const [simLoading, setSimLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  // Restore saved form state from localStorage after hydration
  useEffect(() => {
    const savedForm = loadFromStorage<SavedFormState>(STORAGE_KEYS.formState);
    if (savedForm) {
      if (savedForm.description) setDescription(savedForm.description);
      if (savedForm.inferredParams) setInferredParams(savedForm.inferredParams);
      if (savedForm.serviceName) setServiceName(savedForm.serviceName);
      if (savedForm.price != null) setPrice(savedForm.price);
      if (savedForm.marketSize) setMarketSize(savedForm.marketSize);
      if (savedForm.targets) setTargets(savedForm.targets);
      if (savedForm.category) setCategory(savedForm.category);
      if (savedForm.priceModel) setPriceModel(savedForm.priceModel);
      if (savedForm.competition) setCompetition(savedForm.competition);
      if (savedForm.showAdvanced) setShowAdvanced(savedForm.showAdvanced);
      if (savedForm.showManualForm) setShowManualForm(savedForm.showManualForm);
    }
  }, []);

  // For retry
  const lastActionRef = useRef<(() => void) | null>(null);

  const isLoading = aiLoading || simLoading;

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  // Persist form state to localStorage
  useEffect(() => {
    const state: SavedFormState = {
      description, serviceName, price, marketSize, targets,
      category, priceModel, competition, inferredParams,
      showManualForm, showAdvanced,
    };
    saveToStorage(STORAGE_KEYS.formState, state);
  }, [description, serviceName, price, marketSize, targets, category, priceModel, competition, inferredParams, showManualForm, showAdvanced]);

  const toggleTarget = (t: Target) => {
    setTargets((prev) =>
      prev.includes(t) ? prev.filter((v) => v !== t) : [...prev, t]
    );
  };

  // Step 1: AI inference
  const handleAiInfer = useCallback(async () => {
    if (!description.trim()) {
      setErrorInfo({
        message: "サービスの説明を入力してください",
        type: "validation",
        retryable: false,
      });
      return;
    }
    setErrorInfo(null);
    setAiLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulate/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          period,
          market_size: marketSize,
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status >= 500) {
          setErrorInfo(classifyError(null, res.status));
        } else {
          setErrorInfo({
            message: `エラー: ${res.status} - ${text}`,
            type: "server",
            retryable: res.status >= 500,
          });
        }
        setShowManualForm(true);
        return;
      }
      const data: AutoResponse = await res.json();
      setInferredParams(data.inferred_params);

      // Prefill form with inferred params
      const firstSentence = description.split(/[。、\n]/)[0];
      setServiceName(firstSentence.slice(0, 50));
      if (data.inferred_params.suggested_price != null) {
        setPrice(Math.min(100000, Math.max(0, data.inferred_params.suggested_price)));
      }
      if (data.inferred_params.category) {
        const cat = data.inferred_params.category as Category;
        if (CATEGORY_OPTIONS.some((o) => o.value === cat)) setCategory(cat);
      }
      if (data.inferred_params.competition) {
        const comp = data.inferred_params.competition as Competition;
        if (COMPETITION_OPTIONS.some((o) => o.value === comp)) setCompetition(comp);
      }
      if (data.inferred_params.target) {
        const raw = data.inferred_params.target;
        const arr = Array.isArray(raw) ? raw : [raw];
        const valid = arr.filter((t): t is Target =>
          ALL_TARGET_OPTIONS.some((o) => o.value === t)
        );
        if (valid.length > 0) setTargets(valid);
      }

      // Also run simulation immediately with AI-inferred result
      if (data.simulation) {
        onResult(data.simulation);
        // Capture request for What-If
        if (onRequestCapture && data.simulation.config) {
          onRequestCapture({
            service_name: firstSentence.slice(0, 50),
            price: data.inferred_params.suggested_price ?? price,
            market_size: marketSize,
            description: description,
            category: (data.inferred_params.category as Category) ?? category,
            price_model: priceModel,
            competition: (data.inferred_params.competition as Competition) ?? competition,
            period,
            target: targets.length > 0 ? targets : undefined,
            tam: data.inferred_params.tam_estimate ?? data.simulation.config.tam ?? 100_000,
          });
        }
      }
      saveToStorage(STORAGE_KEYS.autoResult, data);
    } catch (err) {
      setErrorInfo(classifyError(err));
      setShowManualForm(true);
    } finally {
      setAiLoading(false);
    }
  }, [description, period, marketSize, onResult, onRequestCapture, price, category, priceModel, competition, targets]);

  // Step 2: Run simulation with (possibly overridden) parameters
  const handleSimulate = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inferredParams?.tam_estimate) {
      setErrorInfo({
        message: "まずAI分析を実行してください",
        type: "validation",
        retryable: false,
      });
      return;
    }
    setErrorInfo(null);
    setSimLoading(true);
    try {
      const body: SimulateRequest = {
        service_name: serviceName,
        price,
        market_size: marketSize,
        category,
        price_model: priceModel,
        competition,
        period,
        tam: inferredParams.tam_estimate,
      };
      if (description) body.description = description;
      if (targets.length > 0) body.target = targets;

      const res = await fetch(`${API_BASE}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status >= 500) {
          setErrorInfo(classifyError(null, res.status));
        } else {
          setErrorInfo({
            message: `エラー: ${res.status} - ${text}`,
            type: "validation",
            retryable: false,
          });
        }
        return;
      }
      const data: SimulateResponse = await res.json();
      onResult(data);
      onRequestCapture?.(body);
    } catch (err) {
      setErrorInfo(classifyError(err));
    } finally {
      setSimLoading(false);
    }
  }, [serviceName, price, marketSize, category, priceModel, competition, period, description, targets, inferredParams, onResult]);

  // Keep lastActionRef updated to avoid stale closures
  useEffect(() => {
    lastActionRef.current = () => handleSimulate();
  }, [handleSimulate]);

  const handleRetry = useCallback(() => {
    if (lastActionRef.current) {
      lastActionRef.current();
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* API Key Input */}
      <InputField label="Anthropic APIキー（任意）" htmlFor="api-key-input">
        <input
          id="api-key-input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          disabled={isLoading}
          className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
        />
        <p className="mt-1 text-xs text-zinc-400">
          未入力の場合はデフォルト設定でシミュレーションを実行します
        </p>
      </InputField>

      {/* Step 1: AI Analysis */}
      <InputField label="サービスのアイデアを説明してください" htmlFor="service-description">
        <textarea
          id="service-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例: 通勤時間を有効活用するオーディオブックアプリ。月額980円で聴き放題。忙しいビジネスパーソン向け。"
          maxLength={1000}
          rows={4}
          disabled={isLoading}
          aria-describedby="description-hint"
          className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
        />
        <p id="description-hint" className="mt-1 text-xs text-zinc-400">
          {description.length}/1,000文字
        </p>
      </InputField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InputField label="シミュレーション精度" htmlFor="market-size-select">
          <select
            id="market-size-select"
            value={marketSize}
            onChange={(e) => setMarketSize(e.target.value as MarketSize)}
            disabled={isLoading}
            className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <option value="small">簡易（500エージェント）</option>
            <option value="medium">標準（1,000エージェント）</option>
            <option value="large">高精度（5,000エージェント）</option>
          </select>
        </InputField>
      </div>

      <button
        type="button"
        onClick={handleAiInfer}
        disabled={isLoading}
        aria-busy={aiLoading}
        className="w-full rounded-md bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {aiLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            AI分析中
          </span>
        ) : inferredParams ? "AIで再分析" : "AIで分析"}
      </button>

      {aiLoading && <LoadingSpinner message="AIがサービスを分析中" />}

      {/* AI Inference Result */}
      {inferredParams && !aiLoading && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950">
          <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-3">
            AI推論結果
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="col-span-1 sm:col-span-2">
              <span className="text-purple-600 dark:text-purple-400">ジョブ:</span>{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {Array.isArray(inferredParams.jobs)
                  ? inferredParams.jobs.map((j) => j.statement).join("、")
                  : inferredParams.jobs}
              </span>
            </div>
            <div>
              <span className="text-purple-600 dark:text-purple-400">ターゲット:</span>{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {Array.isArray(inferredParams.target)
                  ? inferredParams.target.map((t: string) => TARGET_LABEL_MAP[t] || t).join("、")
                  : TARGET_LABEL_MAP[inferredParams.target] || inferredParams.target}
              </span>
            </div>
            <div>
              <span className="text-purple-600 dark:text-purple-400">カテゴリ:</span>{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {CATEGORY_LABEL_MAP[inferredParams.category ?? ""] || inferredParams.category}
              </span>
            </div>
            <div>
              <span className="text-purple-600 dark:text-purple-400">推奨価格:</span>{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {(inferredParams.suggested_price ?? 0).toLocaleString()}円
              </span>
            </div>
            <div>
              <span className="text-purple-600 dark:text-purple-400">競合:</span>{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {COMPETITION_LABEL_MAP[inferredParams.competition ?? ""] || inferredParams.competition}
              </span>
            </div>
          </div>
          {inferredParams.reasoning && (
            <div className="mt-3 text-sm">
              <span className="text-purple-600 dark:text-purple-400">推論理由:</span>
              <p className="mt-1 text-zinc-700 dark:text-zinc-300">{inferredParams.reasoning}</p>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Parameter override form */}
      {(inferredParams || showManualForm) && !aiLoading && (
        <form onSubmit={handleSimulate} className="space-y-4">
          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4">
            {/* Always visible: service name, price, market size */}
            <div className="space-y-4">
              <InputField label="サービス名" htmlFor="service-name">
                <input
                  id="service-name"
                  type="text"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="例: StreamFit"
                  maxLength={100}
                  required
                  disabled={isLoading}
                  aria-label="サービス名"
                  className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                />
              </InputField>

              <InputField label={`想定価格（税込月額）: \u00a5${price.toLocaleString()}`}>
                <PriceSlider value={price} onChange={setPrice} disabled={isLoading} />
              </InputField>

              <InputField label="シミュレーション精度" htmlFor="market-size-override">
                <select
                  id="market-size-override"
                  value={marketSize}
                  onChange={(e) => setMarketSize(e.target.value as MarketSize)}
                  disabled={isLoading}
                  className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <option value="small">小（500エージェント）</option>
                  <option value="medium">中（1,000エージェント）</option>
                  <option value="large">大（10,000エージェント）</option>
                </select>
              </InputField>
            </div>

            {/* Advanced settings toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              disabled={isLoading}
              className="mt-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors disabled:opacity-50"
            >
              <svg
                className={`h-4 w-4 transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              詳細設定
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                <InputField label="ターゲットユーザー（複数選択可）">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 max-h-56 overflow-y-auto rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    {TARGET_GROUPS.map((g) => (
                      <div key={g.group} className="col-span-1 sm:col-span-2 mb-1">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mt-1 mb-0.5">
                          {g.group}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                          {g.options.map((o) => (
                            <label
                              key={o.value}
                              className="flex items-center gap-1.5 cursor-pointer text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
                            >
                              <input
                                type="checkbox"
                                checked={targets.includes(o.value)}
                                onChange={() => toggleTarget(o.value)}
                                disabled={isLoading}
                                className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
                              />
                              {o.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </InputField>

                <InputField label="カテゴリ" htmlFor="category-select">
                  <select
                    id="category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                    disabled={isLoading}
                    className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </InputField>

                <InputField label="価格モデル" htmlFor="price-model-select">
                  <select
                    id="price-model-select"
                    value={priceModel}
                    onChange={(e) => setPriceModel(e.target.value as PriceModel)}
                    disabled={isLoading}
                    className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {PRICE_MODEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </InputField>

                <InputField label="競合の存在" htmlFor="competition-select">
                  <select
                    id="competition-select"
                    value={competition}
                    onChange={(e) => setCompetition(e.target.value as Competition)}
                    disabled={isLoading}
                    className={`${inputClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {COMPETITION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </InputField>

              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            aria-busy={simLoading}
            className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {simLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                シミュレーション実行中
              </span>
            ) : inferredParams ? "パラメータを変更して再実行" : "シミュレーション実行"}
          </button>
        </form>
      )}

      {simLoading && <LoadingSpinner message="シミュレーション実行中" />}

      {errorInfo && (
        <ErrorAlert
          error={errorInfo}
          onRetry={errorInfo.retryable ? handleRetry : undefined}
          onDismiss={() => setErrorInfo(null)}
        />
      )}
    </div>
  );
}

// ---------- Persona God's View ----------

function FunnelBadge({ stage }: { stage: number }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: (FUNNEL_COLORS[stage] ?? "#6b7280") + "20",
        color: FUNNEL_COLORS[stage] ?? "#6b7280",
      }}
    >
      {FUNNEL_LABELS[stage] ?? `Stage ${stage}`}
    </span>
  );
}

function FunnelStackBar({ distribution, total }: { distribution: Record<string, number>; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex h-6 w-full rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
      {FUNNEL_KEYS.map((key, i) => {
        const count = distribution[key] ?? 0;
        const pct = (count / total) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={key}
            className="relative group flex items-center justify-center text-[10px] font-medium text-white transition-all"
            style={{ width: `${pct}%`, backgroundColor: FUNNEL_COLORS[i] }}
            title={`${FUNNEL_LABELS[i]}: ${count.toLocaleString()}人 (${pct.toFixed(1)}%)`}
          >
            {pct > 8 && <span>{count.toLocaleString()}</span>}
          </div>
        );
      })}
    </div>
  );
}

function PersonaTab({ result, chartColors }: { result: SimulateResponse | null; chartColors: ChartColors }) {
  const numSteps = result?.config?.num_steps ?? 90;
  const sf = result?.config?.scale_factor ?? 1;
  const [currentDay, setCurrentDay] = useState(numSteps);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(100); // ms per day
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset currentDay when result changes
  useEffect(() => {
    setCurrentDay(numSteps);
  }, [numSteps]);

  // Play/pause timer
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentDay((prev) => {
          if (prev >= numSteps) {
            setIsPlaying(false);
            return numSteps;
          }
          return prev + 1;
        });
      }, playSpeed);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playSpeed, numSteps]);

  // Compute agents' state at currentDay using state_history + adopted_day
  const agentsAtDay = useMemo(() => {
    if (!result?.agent_snapshot) return [];

    return result.agent_snapshot.map((agent) => {
      const adoptedAtDay = agent.adopted_day !== null && agent.adopted_day <= currentDay;

      // Derive funnel_stage from state_history (find latest entry <= currentDay)
      let stageAtDay = 0;
      if (agent.state_history?.length) {
        for (let j = agent.state_history.length - 1; j >= 0; j--) {
          if (agent.state_history[j].day <= currentDay) {
            stageAtDay = agent.state_history[j].funnel_stage;
            break;
          }
        }
      } else {
        stageAtDay = adoptedAtDay ? 4 : 0;
      }

      return {
        ...agent,
        adopted: adoptedAtDay,
        adopted_day: adoptedAtDay ? agent.adopted_day : null,
        funnel_stage: stageAtDay,
        awareness: stageAtDay / 4.0,
      };
    });
  }, [result, currentDay]);

  if (!result || !result.agent_snapshot?.length) {
    return null;
  }

  const agents = agentsAtDay;

  // Stats at current day
  const funnelDist: Record<string, number> = { unaware: 0, aware: 0, interest: 0, consideration: 0, adopted: 0 };
  for (const a of agents) {
    const key = FUNNEL_KEYS[a.funnel_stage] ?? "unaware";
    funnelDist[key]++;
  }
  const newAdoptersToday = agents.filter((a) => a.adopted_day === currentDay).length;

  // Segment-level funnel analysis by Rogers type
  const segmentAnalysis = useMemo(() => {
    return ROGERS_KEYS.map((rogersType) => {
      const segAgents = agents.filter((a) => a.rogers_type === rogersType);
      const total = segAgents.length;
      if (total === 0) return null;
      const dist: Record<string, number> = { unaware: 0, aware: 0, interest: 0, consideration: 0, adopted: 0 };
      for (const a of segAgents) { dist[FUNNEL_KEYS[a.funnel_stage] ?? "unaware"]++; }
      const adoptionRate = total > 0 ? dist.adopted / total : 0;
      const adoptedAgents = segAgents.filter((a) => a.adopted_day !== null);
      const avgAdoptionDay = adoptedAgents.length > 0 ? adoptedAgents.reduce((s, a) => s + (a.adopted_day ?? 0), 0) / adoptedAgents.length : null;
      const considerationRate = total > 0 ? dist.consideration / total : 0;
      const awarenessRate = total > 0 ? (total - dist.unaware) / total : 0;
      const insights: string[] = [];
      if (adoptionRate > 0.5) insights.push(`採用率${(adoptionRate * 100).toFixed(0)}%と高く、製品との親和性が高い`);
      else if (adoptionRate > 0.2) insights.push(`採用率${(adoptionRate * 100).toFixed(0)}%。まだ伸びしろがある`);
      else if (adoptionRate > 0) insights.push(`採用率${(adoptionRate * 100).toFixed(0)}%と低い。価格やメッセージングの見直しが必要か`);
      else if (awarenessRate > 0.3) insights.push(`認知はあるが採用に至っていない。検討フェーズでの離脱要因を分析すべき`);
      else insights.push(`認知率${(awarenessRate * 100).toFixed(0)}%。リーチが不足している可能性`);
      if (considerationRate > 0.15 && adoptionRate < 0.1) insights.push("検討中が多いが採用が少ない → 価格・不安要因がボトルネックの可能性");
      if (avgAdoptionDay !== null && avgAdoptionDay < numSteps * 0.3) insights.push(`平均採用日がDay ${Math.round(avgAdoptionDay)}と早期。口コミの起点になりうる`);
      return { rogersType, label: ROGERS_LABELS[rogersType] ?? rogersType, color: ROGERS_COLORS[rogersType as keyof typeof ROGERS_COLORS] ?? "#6b7280", total, dist, adoptionRate, avgAdoptionDay, considerationRate, awarenessRate, insights };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [agents, numSteps]);

  // Per-segment adoption rate time series
  const segmentAdoptionTimeSeries = useMemo(() => {
    if (!result?.agent_snapshot?.length) return [];
    const daySet = new Set<number>();
    for (const agent of result.agent_snapshot) {
      if (agent.state_history) for (const entry of agent.state_history) daySet.add(entry.day);
    }
    const days = [...daySet].sort((a, b) => a - b);
    if (days.length === 0) return [];
    return days.map((day) => {
      const row: Record<string, number | string> = { day };
      for (const rogersType of ROGERS_KEYS) {
        const segAgents = result.agent_snapshot!.filter((a) => a.rogers_type === rogersType);
        let adoptedCount = 0;
        for (const agent of segAgents) {
          if (agent.adopted_day !== null && agent.adopted_day <= day) { adoptedCount++; }
          else if (agent.state_history?.length) {
            for (let j = agent.state_history.length - 1; j >= 0; j--) {
              if (agent.state_history[j].day <= day) { if (agent.state_history[j].funnel_stage === 4) adoptedCount++; break; }
            }
          }
        }
        row[rogersType] = segAgents.length > 0 ? (adoptedCount / segAgents.length) * 100 : 0;
      }
      return row;
    });
  }, [result]);

  const handlePlay = () => {
    if (currentDay >= numSteps) setCurrentDay(1);
    setIsPlaying(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Timeline Controller */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3 sm:gap-4 mb-3">
          <button
            onClick={isPlaying ? () => setIsPlaying(false) : handlePlay}
            aria-label={isPlaying ? "一時停止" : "再生"}
            className="flex items-center justify-center h-9 w-9 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="2" y="1" width="4" height="12" rx="1" /><rect x="8" y="1" width="4" height="12" rx="1" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><polygon points="2,0 14,7 2,14" /></svg>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <input
              type="range"
              min={1}
              max={numSteps}
              value={currentDay}
              onChange={(e) => { setIsPlaying(false); setCurrentDay(Number(e.target.value)); }}
              aria-label="タイムラインスライダー"
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-600 bg-zinc-200 dark:bg-zinc-700"
            />
            <div className="flex justify-between text-[10px] text-zinc-400 mt-1 px-0.5">
              <span>Day 1</span>
              <span className="hidden sm:inline">Day 30</span>
              <span className="hidden sm:inline">Day 60</span>
              <span>Day {numSteps}</span>
            </div>
          </div>

          <div className="text-center shrink-0 w-16 sm:w-20">
            <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 leading-tight">{currentDay}</div>
            <div className="text-[10px] text-zinc-500">/ {numSteps} 日目</div>
          </div>
        </div>

        {/* Speed control */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-zinc-500">
          <span>速度:</span>
          {[{ label: "0.5x", ms: 200 }, { label: "1x", ms: 100 }, { label: "2x", ms: 50 }, { label: "4x", ms: 25 }].map((s) => (
            <button
              key={s.label}
              onClick={() => setPlaySpeed(s.ms)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                playSpeed === s.ms
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={() => { setIsPlaying(false); setCurrentDay(1); }}
            className="ml-auto px-2 py-0.5 rounded text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            リセット
          </button>
        </div>
      </div>

      {/* Adoption Line Chart synced with timeline */}
      {result.cumulative_adoption && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900" data-chart-id="adoption-timeline">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">採用推移（累積 / 日次）</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={result.cumulative_adoption.map((cum, i) => ({
                day: result.day_labels?.[i] ?? i + 1,
                cumulative: cum,
                daily: result.daily_adoption?.[i] ?? 0,
              }))}
              margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: chartColors.axis }}
                tickFormatter={(v: number) => `${v}`}
                label={{ value: "日", position: "insideBottomRight", offset: -5, fontSize: 11, fill: chartColors.axis }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: chartColors.axis }}
                label={{ value: "累積採用数", angle: -90, position: "insideLeft", offset: 0, fontSize: 11, fill: chartColors.axis }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: chartColors.axis }}
                label={{ value: "日次採用数", angle: 90, position: "insideRight", offset: 0, fontSize: 11, fill: chartColors.axis }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }}
                formatter={(value, name) => [
                  Number(value).toLocaleString(),
                  name === "cumulative" ? "累積採用" : "日次採用",
                ]}
                labelFormatter={(label) => `Day ${label}`}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cumulative"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                name="cumulative"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="daily"
                stroke="#22c55e"
                strokeWidth={1.5}
                dot={false}
                name="daily"
                strokeDasharray="4 2"
              />
              <ReferenceLine
                yAxisId="left"
                x={currentDay}
                stroke="#ef4444"
                strokeWidth={2}
                label={{ value: `Day ${currentDay}`, position: "top", fontSize: 11, fill: "#ef4444" }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 sm:gap-6 mt-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-blue-600 rounded" />累積採用
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-green-500 rounded" style={{ borderTop: "1.5px dashed #22c55e", background: "none" }} />日次採用
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 bg-red-500 rounded" />現在位置
            </span>
          </div>
        </div>
      )}

      {/* Funnel Distribution Bar */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">ファネル分布（Day {currentDay}）</h3>
        <FunnelStackBar distribution={funnelDist} total={agents.length} />
        <div className="flex justify-between mt-2 overflow-x-auto gap-1">
          {FUNNEL_KEYS.map((key, i) => (
            <div key={key} className="text-center shrink-0 min-w-0">
              <div className="text-[9px] sm:text-[10px] truncate" style={{ color: FUNNEL_COLORS[i] }}>{FUNNEL_LABELS[i]}</div>
              <div className="text-[10px] sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">{Math.round(funnelDist[key] * sf).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="推定TAM" value={(result.config.tam ?? 0).toLocaleString()} unit="人" sub={`${result.config.num_agents?.toLocaleString() ?? "—"}エージェント`} />
        <SummaryCard label="検討中" value={Math.round(funnelDist.consideration * sf).toLocaleString()} unit="人" accent="#f59e0b" sub={`${funnelDist.consideration}エージェント`} />
        <SummaryCard label="採用済み" value={Math.round(funnelDist.adopted * sf).toLocaleString()} unit="人" accent="#22c55e" sub={`${funnelDist.adopted}エージェント`} />
        <SummaryCard label="本日の新規採用" value={Math.round(newAdoptersToday * sf).toLocaleString()} unit="人" accent="#2563eb" sub={`${newAdoptersToday}エージェント`} />
      </div>
      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">※ 1エージェント ≈ 同属性{Math.round(sf).toLocaleString()}人を代表</p>

      {/* Funnel Stacked Area Chart over time */}
      {result.daily_funnel_snapshot && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900" data-chart-id="funnel-timeline">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">ファネル推移</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart
              data={result.daily_funnel_snapshot.map((d, i) => ({
                day: result.day_labels?.[i] ?? i + 1,
                ...d,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: chartColors.axis }} />
              <YAxis tick={{ fontSize: 10, fill: chartColors.axis }} />
              <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }} />
              <Legend formatter={(v) => {
                const idx = FUNNEL_KEYS.indexOf(v as typeof FUNNEL_KEYS[number]);
                return idx >= 0 ? FUNNEL_LABELS[idx] : v;
              }} />
              {[...FUNNEL_KEYS].reverse().map((key, ri) => {
                const i = FUNNEL_KEYS.length - 1 - ri;
                return (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="funnel"
                    stroke={FUNNEL_COLORS[i]}
                    fill={FUNNEL_COLORS[i]}
                    fillOpacity={0.7}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Segment-level Funnel Analysis — Card Grid */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">セグメント別ファネル分析（Day {currentDay}）</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {segmentAnalysis.map((seg) => (
            <button
              key={seg.rogersType}
              type="button"
              onClick={() => setSelectedSegment(seg.rogersType)}
              className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-3 text-left hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] text-white font-medium" style={{ backgroundColor: seg.color }}>
                  {seg.label}
                </span>
              </div>
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{(seg.adoptionRate * 100).toFixed(1)}%</div>
              <div className="text-[10px] text-zinc-500">採用率</div>
              <div className="mt-2">
                <FunnelStackBar distribution={seg.dist} total={seg.total} />
              </div>
              <div className="text-[10px] text-zinc-500 mt-1.5">{Math.round(seg.total * sf).toLocaleString()}人</div>
              {seg.insights.length > 0 && (
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
                  {seg.insights.map((insight, idx) => (
                    <div key={idx} className="flex items-start gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                      <span className="text-amber-500 shrink-0 mt-0.5">*</span>
                      <span>{insight}</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Segment Detail Modal */}
      {selectedSegment && (() => {
        const seg = segmentAnalysis.find((s) => s.rogersType === selectedSegment);
        if (!seg) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedSegment(null)}
          >
            <div
              className="relative w-full max-w-lg mx-0 sm:mx-4 rounded-t-xl sm:rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 max-h-[85vh] overflow-y-auto safe-bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSelectedSegment(null)}
                className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                aria-label="閉じる"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" /></svg>
              </button>
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-block rounded-full px-2.5 py-0.5 text-xs text-white font-medium" style={{ backgroundColor: seg.color }}>
                  {seg.label}
                </span>
                <span className="text-sm text-zinc-500">{Math.round(seg.total * sf).toLocaleString()}人</span>
              </div>
              <FunnelStackBar distribution={seg.dist} total={seg.total} />
              <div className="flex justify-between mt-2 mb-3">
                {FUNNEL_KEYS.map((key, i) => (
                  <div key={key} className="text-center">
                    <div className="text-[10px]" style={{ color: FUNNEL_COLORS[i] }}>{FUNNEL_LABELS[i]}</div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{Math.round(seg.dist[key] * sf).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                <div className="text-center rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2">
                  <div className="text-zinc-500 text-xs">採用率</div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">{(seg.adoptionRate * 100).toFixed(1)}%</div>
                </div>
                <div className="text-center rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2">
                  <div className="text-zinc-500 text-xs">認知率</div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">{(seg.awarenessRate * 100).toFixed(1)}%</div>
                </div>
                <div className="text-center rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2">
                  <div className="text-zinc-500 text-xs">平均採用日</div>
                  <div className="font-bold text-zinc-900 dark:text-zinc-100">{seg.avgAdoptionDay !== null ? `Day ${Math.round(seg.avgAdoptionDay)}` : "-"}</div>
                </div>
              </div>
              {seg.insights.length > 0 && (
                <div className="space-y-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">インサイト</div>
                  {seg.insights.map((insight, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      <span className="text-amber-500 shrink-0 mt-0.5">*</span>
                      <span>{insight}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Per-segment adoption rate over time */}
      {segmentAdoptionTimeSeries.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900" data-chart-id="segment-adoption">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">セグメント別 採用率推移</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={segmentAdoptionTimeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: chartColors.axis }} />
              <YAxis tick={{ fontSize: 10, fill: chartColors.axis }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, ""]}
                labelFormatter={(label) => `Day ${label}`}
              />
              <Legend formatter={(v) => ROGERS_LABELS[v] ?? v} />
              {ROGERS_KEYS.map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={ROGERS_COLORS[key as keyof typeof ROGERS_COLORS] ?? "#6b7280"}
                  strokeWidth={2}
                  dot={false}
                  name={key}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ---------- What-If Components ----------

function DiffBadge({ delta, pct, unit }: { delta: number; pct: number; unit: string }) {
  if (delta === 0 && pct === 0) return null;
  const positive = delta > 0;
  const color = positive
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
  const sign = positive ? "+" : "";
  return (
    <span className={`text-sm font-medium ${color}`}>
      {sign}{delta.toLocaleString()}{unit} ({sign}{pct.toFixed(1)}%)
    </span>
  );
}

function EventCard({
  event,
  reasoning,
  onUpdate,
  onRemove,
  disabled,
}: {
  event: WhatIfEvent;
  reasoning?: string;
  onUpdate: (updated: WhatIfEvent) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        event.enabled
          ? "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
          : "border-zinc-100 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onUpdate({ ...event, enabled: !event.enabled })}
          disabled={disabled}
          className={`mt-1 shrink-0 w-8 h-5 rounded-full transition-colors relative ${
            event.enabled ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-600"
          } disabled:opacity-50`}
          aria-label={event.enabled ? "無効にする" : "有効にする"}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${
              event.enabled ? "left-3.5" : "left-0.5"
            }`}
          />
        </button>
        <div className="flex-1 min-w-0">
          <textarea
            value={event.text}
            onChange={(e) => onUpdate({ ...event, text: e.target.value })}
            disabled={disabled}
            rows={2}
            maxLength={500}
            placeholder="例: 競合他社が30%値下げした"
            className={`${inputClass} text-sm disabled:opacity-50`}
          />
          <div className="mt-2 flex gap-2">
            <div className="flex items-center gap-1">
              <label className="text-xs text-zinc-500">開始日:</label>
              <input
                type="number"
                min={1}
                value={event.start_day ?? ""}
                onChange={(e) =>
                  onUpdate({ ...event, start_day: e.target.value ? Number(e.target.value) : undefined })
                }
                disabled={disabled}
                placeholder="-"
                className={`${inputClass} w-16 text-xs disabled:opacity-50`}
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-zinc-500">終了日:</label>
              <input
                type="number"
                min={1}
                value={event.end_day ?? ""}
                onChange={(e) =>
                  onUpdate({ ...event, end_day: e.target.value ? Number(e.target.value) : undefined })
                }
                disabled={disabled}
                placeholder="-"
                className={`${inputClass} w-16 text-xs disabled:opacity-50`}
              />
            </div>
          </div>
          {reasoning && (
            <p className="mt-1.5 text-xs text-zinc-400 italic">AI: {reasoning}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="shrink-0 mt-1 text-zinc-400 hover:text-red-500 transition-colors disabled:opacity-50"
          aria-label="削除"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function WhatIfDiffSummary({ diff }: { diff: WhatIfDiff }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs text-zinc-500">採用者数の変化</p>
        <div className="mt-1">
          <DiffBadge delta={diff.total_adopters_delta} pct={diff.total_adopters_pct} unit="人" />
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs text-zinc-500">累積売上の変化</p>
        <div className="mt-1">
          <DiffBadge delta={diff.total_revenue_delta} pct={diff.total_revenue_pct} unit="円" />
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs text-zinc-500">採用率の変化</p>
        <div className="mt-1">
          {diff.adoption_rate_delta !== 0 ? (
            <span className={`text-sm font-medium ${diff.adoption_rate_delta > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {diff.adoption_rate_delta > 0 ? "+" : ""}{(diff.adoption_rate_delta * 100).toFixed(2)}%
            </span>
          ) : (
            <span className="text-sm text-zinc-400">変化なし</span>
          )}
        </div>
      </div>
    </div>
  );
}

function WhatIfPanel({
  lastRequest,
  onWhatIfResult,
  chartColors,
}: {
  lastRequest: SimulateRequest | null;
  onWhatIfResult?: (r: WhatIfResponse | null) => void;
  chartColors: ChartColors;
}) {
  const [events, setEvents] = useState<WhatIfEvent[]>([]);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Restore events from localStorage after hydration
  useEffect(() => {
    const saved = loadFromStorage<WhatIfEvent[]>(STORAGE_KEYS.whatifEvents);
    if (saved?.length) setEvents(saved);
  }, []);

  // Persist events to localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.whatifEvents, events);
  }, [events]);

  const addEvent = useCallback((text = "", startDay?: number) => {
    if (events.length >= 10) return;
    const newEvent: WhatIfEvent = {
      id: crypto.randomUUID(),
      text,
      start_day: startDay,
      enabled: true,
    };
    setEvents((prev) => [...prev, newEvent]);
    setIsDirty(true);
    setIsOpen(true);
  }, [events.length]);

  const updateEvent = useCallback((id: string, updated: WhatIfEvent) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
    setIsDirty(true);
  }, []);

  const removeEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setIsDirty(true);
  }, []);

  const handleRun = useCallback(async () => {
    if (!lastRequest) return;
    setErrorInfo(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulate/whatif`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base: lastRequest, events }),
      });
      if (!res.ok) {
        setErrorInfo(classifyError(null, res.status));
        return;
      }
      const data: WhatIfResponse = await res.json();
      setWhatIfResult(data);
      onWhatIfResult?.(data);
      setIsDirty(false);
    } catch (err) {
      setErrorInfo(classifyError(err));
    } finally {
      setLoading(false);
    }
  }, [lastRequest, events, onWhatIfResult]);

  // Build reasoning map from event results
  const reasoningMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (whatIfResult?.event_results) {
      for (const er of whatIfResult.event_results) {
        map[er.id] = er.reasoning;
      }
    }
    return map;
  }, [whatIfResult]);

  // Build What-If overlay chart data
  const chartData = useMemo(() => {
    if (!whatIfResult) return null;
    const baseline = whatIfResult.baseline;
    const wi = whatIfResult.whatif;
    return baseline.daily_adoption.map((_, i) => ({
      day: baseline.day_labels?.[i] ?? i + 1,
      baseline: baseline.cumulative_adoption[i],
      whatif: wi.cumulative_adoption[i],
    }));
  }, [whatIfResult]);

  if (!lastRequest) return null;

  const enabledCount = events.filter((e) => e.enabled).length;

  return (
    <div className="mb-6 sm:mb-8">
      {/* Header - always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            What-If 分析
          </span>
          {events.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-800 dark:text-amber-200">
              {enabledCount}/{events.length} イベント
            </span>
          )}
          {isDirty && whatIfResult && (
            <span className="inline-flex items-center rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200">
              再実行が必要
            </span>
          )}
        </div>
        <svg
          className={`h-5 w-5 text-amber-600 transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Expandable content */}
      {isOpen && (
        <div className="mt-3 space-y-4">
          {/* Event cards */}
          <div className="space-y-2">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                reasoning={reasoningMap[event.id]}
                onUpdate={(updated) => updateEvent(event.id, updated)}
                onRemove={() => removeEvent(event.id)}
                disabled={loading}
              />
            ))}
          </div>

          {/* Add buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addEvent()}
              disabled={events.length >= 10 || loading}
              className="rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 transition-colors disabled:opacity-40"
            >
              + カスタムイベント
            </button>
            <div className="relative group">
              <button
                type="button"
                disabled={events.length >= 10 || loading}
                className="rounded-md border border-dashed border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:border-amber-400 dark:border-amber-700 dark:text-amber-400 transition-colors disabled:opacity-40 peer"
              >
                + プリセットから追加 ▾
              </button>
              <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover:block hover:block w-56 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {WHATIF_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => addEvent(preset.text)}
                    disabled={events.length >= 10}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors first:rounded-t-lg last:rounded-b-lg disabled:opacity-40"
                  >
                    <span className="font-medium">{preset.label}</span>
                    <span className="block text-zinc-400 mt-0.5">{preset.text}</span>
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-zinc-400 self-center">{events.length}/10</span>
          </div>

          {/* Error */}
          {errorInfo && (
            <ErrorAlert
              error={errorInfo}
              onRetry={handleRun}
              onDismiss={() => setErrorInfo(null)}
            />
          )}

          {/* Run button */}
          <button
            type="button"
            onClick={handleRun}
            disabled={loading || enabledCount === 0}
            className="w-full rounded-md bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                What-If シミュレーション中
              </span>
            ) : (
              `What-If シミュレーション実行${isDirty && whatIfResult ? "（変更あり）" : ""}`
            )}
          </button>

          {/* Fallback warning */}
          {whatIfResult?.interpretation.fallback_used && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                AIによる解釈ができなかったため、パラメータ変化なしで実行しました。ANTHROPIC_API_KEYを設定してください。
              </p>
            </div>
          )}

          {/* Results */}
          {whatIfResult && !loading && (
            <div className="space-y-4">
              {/* Interpretation summary */}
              {whatIfResult.interpretation.delta.reasoning && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950">
                  <p className="text-xs font-medium text-purple-900 dark:text-purple-100 mb-1">AIの解釈</p>
                  <p className="text-xs text-purple-700 dark:text-purple-300">{whatIfResult.interpretation.delta.reasoning}</p>
                </div>
              )}

              {/* Diff summary */}
              <WhatIfDiffSummary diff={whatIfResult.diff} />

              {/* Overlay chart */}
              {chartData && (
                <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900" data-chart-id="whatif-comparison">
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                    累積採用者数の比較
                  </h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: chartColors.axis }} />
                      <YAxis tick={{ fontSize: 11, fill: chartColors.axis }} tickFormatter={(v) => Number(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                      <Tooltip contentStyle={{ backgroundColor: chartColors.tooltipBg, borderColor: chartColors.tooltipBorder }} formatter={(v) => typeof v === "number" ? v.toLocaleString() : String(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="baseline" name="ベースライン" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="whatif" name="What-If" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Empty / Loading Placeholder ----------

const TIPS = [
  { icon: "💡", text: "Bass拡散モデルは、口コミ（模倣）とメディア（革新）の2つの力で普及をモデル化します" },
  { icon: "🎯", text: "JTBD（Jobs-to-be-Done）は顧客が「片付けたい用事」に着目するフレームワークです" },
  { icon: "📊", text: "p値（革新係数）が高いほど、広告やメディアによる初期採用が加速します" },
  { icon: "🔗", text: "q値（模倣係数）が高いほど、口コミやSNSによる普及が強くなります" },
  { icon: "🏢", text: "TAM（Total Addressable Market）は理論上の最大市場規模を示します" },
  { icon: "⚡", text: "エージェントはそれぞれ異なる属性を持ち、自律的に採用を判断します" },
  { icon: "🌐", text: "ソーシャルネットワークの構造が情報伝播のスピードに大きく影響します" },
  { icon: "📈", text: "What-If分析で、価格変更やイベントの影響をシミュレーションできます" },
  { icon: "🧠", text: "AIがサービス説明からJTBD・ターゲット層・価格帯を自動推論します" },
  { icon: "🔄", text: "シミュレーションは確率的モデルなので、同じ条件でも毎回わずかに異なる結果になります" },
];

function EmptyPlaceholder({ isLoading }: { isLoading: boolean }) {
  const [tipIndex, setTipIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTipIndex((prev) => (prev + 1) % TIPS.length);
        setFade(true);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const tip = TIPS[tipIndex];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-40 sm:h-64 gap-6 px-4">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-16 w-16 rounded-full border-4 border-purple-200 dark:border-purple-800 opacity-30 animate-ping" />
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-200 dark:border-purple-800 border-t-purple-600 dark:border-t-purple-400" />
        </div>
        <div className="text-center max-w-md">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 animate-pulse-text loading-dots mb-3">
            AIがサービスを分析しています
          </p>
          <div
            className="transition-all duration-300 ease-in-out"
            style={{ opacity: fade ? 1 : 0, transform: fade ? "translateY(0)" : "translateY(4px)" }}
          >
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              <span className="mr-1.5">{tip.icon}</span>
              {tip.text}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-40 sm:h-64 gap-5 px-4">
      <div className="flex gap-1.5">
        {["bg-purple-400", "bg-blue-400", "bg-cyan-400"].map((color, i) => (
          <div
            key={color}
            className={`h-2 w-2 rounded-full ${color} opacity-60`}
            style={{ animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite` }}
          />
        ))}
      </div>
      <div className="text-center max-w-sm">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
          サービスの説明を入力してAI分析を実行してください
        </p>
        <div
          className="transition-all duration-300 ease-in-out"
          style={{ opacity: fade ? 1 : 0, transform: fade ? "translateY(0)" : "translateY(4px)" }}
        >
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            <span className="mr-1.5">{tip.icon}</span>
            {tip.text}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Page ----------

export default function Home() {
  const { mode, setTheme, isDark } = useTheme();
  const chartColors = isDark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  const [simulationResult, setSimulationResult] =
    useState<SimulateResponse | null>(null);
  const [lastSimRequest, setLastSimRequest] = useState<SimulateRequest | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportChartCaptures, setReportChartCaptures] = useState<ChartCaptures>({});
  const [whatIfResultForReport, setWhatIfResultForReport] = useState<WhatIfResponse | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);

  const handleDownloadImage = useCallback(async () => {
    const el = resultsRef.current;
    if (!el || capturing) return;
    setCapturing(true);
    try {
      const { toPng } = await import("html-to-image");
      // Find the scrollable container and temporarily remove overflow hidden
      const scrollParent = el.closest(".lg\\:overflow-y-auto") as HTMLElement | null;
      const prevOverflow = scrollParent?.style.overflow;
      const prevHeight = scrollParent?.style.height;
      if (scrollParent) {
        scrollParent.style.overflow = "visible";
        scrollParent.style.height = "auto";
      }
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: isDark ? "#18181b" : "#ffffff",
      });
      // Restore scroll container
      if (scrollParent) {
        scrollParent.style.overflow = prevOverflow ?? "";
        scrollParent.style.height = prevHeight ?? "";
      }
      const link = document.createElement("a");
      link.download = `simulation-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Image capture failed:", e);
    } finally {
      setCapturing(false);
    }
  }, [isDark, capturing]);

  // Warn before closing tab when simulation results exist
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (simulationResult) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [simulationResult]);

  // Pre-capture charts once simulation results render, so they're ready when report opens
  useEffect(() => {
    if (!simulationResult || reportOpen) return;
    // Small delay to ensure Recharts has finished rendering
    const timer = setTimeout(async () => {
      try {
        await captureAllCharts(isDark, (chartId, dataUrl) => {
          setReportChartCaptures((prev) => ({ ...prev, [chartId]: dataUrl }));
        });
      } catch {
        // ignore
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [simulationResult, isDark, reportOpen]);

  const handleOpenReport = useCallback(() => {
    setReportOpen(true);
  }, []);

  // Restore results from localStorage on mount
  useEffect(() => {
    // Try auto result first (newer unified flow), fall back to detailed result
    const autoResult = loadFromStorage<AutoResponse>(STORAGE_KEYS.autoResult);
    if (autoResult?.simulation) {
      setSimulationResult(autoResult.simulation);
    } else {
      setSimulationResult(loadFromStorage<SimulateResponse>(STORAGE_KEYS.detailedResult));
    }
    setLastSimRequest(loadFromStorage<SimulateRequest>(STORAGE_KEYS.lastRequest));
  }, []);

  const handleSimulationResult = useCallback((r: SimulateResponse) => {
    setSimulationResult(r);
    // Save lightweight version to localStorage (strip large agent data)
    const lightweight = { ...r, agent_snapshot: undefined };
    saveToStorage(STORAGE_KEYS.detailedResult, lightweight);
    // Clear auto result so the latest simulation is always restored on refresh
    try { localStorage.removeItem(STORAGE_KEYS.autoResult); } catch { /* ignore */ }
  }, []);

  const handleRequestCapture = useCallback((req: SimulateRequest) => {
    setLastSimRequest(req);
    saveToStorage(STORAGE_KEYS.lastRequest, req);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 font-[family-name:var(--font-geist-sans)]">
      <ThemeToggle mode={mode} onChange={setTheme} />
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 sm:px-8 py-3 sm:py-4 dark:border-zinc-800 dark:bg-zinc-900 flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Value Simulator
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500">
            Bass拡散モデルによる市場採用シミュレーション
          </p>
        </div>
        {simulationResult && !reportOpen && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={capturing}
              title="画像保存"
              className="p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {capturing ? (
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={handleOpenReport}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-blue-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span className="hidden sm:inline">報告書を作成</span>
              <span className="sm:hidden">報告書</span>
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 lg:overflow-hidden lg:min-h-0">
        {/* Responsive: stack on mobile, side-by-side on desktop with independent scroll */}
        <div className="flex flex-col lg:flex-row lg:h-full">
          <aside className="w-full lg:w-96 shrink-0 p-4 sm:p-6 lg:p-8 lg:overflow-y-auto lg:border-r lg:border-zinc-200 lg:dark:border-zinc-800">
            <SimulationForm onResult={handleSimulationResult} onRequestCapture={handleRequestCapture} onLoadingChange={setFormLoading} />
          </aside>
          <section className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 lg:overflow-y-auto">
            {!simulationResult && (
              <EmptyPlaceholder isLoading={formLoading} />
            )}
            {simulationResult && (
              <div ref={resultsRef} className="space-y-6 sm:space-y-8">
                {/* 1. Executive Summary */}
                <SummarySection result={simulationResult} />
                {/* 2. Funnel Analysis (micro dynamics) */}
                <PersonaTab result={simulationResult} chartColors={chartColors} />
                {/* 3. Agent-level Analysis (individual) */}
                <AgentAnalysisSection result={simulationResult} chartColors={chartColors} isDark={isDark} />
                {/* 4. What-If Scenario */}
                <WhatIfPanel
                  lastRequest={lastSimRequest}
                  chartColors={chartColors}
                  onWhatIfResult={setWhatIfResultForReport}
                />
                {/* 5. Diffusion Curves (macro dynamics detail) */}
                <DiffusionCurvesSection result={simulationResult} chartColors={chartColors} />
              </div>
            )}
            {/* Footer inside right column on desktop */}
            <div className="hidden lg:block mt-8 border-t border-zinc-200 bg-zinc-50 -mx-8 px-8 py-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-3">シミュレーションの前提・注意事項</h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                {FOOTER_CAVEATS.map((item) => (
                  <details key={item.title} className="group rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg flex items-center gap-1.5">
                      <span>{item.icon}</span>
                      <span className="flex-1">{item.title}</span>
                      <span className="text-[10px] text-zinc-400 transition-transform group-open:rotate-90">▶</span>
                    </summary>
                    <p className="px-3 pb-3 pt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {item.body}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer for mobile only (on desktop it's inside the right column) */}
      <footer className="lg:hidden shrink-0 border-t border-zinc-200 bg-zinc-50 px-4 sm:px-8 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-3">シミュレーションの前提・注意事項</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FOOTER_CAVEATS.map((item) => (
            <details key={item.title} className="group rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg flex items-center gap-1.5">
                <span>{item.icon}</span>
                <span className="flex-1">{item.title}</span>
                <span className="text-[10px] text-zinc-400 transition-transform group-open:rotate-90">▶</span>
              </summary>
              <p className="px-3 pb-3 pt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {item.body}
              </p>
            </details>
          ))}
        </div>
      </footer>

      {/* Report Panel */}
      {reportOpen && simulationResult && (
        <ReportPanel
          simulationResult={simulationResult}
          whatIfResult={whatIfResultForReport}
          lastRequest={lastSimRequest}
          isDark={isDark}
          chartCaptures={reportChartCaptures}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
