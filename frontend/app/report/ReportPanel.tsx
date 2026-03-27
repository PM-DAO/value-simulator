"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SimulateResponse, SimulateRequest, WhatIfResponse } from "../types";

// ---------- Constants ----------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const MIN_PANEL_WIDTH = 280;
const STORAGE_KEY_PANEL_WIDTH = "vs_report_panel_width";
const STORAGE_KEY_REPORT_CACHE = "vs_report_cache";
const STORAGE_KEY_REPORT_HASH = "vs_report_cache_hash";

// ---------- Helpers ----------

function sampleArray(arr: number[], maxPoints: number): number[] {
  if (arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  const result: number[] = [];
  for (let i = 0; i < arr.length; i += step) {
    result.push(arr[i]);
  }
  // Always include the last element
  if (result[result.length - 1] !== arr[arr.length - 1]) {
    result.push(arr[arr.length - 1]);
  }
  return result;
}

function buildReportRequest(
  result: SimulateResponse,
  lastRequest: SimulateRequest | null,
  whatIfResult: WhatIfResponse | null,
) {
  const rogersBreakdown = result.rogers_breakdown;
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const rogersTotal = rogersBreakdown
    ? {
        innovator: sum(rogersBreakdown.innovator),
        early_adopter: sum(rogersBreakdown.early_adopter),
        early_majority: sum(rogersBreakdown.early_majority),
        late_majority: sum(rogersBreakdown.late_majority),
        laggard: sum(rogersBreakdown.laggard),
      }
    : null;

  const funnelSnapshots = result.daily_funnel_snapshot;
  const funnelLast = funnelSnapshots && funnelSnapshots.length > 0
    ? funnelSnapshots[funnelSnapshots.length - 1]
    : null;

  const whatif = whatIfResult
    ? {
        diff: whatIfResult.diff,
        events: whatIfResult.event_results?.map((e) => e.reasoning).filter(Boolean) ?? [],
        interpretation_reasoning: whatIfResult.interpretation?.delta?.reasoning ?? "",
      }
    : null;

  return {
    service_name: result.service_name,
    description: lastRequest?.description ?? null,
    config: result.config,
    summary: {
      total_adopters: result.summary.total_adopters,
      total_ever_adopted: result.summary.total_ever_adopted ?? result.summary.total_adopters,
      total_churned: result.summary.total_churned ?? 0,
      churn_rate: result.summary.churn_rate ?? 0,
      peak_daily: result.summary.peak_daily,
      adoption_rate: result.summary.adoption_rate,
    },
    odi_score: result.odi_score ?? null,
    odi_label: result.odi_label ?? null,
    sampled_daily_adoption: sampleArray(result.daily_adoption, 100),
    sampled_cumulative_adoption: sampleArray(result.cumulative_adoption, 100),
    sampled_daily_revenue: sampleArray(result.cumulative_revenue ?? [], 100),
    rogers_final: rogersTotal,
    funnel_final: funnelLast,
    request_params: {
      price: lastRequest?.price ?? 0,
      category: lastRequest?.category ?? "saas",
      price_model: lastRequest?.price_model ?? "subscription",
      competition: lastRequest?.competition ?? "none",
      period: lastRequest?.period ?? "3years",
      tam: lastRequest?.tam ?? result.config.tam ?? 0,
      target: lastRequest?.target ?? null,
    },
    whatif,
  };
}

// ---------- Chart Capture ----------

const CHART_PLACEHOLDER_RE = /!\[([^\]]*)\]\(chart:([a-z-]+)\)/g;

export type ChartCaptures = Record<string, string>; // chartId → base64 dataURL

export async function captureAllCharts(
  isDark: boolean,
  onCapture?: (chartId: string, dataUrl: string) => void,
): Promise<ChartCaptures> {
  const { toPng } = await import("html-to-image");
  const captures: ChartCaptures = {};

  const elements = document.querySelectorAll<HTMLElement>("[data-chart-id]");
  for (const el of elements) {
    const chartId = el.getAttribute("data-chart-id");
    if (!chartId) continue;
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: isDark ? "#18181b" : "#ffffff",
        pixelRatio: 2,
      });
      captures[chartId] = dataUrl;
      onCapture?.(chartId, dataUrl);
    } catch {
      // Skip failed captures
    }
  }
  return captures;
}

// Replace chart: placeholders with actual base64 data URLs for markdown export
function resolveChartPlaceholders(markdown: string, captures: ChartCaptures): string {
  return markdown.replace(
    new RegExp(CHART_PLACEHOLDER_RE.source, "g"),
    (match, alt, chartId) => {
      const dataUrl = captures[chartId];
      return dataUrl ? `![${alt}](${dataUrl})` : match;
    },
  );
}

