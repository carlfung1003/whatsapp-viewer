"use client";

import { useState } from "react";

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

export default function ChatSummary({ chatJid }: { chatJid: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

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
