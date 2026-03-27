"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ============================================================
// MOCK DATA
// ============================================================

const SERVICE_DESCRIPTION =
  "AIが自動でレシートを読み取り、家計簿を作成するアプリ。支出パターンを分析し、節約ポイントを提案する。";
const SERVICE_NAME = "AI家計簿アプリ";
const PRICE_JPY = 480;

const KPI = {
  tam: 8_420_000,
  totalAdopters: 1_847_200,
  peakDaily: 12_340,
  adoptionRate: 21.9,
  odiScore: 7.8,
  odiLabel: "underserved" as const,
};

function generateMockData() {
  const days = 1095;
  const p = 0.003, q = 0.08, m = KPI.tam;
  const daily: number[] = [], cumulative: number[] = [], revCum: number[] = [];
  let N = 0, rev = 0;
  for (let t = 0; t < days; t++) {
    const f = (p + (q * N) / m) * (m - N);
    const n = Math.max(0, Math.round(f));
    N += n; rev += N * (PRICE_JPY / 30);
    daily.push(n); cumulative.push(N); revCum.push(Math.round(rev));
  }
  const step = Math.ceil(days / 365), chart = [];
  for (let i = 0; i < days; i += step)
    chart.push({ day: i + 1, cumulative: cumulative[i], daily: daily[i], revenue_cumulative: revCum[i] });
  return chart;
}

function generateRogersData() {
  const data = [];
  for (let d = 0; d < 365; d += 3) {
    const t = d / 365;
    data.push({
      day: d + 1,
      innovator: Math.min(100, 2.5 * (1 - Math.exp(-8 * t))) * 400,
      early_adopter: Math.min(100, 13.5 * (1 - Math.exp(-4 * t))) * 400,
      early_majority: Math.min(100, 34 * (1 - Math.exp(-2.5 * (t - 0.15)))) * (t > 0.1 ? 400 : 0),
      late_majority: Math.min(100, 34 * (1 - Math.exp(-2 * (t - 0.35)))) * (t > 0.25 ? 400 : 0),
      laggard: Math.min(100, 16 * (1 - Math.exp(-1.5 * (t - 0.55)))) * (t > 0.4 ? 400 : 0),
    });
  }
  return data;
}

function generateFunnelData() {
  const data = [];
  for (let d = 0; d < 365; d += 3) {
    const t = d / 365, total = 5000;
    const adopted = Math.floor(total * 0.22 * (1 - Math.exp(-3 * t)));
    const consideration = Math.floor(total * 0.08 * Math.max(0, Math.sin(Math.PI * t * 1.5)));
    const interest = Math.floor(total * 0.12 * Math.max(0, Math.sin(Math.PI * t)));
    const aware = Math.floor(total * 0.25 * (1 - Math.exp(-2 * t)));
    data.push({ day: d + 1, unaware: Math.max(0, total - adopted - consideration - interest - aware), aware, interest, consideration, adopted });
  }
  return data;
}

// ============================================================
// DESIGN TOKENS
// ============================================================

const ROGERS_COLORS: Record<string, string> = {
  innovator: "#ef4444", early_adopter: "#f97316", early_majority: "#eab308",
  late_majority: "#22c55e", laggard: "#6366f1",
};
const ROGERS_LABELS: Record<string, string> = {
  innovator: "イノベーター", early_adopter: "アーリーアダプター", early_majority: "アーリーマジョリティ",
  late_majority: "レイトマジョリティ", laggard: "ラガード",
};
const FUNNEL_COLORS = { unaware: "#94a3b8", aware: "#60a5fa", interest: "#a78bfa", consideration: "#f59e0b", adopted: "#22c55e" };
const FUNNEL_LABELS: Record<string, string> = { unaware: "未認知", aware: "認知", interest: "興味", consideration: "検討", adopted: "採用" };

// ============================================================
// SCENE SYSTEM
// ============================================================

type SceneId = "hook" | "input" | "analyzing" | "results" | "deepdive" | "cta";

