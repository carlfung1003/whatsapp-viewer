"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Topic = {
  topic: string;
  description: string;
  chats: Array<{ chat_jid: string; name: string }>;
};

type ApiResp = {
  generated_at: string;
  days: number;
  topics: Topic[];
  cached: boolean;
};

export default function TopicGraph({ days }: { days: number }) {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, refresh }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "failed");
      else setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded border border-emerald-700 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-800/60 disabled:opacity-50"
        >
          {loading ? "Clustering…" : data ? "↻ Re-cluster" : "✦ Cluster topics"}
        </button>
        {data && (
          <span className="text-xs text-zinc-500">
            {data.cached ? "cached" : "fresh"} · generated{" "}
            {new Date(data.generated_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.topics.map((t, i) => (
            <div key={i} className="border border-zinc-800 rounded-lg bg-zinc-950 p-4">
              <h3 className="text-base font-semibold text-emerald-300 mb-1">{t.topic}</h3>
              <p className="text-xs text-zinc-500 mb-3">{t.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {t.chats.map((c) => (
                  <Link
                    key={c.chat_jid}
                    href={`/chat/${encodeURIComponent(c.chat_jid)}`}
                    className="text-xs px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!data && !loading && (
        <div className="text-center text-sm text-zinc-500 py-16">
          Click cluster to ask Claude to group your recent chats into topics.
        </div>
      )}
    </div>
  );
}
