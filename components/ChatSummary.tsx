"use client";

import { useEffect, useState } from "react";
import Markdown from "@/components/Markdown";
import { Sparkle, X } from "@phosphor-icons/react";

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type Result = {
  summary?: string;
  model?: string;
  message_count?: number;
  usage?: Usage;
  error?: string;
};

const QUICK_PROMPTS = [
  "Default summary",
  "What needs my reply?",
  "List every decision made",
  "Surface action items only",
];

const DEFAULT_PROMPT = "";

const LOADING_MESSAGES = [
  "Reading the chat…",
  "AI working hard…",
  "Looking for patterns…",
  "Sorting through reactions…",
  "Resolving who said what…",
  "Picking out what matters…",
  "Writing it up…",
  "Almost there…",
];

function useRotatingMessage(active: boolean, intervalMs = 1800) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    setI(0);
    const id = setInterval(() => setI((n) => (n + 1) % LOADING_MESSAGES.length), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return LOADING_MESSAGES[i];
}

export default function ChatSummary({ chatJid }: { chatJid: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const rotatingMsg = useRotatingMessage(loading);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 100) / 10), 200);
    return () => clearInterval(id);
  }, [loading]);

  async function run(q: string) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_jid: chatJid,
          question: q || undefined,
        }),
      });
      const json = (await res.json()) as Result;
      setResult(json);
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-ctl)] text-sm font-medium text-emerald-200 bg-emerald-400/15 hover:bg-emerald-400/25 active:scale-[0.97] transition"
        title="Summarize this chat with Claude"
      >
        <Sparkle size={15} weight="fill" />
        <span className="hidden sm:inline">Summarize</span>
      </button>
    );
  }

  return (
    <div className="basis-full order-last min-w-0 mt-2 rounded-[14px] bg-[var(--color-surface)] ring-1 ring-inset ring-white/5 p-3 md:p-4 animate-pop">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-200">
          <Sparkle size={15} weight="fill" className="text-emerald-300" />
          Ask about this chat
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResult(null);
          }}
          aria-label="Close summary"
          className="ml-auto grid place-items-center size-8 rounded-full text-zinc-500 hover:text-zinc-100 hover:bg-white/5"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              const q = p === "Default summary" ? "" : p;
              setQuestion(q);
              run(q);
            }}
            disabled={loading}
            className="text-[13px] h-8 px-3 rounded-full bg-[var(--color-surface-2)] text-zinc-300 hover:bg-[var(--color-surface-3)] hover:text-zinc-100 disabled:opacity-50 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(question);
          }}
          placeholder="Or ask anything specific…"
          className="flex-1 min-w-0 h-10 px-3 rounded-[var(--radius-ctl)] bg-[var(--color-surface-2)] border border-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-400/40"
        />
        <button
          type="button"
          onClick={() => run(question)}
          disabled={loading}
          className="h-10 px-4 rounded-[var(--radius-ctl)] bg-emerald-400 hover:bg-emerald-300 active:scale-[0.97] disabled:opacity-50 text-sm font-medium text-emerald-950 transition"
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-3 p-3 rounded-[var(--radius-ctl)] bg-emerald-400/[0.06] ring-1 ring-inset ring-emerald-400/15">
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute inset-0" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 relative" />
          </div>
          <div className="text-sm text-emerald-200 flex-1">{rotatingMsg}</div>
          <div className="text-[10px] text-zinc-500 font-mono tabular-nums">{elapsed.toFixed(1)}s</div>
        </div>
      )}
      {result?.error && (
        <div className="mt-3 p-3 text-sm text-red-200 bg-red-500/10 rounded-[var(--radius-ctl)] ring-1 ring-inset ring-red-500/25 whitespace-pre-wrap">
          {result.error}
        </div>
      )}
      {result?.summary && (
        <div className="mt-3 max-h-[50dvh] overflow-y-auto pr-1 text-sm text-zinc-200 leading-relaxed">
          <Markdown>{result.summary}</Markdown>
          {result.usage && (
            <div className="mt-3 text-[10px] text-zinc-500">
              {result.model} · {result.message_count} messages ·{" "}
              {result.usage.input_tokens} in / {result.usage.output_tokens} out
              {result.usage.cache_creation_input_tokens
                ? ` · ${result.usage.cache_creation_input_tokens} cached (write)`
                : ""}
              {result.usage.cache_read_input_tokens
                ? ` · ${result.usage.cache_read_input_tokens} cache hit`
                : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