const SCENE_DURATIONS: Record<SceneId, number> = {
  hook: 4000, input: 5000, analyzing: 6000, results: 8000, deepdive: 8000, cta: 5000,
};
const SCENE_ORDER: SceneId[] = ["hook", "input", "analyzing", "results", "deepdive", "cta"];

function useSceneController() {
  const [currentScene, setCurrentScene] = useState<SceneId>("hook");
  const [sceneProgress, setSceneProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sceneElapsed, setSceneElapsed] = useState(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const currentIndex = SCENE_ORDER.indexOf(currentScene);

  const tick = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;
    setSceneElapsed((prev) => {
      const next = prev + dt;
      const dur = SCENE_DURATIONS[currentScene];
      setSceneProgress(Math.min(1, next / dur));
      if (next >= dur) {
        const idx = SCENE_ORDER.indexOf(currentScene);
        if (idx < SCENE_ORDER.length - 1) {
          setCurrentScene(SCENE_ORDER[idx + 1]);
          lastTimeRef.current = 0;
          return 0;
        } else { setIsPlaying(false); return dur; }
      }
      return next;
    });
    rafRef.current = requestAnimationFrame(tick);
  }, [currentScene]);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [isPlaying, tick]);

  const play = () => setIsPlaying(true);
  const pause = () => { setIsPlaying(false); cancelAnimationFrame(rafRef.current); };
  const goToScene = (id: SceneId) => { setCurrentScene(id); setSceneProgress(0); setSceneElapsed(0); lastTimeRef.current = 0; };
  const restart = () => { goToScene("hook"); setTimeout(() => setIsPlaying(true), 50); };

  return { currentScene, sceneProgress, isPlaying, play, pause, goToScene, restart, currentIndex, totalScenes: SCENE_ORDER.length };
}

// ============================================================
// ANIMATION HELPERS
// ============================================================

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeOutExpo(t: number) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
function easeInOutQuart(t: number) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; }

function stagger(progress: number, index: number, total: number, spread = 0.5) {
  const start = (index / total) * spread;
  return Math.max(0, Math.min(1, (progress - start) / (1 - spread)));
}

/** Animated counter: smoothly counts from 0 to target */
function useCountUp(target: number, progress: number, decimals = 0) {
  const val = target * easeOutExpo(Math.min(1, progress));
  return decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString();
}

// ============================================================
// FLOATING PARTICLES BACKGROUND (Canvas)
// ============================================================

