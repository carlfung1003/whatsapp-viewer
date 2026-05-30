"use client";

import { useState } from "react";
import type { ChatRow } from "@/lib/db";

export default function Simulator({ dms }: { dms: ChatRow[] }) {
  const [chatJid, setChatJid] = useState(dms[0]?.jid ?? "");
  const [draft, setDraft] = useState("");
  const [prediction, setPrediction] = useState<string | null>(null);
  const [partner, setPartner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!chatJid || !draft.trim()) return;
    setLoading(true);
    setError(null);
    setPrediction(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_jid: chatJid, draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "failed");
      } else {
        setPrediction(data.prediction);
        setPartner(data.partner_name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Contact</label>
        <select
          value={chatJid}
          onChange={(e) => {
            setChatJid(e.target.value);
            setPrediction(null);
            setPartner(null);
          }}
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
        >
          {dms.map((c) => (
            <option key={c.jid} value={c.jid}>
              {c.name ?? c.jid}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Your draft message</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="Type what you're thinking of sending…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 font-sans resize-y"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={loading || !draft.trim() || !chatJid}
          className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-zinc-100"
        >
          {loading ? "Predicting…" : "Predict their reply"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
      {prediction !== null && (
        <div className="border border-emerald-900 bg-emerald-950/20 rounded-lg p-4">
          <div className="text-xs text-emerald-400 mb-2 uppercase tracking-wide">
            {partner ?? "they"} would probably say
          </div>
          <div className="text-sm text-zinc-100 whitespace-pre-wrap">{prediction}</div>
        </div>
      )}
      <p className="text-[11px] text-zinc-600">
        Uses the last 40 messages with this contact as a voice sample. Not psychic — useful for pre-mortem on risky messages.
      </p>
    </div>
  );
}
