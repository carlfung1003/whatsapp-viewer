"use client";

import { useEffect, useState } from "react";

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
        className="text-xs px-2 py-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200"
        title="Summarize this chat with Claude"
      >
        ✨ Summarize
      </button>
    );
  }

  return (
    <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">AI summary</span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setResult(null);
          }}
          className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
        >
          close
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
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
            className="text-xs px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50"
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
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm focus:outline-none focus:border-zinc-600"
        />
        <button
          type="button"
          onClick={() => run(question)}
          disabled={loading}
          className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-sm text-white"
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>

      {loading && (
        <div className="mt-3 flex items-center gap-3 p-3 rounded border border-emerald-900/60 bg-emerald-950/20">
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute inset-0" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 relative" />
          </div>
          <div className="text-sm text-emerald-200 flex-1">{rotatingMsg}</div>
          <div className="text-[10px] text-zinc-500 font-mono tabular-nums">{elapsed.toFixed(1)}s</div>
        </div>
      )}
      {result?.error && (
        <div className="mt-3 p-3 text-sm text-red-300 bg-red-950/20 rounded border border-red-900 font-mono whitespace-pre-wrap">
          {result.error}
        </div>
      )}
      {result?.summary && (
        <div className="mt-3 text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
          {result.summary}
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
