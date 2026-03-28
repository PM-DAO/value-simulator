"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "../i18n-context";
import type { SimulateResponse, SimulateRequest, AutoResponse, WhatIfResponse } from "../types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  category?: string;
};

type ChatContext = {
  simulationResult: SimulateResponse | null;
  lastRequest: SimulateRequest | null;
  inferredParams: AutoResponse["inferred_params"] | null;
  whatIfResult: WhatIfResponse | null;
  description: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white rounded-br-md whitespace-pre-wrap"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-md"
        }`}
      >
        {isUser ? (
          msg.content
        ) : (
          <div className="chat-markdown prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-code:text-xs prose-code:bg-zinc-200 prose-code:dark:bg-zinc-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
        {!isUser && msg.category && (
          <span className="block mt-1.5 text-[10px] opacity-50">
            {msg.category}
          </span>
        )}
      </div>
    </div>
  );
}

export function ChatFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all hover:scale-105 active:scale-95"
      aria-label="AI Chat"
    >
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}

export function ChatPanel({
  open,
  onClose,
  context,
}: {
  open: boolean;
  onClose: () => void;
  context: ChatContext;
}) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"idle" | "routing" | "building_context">("idle");
  const [canSend, setCanSend] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = [
    t("chat.suggest.interpret"),
    t("chat.suggest.bass"),
    t("chat.suggest.improve"),
    t("chat.suggest.usage"),
  ];

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = async (directText?: string) => {
    const el = inputRef.current;
    const text = directText?.trim() || el?.value.trim() || "";
    if (!text || status !== "idle") return;

    // Clear input by remounting textarea
    setCanSend(false);
    setInputKey((k) => k + 1);

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setStatus("routing");

    // Progress to building_context after delay (cleared when streaming starts)
    const t1 = setTimeout(() => setStatus("building_context"), 1500);

    try {
      const body = {
        message: text,
        locale,
        history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        simulation_result: context.simulationResult
          ? {
              service_name: context.simulationResult.service_name,
              config: context.simulationResult.config,
              summary: context.simulationResult.summary,
              odi_score: context.simulationResult.odi_score,
              odi_label: context.simulationResult.odi_label,
              rogers_breakdown: context.simulationResult.rogers_breakdown,
              daily_revenue: context.simulationResult.daily_revenue?.slice(-5),
              cumulative_revenue: context.simulationResult.cumulative_revenue
                ? [context.simulationResult.cumulative_revenue[context.simulationResult.cumulative_revenue.length - 1]]
                : null,
            }
          : null,
        user_input: context.lastRequest
          ? { ...context.lastRequest, description: context.description }
          : null,
        inferred_params: context.inferredParams,
        whatif_result: context.whatIfResult
          ? {
              diff: context.whatIfResult.diff,
              interpretation: context.whatIfResult.interpretation,
            }
          : null,
      };

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let category = "simulation_results";
      let firstEvent = true;
      let streamedContent = "";

      // Add empty assistant message to fill incrementally
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);

          if (payload === "[DONE]") break;
          if (payload.startsWith("[ERROR]")) {
            const errText = payload.slice(8);
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: errText };
              return updated;
            });
            break;
          }

          // First event is JSON metadata with category
          if (firstEvent) {
            try {
              const meta = JSON.parse(payload);
              if (meta.category) category = meta.category;
            } catch {
              // not JSON, treat as text
              streamedContent += payload.replace(/\\n/g, "\n");
            }
            firstEvent = false;
            clearTimeout(t1);
            setStatus("idle");
            continue;
          }

          // Subsequent events are text chunks
          streamedContent += payload.replace(/\\n/g, "\n");
          const current = streamedContent;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: current };
            return updated;
          });
        }
      }

      // Finalize with category label
      const categoryKey = `chat.category.${category}`;
      const finalContent = streamedContent;
      const finalCategory = t(categoryKey);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: finalContent, category: finalCategory };
        return updated;
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Unknown error";
      setMessages((prev) => {
        // Replace last message if it's the empty streaming placeholder, otherwise append
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: t("chat.error").replace("{message}", errMsg) };
          return updated;
        }
        return [...prev, { role: "assistant", content: t("chat.error").replace("{message}", errMsg) }];
      });
    } finally {
      clearTimeout(t1);
      setStatus("idle");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-[70] h-full w-full sm:w-[400px] bg-white dark:bg-zinc-900 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t("chat.title")}
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {t("chat.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                title={t("chat.newChat")}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 mb-4">
                <svg className="h-8 w-8 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                {t("chat.empty.title")}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
                {t("chat.empty.subtitle")}
              </p>
              <div className="space-y-2">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendMessage(q)}
                    className="block w-full text-left rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatBubble key={i} msg={msg} />
          ))}

          {status !== "idle" && (
            <div className="flex justify-start mb-3">
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2.5">
                <svg className="h-4 w-4 text-blue-500 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} opacity={0.25} />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
                </svg>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 transition-all duration-300">
                  {status === "routing" && t("chat.status.routing")}
                  {status === "building_context" && t("chat.status.building_context")}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-700 p-3">
          <div className="flex items-end gap-2">
            <textarea
              key={inputKey}
              ref={inputRef}
              defaultValue=""
              onChange={(e) => setCanSend(e.target.value.trim().length > 0)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.placeholder")}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ maxHeight: 120 }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!canSend || status !== "idle"}
              className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