// ---------- Cache helpers ----------

function computeCacheHash(result: SimulateResponse, whatIf: WhatIfResponse | null): string {
  const key = [
    result.service_name,
    result.summary.total_adopters,
    result.summary.adoption_rate,
    result.summary.peak_daily,
    whatIf?.diff?.total_adopters_delta ?? "none",
  ].join("|");
  // Simple hash — good enough for change detection
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return String(h);
}

function loadReportCache(hash: string): string | null {
  try {
    const savedHash = sessionStorage.getItem(STORAGE_KEY_REPORT_HASH);
    if (savedHash !== hash) return null;
    return sessionStorage.getItem(STORAGE_KEY_REPORT_CACHE);
  } catch {
    return null;
  }
}

function saveReportCache(hash: string, text: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY_REPORT_HASH, hash);
    sessionStorage.setItem(STORAGE_KEY_REPORT_CACHE, text);
  } catch { /* storage full — ignore */ }
}

function clearReportCache(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY_REPORT_HASH);
    sessionStorage.removeItem(STORAGE_KEY_REPORT_CACHE);
  } catch { /* ignore */ }
}

// ---------- Report Panel Component ----------

export type ReportPanelProps = {
  simulationResult: SimulateResponse;
  whatIfResult: WhatIfResponse | null;
  lastRequest: SimulateRequest | null;
  isDark: boolean;
  chartCaptures: ChartCaptures;
  onClose: () => void;
};