function ParticleBackground({ color = "blue", density = 60 }: { color?: "blue" | "purple" | "green"; density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    let W = 0, H = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();

    const colorMap = { blue: [59, 130, 246], purple: [147, 51, 234], green: [34, 197, 94] };
    const [r, g, b] = colorMap[color];

    const particles = Array.from({ length: density }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      size: 1 + Math.random() * 2, phase: Math.random() * Math.PI * 2,
    }));

    let frame = 0;
    let animId: number;
    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;

        const alpha = 0.15 + Math.sin(frame * 0.015 + p.phase) * 0.1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      }

      // Draw connections
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dist = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
          if (dist < 100) {
            ctx.strokeStyle = `rgba(${r},${g},${b},${0.06 * (1 - dist / 100)})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [color, density]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

// ============================================================
// TYPEWRITER HOOK
// ============================================================

function useTypewriter(text: string, active: boolean, speed = 60) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!active) { setDisplayed(""); return; }
    let i = 0; setDisplayed("");
    const iv = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) clearInterval(iv); }, speed);
    return () => clearInterval(iv);
  }, [text, active, speed]);
  return displayed;
}

// ============================================================
// SCENE COMPONENTS
// ============================================================

/** Scene 1: Hook — cinematic question with particles */
function HookScene({ progress }: { progress: number }) {
  const p = easeOutExpo(progress);
  // Two-phase: question appears (0-0.5), then subtitle (0.5-1)
  const titleP = Math.min(1, p * 2);
  const subP = Math.max(0, (p - 0.4) / 0.6);

  return (
    <div className="relative h-full overflow-hidden">
      <ParticleBackground color="blue" density={80} />
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-8 text-center">
        <div style={{ transform: `scale(${0.9 + titleP * 0.1})` }}>
          <h1
            className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-zinc-900 dark:text-zinc-100 leading-tight tracking-tight"
            style={{
              opacity: titleP,
              transform: `translateY(${(1 - titleP) * 40}px)`,
              filter: `blur(${(1 - titleP) * 4}px)`,
            }}
          >
            新しいサービスのアイデア、
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-blue-600 bg-clip-text text-transparent bg-[length:200%_auto]" style={{ animationDuration: "3s" }}>
              本当に市場に受け入れられる？
            </span>
          </h1>
        </div>
        <p
          className="mt-8 text-lg sm:text-xl lg:text-2xl text-zinc-500 dark:text-zinc-400 max-w-2xl font-light"
          style={{
            opacity: easeOutCubic(subP),
            transform: `translateY(${(1 - easeOutCubic(subP)) * 20}px)`,
          }}
        >
          ローンチ前に、<span className="font-medium text-zinc-700 dark:text-zinc-200">1,000人のAIエージェント</span>が市場をシミュレーション
        </p>
      </div>
    </div>
  );
}

/** Scene 2: Input — form with typing, dramatic button click */
function InputScene({ progress }: { progress: number }) {
  const typed = useTypewriter(SERVICE_DESCRIPTION, progress > 0.02, 40);
  const buttonPhase = Math.max(0, (progress - 0.65) / 0.35);
  const buttonP = easeOutExpo(buttonPhase);
  // Click flash effect at very end
  const clickFlash = progress > 0.92 ? Math.max(0, (progress - 0.92) / 0.08) : 0;

  return (
    <div className="flex flex-col lg:flex-row h-full">
      <aside
        className="w-full lg:w-96 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 lg:p-8 flex flex-col"
        style={{ opacity: easeOutCubic(Math.min(1, progress * 4)), transform: `translateX(${(1 - easeOutCubic(Math.min(1, progress * 3))) * -20}px)` }}
      >
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">Value Simulator</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">Bass拡散モデルによる市場採用シミュレーション</p>

        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">サービス説明</label>
        <div className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 p-3 min-h-[100px] text-sm text-zinc-900 dark:text-zinc-100 mb-4">
          {typed}
          {progress < 0.65 && <span className="inline-block w-0.5 h-4 bg-blue-600 animate-pulse ml-0.5 align-text-bottom" />}
        </div>

        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">シミュレーション精度</label>
        <div className="flex gap-2 mb-6">
          {["小規模", "中規模", "大規模"].map((label, i) => (
            <button key={label} className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${i === 1 ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium" : "border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400"}`}>
              {label}
            </button>
          ))}
        </div>

        {buttonPhase > 0 && (
          <button
            className="relative w-full py-2.5 rounded-lg bg-purple-600 text-white font-medium text-sm overflow-hidden"
            style={{
              opacity: buttonP,
              transform: `translateY(${(1 - buttonP) * 12}px) scale(${clickFlash > 0 ? 0.97 : 1})`,
              boxShadow: clickFlash > 0 ? `0 0 ${30 * clickFlash}px rgba(147,51,234,0.5)` : "none",
            }}
          >
            {clickFlash > 0 && <div className="absolute inset-0 bg-white/30 animate-ping" />}
            ✦ AIで分析
          </button>
        )}
      </aside>

      <section className="flex-1 relative flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
        <ParticleBackground color="purple" density={30} />
        <div className="relative z-10 text-center">
          <div className="flex justify-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" style={{ animation: `bounce 1.2s ${i * 0.15}s infinite` }} />
            ))}
          </div>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">サービスを入力してシミュレーションを実行</p>
        </div>
      </section>
    </div>
  );
}

