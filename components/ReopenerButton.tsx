"use client";

import { useState } from "react";

export default function ReopenerButton({ chatJid }: { chatJid: string }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compose() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/compose-reopener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_jid: chatJid }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "failed");
      else setText(data.reopener);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={compose}
          disabled={loading}
          className="text-xs px-2 py-0.5 rounded border border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 disabled:opacity-50"
        >
          {loading ? "Composing…" : text ? "↻ Regenerate" : "✦ Compose re-opener"}
        </button>
        {text && (
          <button
            type="button"
            onClick={copy}
            className="text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      {text && (
        <div className="text-sm text-emerald-100 bg-emerald-950/30 border border-emerald-900 rounded px-3 py-2 whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}