export function ReportPanel({
  simulationResult,
  whatIfResult,
  lastRequest,
  isDark,
  chartCaptures,
  onClose,
}: ReportPanelProps) {
  const cacheHash = computeCacheHash(simulationResult, whatIfResult);
  const [reportText, setReportText] = useState(() => loadReportCache(cacheHash) ?? "");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const restoredFromCache = useRef(reportText.length > 0);

  // Panel resize state
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return 600;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PANEL_WIDTH);
      if (saved) return Math.max(MIN_PANEL_WIDTH, parseInt(saved, 10));
    } catch { /* ignore */ }
    return Math.round(window.innerWidth * 0.4);
  });
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Save panel width to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PANEL_WIDTH, String(panelWidth));
    } catch { /* ignore */ }
  }, [panelWidth]);

  // Drag resize handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - ev.clientX;
      const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(window.innerWidth * 0.8, dragStartWidth.current + delta));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [panelWidth]);

  // SSE streaming
  const startGeneration = useCallback(async (forceRegenerate = false) => {
    if (forceRegenerate) {
      clearReportCache();
      restoredFromCache.current = false;
    }

    // Abort any in-flight request first
    abortRef.current?.abort();

    setReportText("");
    setError(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = "";

    try {
      const body = buildReportRequest(simulationResult, lastRequest, whatIfResult);
      const response = await fetch(`${API_BASE}/api/report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const chunk = line.slice(6);
            if (chunk === "[DONE]") {
              saveReportCache(cacheHash, accumulated);
              setIsStreaming(false);
              return;
            }
            if (chunk.startsWith("[ERROR]")) {
              setError(chunk.slice(8));
              setIsStreaming(false);
              return;
            }
            // Decode escaped newlines from SSE
            const decoded = chunk.replace(/\\n/g, "\n");
            accumulated += decoded;
            setReportText((prev) => prev + decoded);
          }
        }
      }
      saveReportCache(cacheHash, accumulated);
      setIsStreaming(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message || "レポート生成中にエラーが発生しました");
      setIsStreaming(false);
    }
  }, [simulationResult, lastRequest, whatIfResult, cacheHash]);

  // Auto-start generation on mount (skip if restored from cache)
  useEffect(() => {
    if (!restoredFromCache.current) {
      startGeneration();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Export handlers
  const handleDownloadMd = useCallback(() => {
    const fullText = resolveChartPlaceholders(reportText, chartCaptures);
    const blob = new Blob([fullText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${simulationResult.service_name}-report.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [reportText, chartCaptures, simulationResult.service_name]);

  const handleCopyClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = reportText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  }, [reportText]);

  const handleExportPdf = useCallback(async () => {
    if (!reportContentRef.current) return;
    try {
      const [{ jsPDF }, { toPng }] = await Promise.all([
        import("jspdf"),
        import("html-to-image"),
      ]);
      const element = reportContentRef.current;

      const imgData = await toPng(element, {
        backgroundColor: isDark ? "#18181b" : "#ffffff",
        pixelRatio: 2,
      });

      // Measure rendered image dimensions via a temporary Image
      const img = new Image();
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = imgData; });
      const imgWidth = 190; // A4 width minus margins
      const imgHeight = (img.height * imgWidth) / img.width;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let position = 10;
      const pageHeight = 277; // A4 height minus margins

      // Handle multi-page
      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      } else {
        let remainingHeight = imgHeight;
        while (remainingHeight > 0) {
          pdf.addImage(imgData, "PNG", 10, position - (imgHeight - remainingHeight), imgWidth, imgHeight);
          remainingHeight -= pageHeight;
          if (remainingHeight > 0) {
            pdf.addPage();
            position = 10;
          }
        }
      }

      pdf.save(`${simulationResult.service_name}-report.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    }
  }, [isDark, simulationResult.service_name]);

  const hasContent = reportText.length > 0;

  // Split markdown by chart placeholders and render each part.
  // ReactMarkdown v10 converts data URLs to Blobs internally, so we render
  // chart images as plain <img> elements outside of ReactMarkdown.
  const reportParts = useMemo(() => {
    const parts: { type: "md" | "chart"; content: string; chartId?: string; alt?: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const re = new RegExp(CHART_PLACEHOLDER_RE.source, "g");

    while ((match = re.exec(reportText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "md", content: reportText.slice(lastIndex, match.index) });
      }
      parts.push({ type: "chart", content: match[0], chartId: match[2], alt: match[1] });
      lastIndex = re.lastIndex;
    }
    if (lastIndex < reportText.length) {
      parts.push({ type: "md", content: reportText.slice(lastIndex) });
    }
    return parts;
  }, [reportText]);

  // Track if we're on a large screen (for panel width vs full-screen)
  const [isLg, setIsLg] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)");
    setIsLg(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div
      className="fixed top-0 right-0 h-full z-40 flex"
      style={{ width: isLg ? panelWidth : "100vw" }}
    >
      {/* Drag handle */}
      <div
        className="w-px hover:w-1 bg-zinc-200 dark:bg-zinc-700/60 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize transition-all shrink-0 hidden lg:block"
        onMouseDown={handleDragStart}
      />

      {/* Panel content */}
      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 shadow-2xl min-w-0">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="h-4 w-4 text-zinc-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
              分析レポート
            </h2>
            {isStreaming && (
              <span className="flex items-center gap-1 text-xs text-blue-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                生成中...
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Regenerate */}
            <button
              type="button"
              onClick={() => startGeneration(true)}
              disabled={isStreaming}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              title="再生成"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
            {/* Copy */}
            <button
              type="button"
              onClick={handleCopyClipboard}
              disabled={!hasContent || isStreaming}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              title="クリップボードにコピー"
            >
              {copyFeedback ? (
                <svg className="h-4 w-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
            {/* Download MD */}
            <button
              type="button"
              onClick={handleDownloadMd}
              disabled={!hasContent || isStreaming}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              title=".mdダウンロード"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            {/* PDF */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!hasContent || isStreaming}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              title="PDF出力"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 13h2v4H9z" />
                <path d="M13 13h2" />
                <path d="M13 17h2" />
              </svg>
            </button>
            {/* Close */}
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                onClose();
              }}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors ml-1"
              title="閉じる"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Report content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div ref={reportContentRef} className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 report-prose">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={() => startGeneration(true)}
                  disabled={isStreaming}
                  className="mt-2 text-xs text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 disabled:opacity-30"
                >
                  再試行
                </button>
              </div>
            )}
            {!hasContent && isStreaming && (
              <div className="flex items-center gap-3 text-zinc-400 dark:text-zinc-500">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-2 w-2 rounded-full bg-blue-400 opacity-60"
                      style={{ animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite` }}
                    />
                  ))}
                </div>
                <span className="text-sm">レポートを生成しています...</span>
              </div>
            )}
            {hasContent && reportParts.map((part, i) => {
              if (part.type === "chart") {
                const dataUrl = part.chartId ? chartCaptures[part.chartId] : undefined;
                if (dataUrl) {
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`chart-${i}`}
                      src={dataUrl}
                      alt={part.alt || ""}
                      className="w-full rounded-lg my-4 border border-zinc-200 dark:border-zinc-700 shadow-sm"
                    />
                  );
                }
                return (
                  <div key={`chart-${i}`} className="w-full aspect-[16/9] rounded-lg my-4 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 flex flex-col items-center justify-center gap-2 animate-pulse">
                    <svg className="h-8 w-8 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <polyline points="21 15 16 10 5 21" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                    </svg>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {part.alt || "グラフ"} を取得中...
                    </span>
                  </div>
                );
              }
              return (
                <ReactMarkdown key={`md-${i}`} remarkPlugins={[remarkGfm]}>
                  {part.content}
                </ReactMarkdown>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