/** Scene 3: AI Analyzing — 1000 agents spawning with network */
function AnalyzingScene({ progress }: { progress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<{ x: number; y: number; vx: number; vy: number; targetX: number; targetY: number; rogers: string; born: number; size: number; pulse: number }[]>([]);
  const edgesRef = useRef<[number, number][]>([]);
  const frameRef = useRef(0);
  const initRef = useRef(false);
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const displayCount = Math.min(Math.floor(progress * 1000), 1000);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;

    if (!initRef.current) {
      initRef.current = true;
      const types = ["innovator", "early_adopter", "early_majority", "late_majority", "laggard"];
      const weights = [0.025, 0.135, 0.34, 0.34, 0.16];
      const rng = () => Math.random();

      for (let i = 0; i < 1000; i++) {
        let r = rng(), rogers = types[4];
        for (let j = 0; j < weights.length; j++) { r -= weights[j]; if (r <= 0) { rogers = types[j]; break; } }
        const angle = rng() * Math.PI * 2;
        const radius = 30 + rng() * Math.min(W, H) * 0.4;
        const edge = Math.floor(rng() * 4);
        const sx = edge === 0 ? rng() * W : edge === 1 ? W + 20 : edge === 2 ? rng() * W : -20;
        const sy = edge === 0 ? -20 : edge === 1 ? rng() * H : edge === 2 ? H + 20 : rng() * H;
        agentsRef.current.push({ x: sx, y: sy, vx: 0, vy: 0, targetX: W / 2 + Math.cos(angle) * radius, targetY: H / 2 + Math.sin(angle) * radius, rogers, born: i, size: 1.5 + rng() * 2.5, pulse: rng() * Math.PI * 2 });
      }
      const edges: [number, number][] = [], degree = new Array(1000).fill(0);
      for (let i = 1; i < 1000; i++) {
        for (let c = 0; c < Math.min(i, 2); c++) {
          const totalDeg = degree.reduce((s, d, idx) => idx < i ? s + d + 1 : s, 0);
          let pick = rng() * totalDeg, target = 0;
          for (let j = 0; j < i; j++) { pick -= (degree[j] + 1); if (pick <= 0) { target = j; break; } }
          edges.push([i, target]); degree[i]++; degree[target]++;
        }
      }
      edgesRef.current = edges;
    }

    let animId: number;
    const draw = () => {
      frameRef.current++;
      ctx.clearRect(0, 0, W, H);
      const agents = agentsRef.current, edges = edgesRef.current, count = displayCount, frame = frameRef.current;

      // Subtle radial gradient background pulse
      const pulseAlpha = 0.03 + Math.sin(frame * 0.01) * 0.015;
      const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      grad.addColorStop(0, `rgba(147,51,234,${pulseAlpha})`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < count; i++) {
        const a = agents[i];
        a.vx += (a.targetX - a.x) * 0.025; a.vy += (a.targetY - a.y) * 0.025;
        a.vx *= 0.9; a.vy *= 0.9;
        a.x += a.vx; a.y += a.vy;
      }

      // Edges with glow
      ctx.lineWidth = 0.4;
      for (const [a, b] of edges) {
        if (a >= count || b >= count) continue;
        const ag = agents[a], bg = agents[b];
        const dist = Math.hypot(ag.x - bg.x, ag.y - bg.y);
        if (dist > 100) continue;
        const alpha = 0.2 * (1 - dist / 100);
        ctx.strokeStyle = isDark ? `rgba(148,163,184,${alpha})` : `rgba(100,116,139,${alpha * 0.6})`;
        ctx.beginPath(); ctx.moveTo(ag.x, ag.y); ctx.lineTo(bg.x, bg.y); ctx.stroke();
      }

      const colorMap: Record<string, string> = ROGERS_COLORS;
      for (let i = 0; i < count; i++) {
        const a = agents[i];
        const age = (count - a.born) / Math.max(1, count);
        const spawn = Math.max(0, 1 - age * 4);
        const pulse = Math.sin(frame * 0.04 + a.pulse) * 0.6;
        const size = a.size + pulse + spawn * 4;
        const hex = colorMap[a.rogers] || "#6366f1";
        const cr = parseInt(hex.slice(1, 3), 16), cg = parseInt(hex.slice(3, 5), 16), cb = parseInt(hex.slice(5, 7), 16);

        if (spawn > 0.1) {
          ctx.beginPath(); ctx.arc(a.x, a.y, size + 10 * spawn, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${spawn * 0.2})`;
          ctx.fill();
        }
        ctx.beginPath(); ctx.arc(a.x, a.y, size, 0, Math.PI * 2);
        ctx.fillStyle = hex; ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [displayCount, isDark]);

  return (
    <div className="relative h-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
        <div className="mb-5 px-6 py-3 rounded-2xl bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md border border-zinc-200/50 dark:border-zinc-700/50 shadow-2xl">
          <p className="text-4xl sm:text-5xl lg:text-6xl font-black tabular-nums text-zinc-900 dark:text-zinc-100 text-center">
            {displayCount.toLocaleString()}
            <span className="text-lg sm:text-xl font-normal text-zinc-400 dark:text-zinc-500 ml-3">/ 1,000</span>
          </p>
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-1">エージェント生成中</p>
        </div>
        <div className="flex gap-3 px-4 py-2 rounded-xl bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm">
          {Object.entries(ROGERS_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ROGERS_COLORS[key] }} />
              <span className="text-[11px] text-zinc-600 dark:text-zinc-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Sidebar for results scenes */
function PromoSidebar() {
  return (
    <aside className="hidden lg:block w-96 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 lg:p-8 opacity-60">
      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">Value Simulator</h1>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Bass拡散モデルによる市場採用シミュレーション</p>
      <div className="space-y-3">
        <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 p-3 text-xs text-purple-700 dark:text-purple-300">
          <span className="font-medium">✦ AI推論結果</span>
          <p className="mt-1.5 text-zinc-600 dark:text-zinc-400">{SERVICE_NAME}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">サービス名</label>
          <div className="mt-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">{SERVICE_NAME}</div>
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">価格</label>
          <div className="mt-1 rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100">¥{PRICE_JPY.toLocaleString()}</div>
        </div>
      </div>
    </aside>
  );
}

/** Scene 4: Results — animated KPI counters + progressive charts */
function ResultsScene({ progress }: { progress: number }) {
  const chartData = useMemo(() => generateMockData(), []);
  const rogersData = useMemo(() => generateRogersData(), []);
  const p = easeInOutQuart(progress);

  // Progressive chart reveal
  const chartProgress = Math.max(0, (progress - 0.15) / 0.85);
  const visibleData = useMemo(() => {
    const end = Math.max(1, Math.floor(chartData.length * Math.min(1, easeOutCubic(chartProgress) * 1.2)));
    return chartData.slice(0, end);
  }, [chartData, chartProgress]);
  const rogersSlice = useMemo(() => {
    const end = Math.max(1, Math.floor(rogersData.length * Math.min(1, easeOutCubic(chartProgress) * 1.2)));
    return rogersData.slice(0, end);
  }, [rogersData, chartProgress]);

  // KPI counter animation (starts immediately, finishes at 40%)
  const kpiP = Math.min(1, progress / 0.4);
  const tamDisplay = useCountUp(KPI.tam, kpiP);
  const adoptersDisplay = useCountUp(KPI.totalAdopters, kpiP);
  const peakDisplay = useCountUp(KPI.peakDaily, kpiP);
  const rateDisplay = useCountUp(KPI.adoptionRate, kpiP, 1);
  const odiDisplay = useCountUp(KPI.odiScore, kpiP, 1);

  const kpis = [
    { label: "推定TAM", value: tamDisplay, unit: "人" },
    { label: "総採用者数", value: adoptersDisplay, unit: "人" },
    { label: "最大日次採用数", value: peakDisplay, unit: "人/日" },
    { label: "採用率", value: rateDisplay, unit: "%" },
    { label: "市場機会スコア", value: odiDisplay, unit: "/ 10", accent: "#22c55e" },
  ];

  return (
    <div className="flex flex-col lg:flex-row h-full">
      <PromoSidebar />
      <section className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 lg:overflow-y-auto">
        <div className="space-y-6 sm:space-y-8">
          {/* KPI Cards with counter animation */}
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {kpis.map((kpi, i) => {
                const s = easeOutExpo(stagger(p, i, kpis.length, 0.4));
                return (
                  <div key={kpi.label} className="rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900" style={{ opacity: s, transform: `translateY(${(1 - s) * 24}px) scale(${0.95 + s * 0.05})` }}>
                    <p className="text-xs sm:text-sm text-zinc-500">{kpi.label}</p>
                    <p className="mt-1 text-lg sm:text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100" style={kpi.accent ? { color: kpi.accent } : undefined}>
                      {kpi.value}
                      <span className="ml-1 text-xs sm:text-sm font-normal text-zinc-500">{kpi.unit}</span>
                    </p>
                  </div>
                );
              })}
            </div>
            <div style={{ opacity: Math.max(0, (p - 0.25) * 3), transform: `translateX(${(1 - Math.max(0, Math.min(1, (p - 0.25) * 3))) * -10}px)` }}>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                ODI: {KPI.odiScore.toFixed(1)} - 未充足
              </span>
            </div>
          </div>

          {/* 4 Charts — progressive draw */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
            {([
              { title: "累積採用者数（S字カーブ）", delay: 0, chart: (
                <LineChart data={visibleData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="cumulative" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              )},
              { title: "日次新規採用者数（ベル型カーブ）", delay: 0.05, chart: (
                <AreaChart data={visibleData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="daily" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} strokeWidth={2.5} isAnimationActive={false} />
                </AreaChart>
              )},
              { title: "ロジャーズカテゴリ別採用推移", delay: 0.1, chart: (
                <AreaChart data={rogersSlice}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                  <Tooltip />
                  {Object.keys(ROGERS_COLORS).map((key) => (
                    <Area key={key} type="monotone" dataKey={key} stackId="rogers" stroke={ROGERS_COLORS[key]} fill={ROGERS_COLORS[key]} fillOpacity={0.6} name={ROGERS_LABELS[key]} isAnimationActive={false} />
                  ))}
                </AreaChart>
              )},
              { title: "累積売上推移", delay: 0.15, chart: (
                <LineChart data={visibleData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${Number(value).toLocaleString()}円`, "累積売上"]} />
                  <Line type="monotone" dataKey="revenue_cumulative" stroke="#059669" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              )},
            ] as const).map(({ title, delay, chart }, i) => {
              const cardP = easeOutCubic(Math.max(0, Math.min(1, (chartProgress - delay) / (1 - delay))));
              return (
                <div key={i} className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
                  style={{ opacity: cardP, transform: `translateY(${(1 - cardP) * 20}px)` }}>
                  <h2 className="mb-3 sm:mb-4 text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
                  <ResponsiveContainer width="100%" height={300}>{chart}</ResponsiveContainer>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Scene 5: Deep Dive — Funnel analysis with dynamic bar */
function DeepDiveScene({ progress }: { progress: number }) {
  const funnelData = useMemo(() => generateFunnelData(), []);
  const p = easeInOutQuart(progress);

  const funnelSlice = useMemo(() => {
    const end = Math.max(1, Math.floor(funnelData.length * Math.min(1, easeOutCubic(p) * 1.3)));
    return funnelData.slice(0, end);
  }, [funnelData, p]);

  const currentIdx = Math.min(funnelData.length - 1, Math.floor(easeOutCubic(p) * funnelData.length));
  const cf = funnelData[currentIdx];
  const total = cf ? cf.unaware + cf.aware + cf.interest + cf.consideration + cf.adopted : 1;
  const stages = cf ? [
    { key: "unaware", value: cf.unaware }, { key: "aware", value: cf.aware },
    { key: "interest", value: cf.interest }, { key: "consideration", value: cf.consideration },
    { key: "adopted", value: cf.adopted },
  ] : [];

  return (
    <div className="flex flex-col lg:flex-row h-full">
      <PromoSidebar />
      <section className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 lg:overflow-y-auto">
        <div className="space-y-6 sm:space-y-8">
          {/* Animated funnel bar */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
            style={{ opacity: easeOutExpo(Math.min(1, p * 3)), transform: `translateY(${(1 - easeOutExpo(Math.min(1, p * 3))) * 16}px)` }}>
            <h2 className="mb-3 sm:mb-4 text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100">ファネル分析</h2>
            <div className="h-12 rounded-xl overflow-hidden flex shadow-inner">
              {stages.map(({ key, value }) => {
                const pct = (value / total) * 100;
                return (
                  <div key={key} className="h-full flex items-center justify-center transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: FUNNEL_COLORS[key as keyof typeof FUNNEL_COLORS] }}>
                    {pct > 8 && <span className="text-xs font-semibold text-white drop-shadow-md">{Math.round(pct)}%</span>}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {Object.entries(FUNNEL_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: FUNNEL_COLORS[key as keyof typeof FUNNEL_COLORS] }} />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Funnel area chart */}
          <div className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
            style={{ opacity: easeOutCubic(Math.max(0, (p - 0.1) * 1.2)), transform: `translateY(${(1 - easeOutCubic(Math.max(0, Math.min(1, (p - 0.1) * 1.2)))) * 20}px)` }}>
            <h2 className="mb-3 sm:mb-4 text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100">ファネル遷移推移</h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={funnelSlice}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                <Tooltip />
                {Object.keys(FUNNEL_COLORS).map((key) => (
                  <Area key={key} type="monotone" dataKey={key} stackId="funnel" stroke={FUNNEL_COLORS[key as keyof typeof FUNNEL_COLORS]} fill={FUNNEL_COLORS[key as keyof typeof FUNNEL_COLORS]} fillOpacity={0.6} name={FUNNEL_LABELS[key]} isAnimationActive={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Insight callout with slide-in */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4"
            style={{ opacity: easeOutCubic(Math.max(0, (p - 0.5) * 2)), transform: `translateX(${(1 - easeOutCubic(Math.max(0, Math.min(1, (p - 0.5) * 2)))) * 30}px)` }}>
            <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
              <span className="font-semibold">💡 インサイト: </span>
              イノベーター層（2.5%）が最初の30日で採用を開始し、口コミ効果でアーリーアダプター層に拡散。
              90日目以降、アーリーマジョリティの参入により採用が加速する「キャズム超え」のパターンが観測されます。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Scene 6: CTA — particles + glow */
function CTAScene({ progress }: { progress: number }) {
  const p = easeOutExpo(progress);
  const glowPulse = Math.sin(progress * Math.PI * 4) * 0.5 + 0.5;

  return (
    <div className="relative h-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <ParticleBackground color="blue" density={100} />
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-8 text-center">
        <div style={{ transform: `scale(${0.85 + Math.min(1, p * 1.5) * 0.15})` }}>
          <h2
            className="text-3xl sm:text-4xl lg:text-6xl font-extrabold text-zinc-900 dark:text-zinc-100 mb-6 tracking-tight"
            style={{ opacity: Math.min(1, p * 2.5), filter: `blur(${(1 - Math.min(1, p * 2)) * 3}px)` }}
          >
            あなたのアイデアを、
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 bg-clip-text text-transparent">
              AIエージェントで検証しよう
            </span>
          </h2>
          <p className="text-lg sm:text-xl text-zinc-500 dark:text-zinc-400 mb-10 max-w-xl mx-auto font-light"
            style={{ opacity: easeOutCubic(Math.max(0, (p - 0.2) / 0.8)), transform: `translateY(${(1 - easeOutCubic(Math.max(0, Math.min(1, (p - 0.2) / 0.8)))) * 15}px)` }}>
            1,000人のAIエージェントが消費者行動をシミュレーション。
            <br />
            市場投入前に、採用パターンと収益ポテンシャルを可視化。
          </p>
          <div
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-blue-600 text-white font-semibold text-lg"
            style={{
              opacity: easeOutExpo(Math.max(0, (p - 0.4) / 0.6)),
              transform: `translateY(${(1 - easeOutExpo(Math.max(0, Math.min(1, (p - 0.4) / 0.6)))) * 20}px)`,
              boxShadow: `0 0 ${20 + glowPulse * 30}px rgba(59,130,246,${0.3 + glowPulse * 0.2}), 0 8px 32px rgba(59,130,246,0.2)`,
            }}
          >
            Value Simulator を試す →
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CONTROLLER BAR
// ============================================================

function ControllerBar({ currentScene, currentIndex, totalScenes, sceneProgress, isPlaying, onPlay, onPause, onGoToScene, onRestart }: {
  currentScene: SceneId; currentIndex: number; totalScenes: number; sceneProgress: number;
  isPlaying: boolean; onPlay: () => void; onPause: () => void; onGoToScene: (id: SceneId) => void; onRestart: () => void;
}) {
  const labels: Record<SceneId, string> = { hook: "Hook", input: "入力", analyzing: "生成", results: "結果", deepdive: "詳細", cta: "CTA" };
  return (
    <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
      <div className="flex items-center gap-4 max-w-5xl mx-auto">
        <button onClick={isPlaying ? onPause : onPlay} className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 shrink-0 shadow-lg shadow-blue-600/20">
          {isPlaying ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button onClick={onRestart} className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">↺ 最初から</button>

        <div className="flex-1 flex items-center gap-1.5">
          {SCENE_ORDER.map((id, i) => {
            const isActive = id === currentScene, isPast = i < currentIndex;
            return (
              <button key={id} onClick={() => onGoToScene(id)} className="flex-1 group relative" title={labels[id]}>
                <div className="h-2 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700 transition-all">
                  <div className="h-full rounded-full transition-all duration-150" style={{
                    width: isActive ? `${sceneProgress * 100}%` : isPast ? "100%" : "0%",
                    backgroundColor: isActive ? "#2563eb" : isPast ? "#93c5fd" : "transparent",
                    boxShadow: isActive ? "0 0 8px rgba(37,99,235,0.5)" : "none",
                  }} />
                </div>
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{labels[id]}</span>
              </button>
            );
          })}
        </div>

        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 shrink-0 tabular-nums">{currentIndex + 1}/{totalScenes}</span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE — with crossfade transitions
// ============================================================

export default function PromoPage() {
  const scene = useSceneController();
  const [prevScene, setPrevScene] = useState<SceneId | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(1);
  const prevSceneRef = useRef(scene.currentScene);

  // Detect scene changes for crossfade
  useEffect(() => {
    if (scene.currentScene !== prevSceneRef.current) {
      setPrevScene(prevSceneRef.current);
      setTransitionProgress(0);
      prevSceneRef.current = scene.currentScene;
      let start = 0;
      const animate = (time: number) => {
        if (!start) start = time;
        const elapsed = time - start;
        const p = Math.min(1, elapsed / 400); // 400ms crossfade
        setTransitionProgress(easeOutCubic(p));
        if (p < 1) requestAnimationFrame(animate);
        else setPrevScene(null);
      };
      requestAnimationFrame(animate);
    }
  }, [scene.currentScene]);

  const renderSceneById = (id: SceneId, progress: number) => {
    switch (id) {
      case "hook": return <HookScene progress={progress} />;
      case "input": return <InputScene progress={progress} />;
      case "analyzing": return <AnalyzingScene progress={progress} />;
      case "results": return <ResultsScene progress={progress} />;
      case "deepdive": return <DeepDiveScene progress={progress} />;
      case "cta": return <CTAScene progress={progress} />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-hidden relative">
        {/* Previous scene (fading out) */}
        {prevScene && (
          <div className="absolute inset-0 z-0" style={{ opacity: 1 - transitionProgress, pointerEvents: "none" }}>
            {renderSceneById(prevScene, 1)}
          </div>
        )}
        {/* Current scene (fading in) */}
        <div className="absolute inset-0 z-10" style={{ opacity: prevScene ? transitionProgress : 1 }}>
          {renderSceneById(scene.currentScene, scene.sceneProgress)}
        </div>
      </main>
      <ControllerBar
        currentScene={scene.currentScene} currentIndex={scene.currentIndex}
        totalScenes={scene.totalScenes} sceneProgress={scene.sceneProgress}
        isPlaying={scene.isPlaying} onPlay={scene.play} onPause={scene.pause}
        onGoToScene={scene.goToScene} onRestart={scene.restart}
      />
    </div>
  );
}
