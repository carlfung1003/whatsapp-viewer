"use client";

import { useEffect, useMemo, useState } from "react";

type Sample = { label: string; sql: string };

const SAMPLES: Sample[] = [
  {
    label: "Top 20 most active chats (last 7d)",
    sql: `SELECT c.name, COUNT(*) AS msgs
FROM messages m JOIN chats c ON c.jid = m.chat_jid
WHERE m.timestamp > datetime('now', '-7 days')
GROUP BY c.jid ORDER BY msgs DESC LIMIT 20;`,
  },
  {
    label: "Image bursts (≥10 images / 1-min bucket)",
    sql: `SELECT chat_jid, sender, MIN(timestamp) AS start, COUNT(*) AS n
FROM messages WHERE media_type = 'image'
GROUP BY chat_jid, sender, strftime('%Y%m%d%H%M', timestamp)
HAVING n >= 10 ORDER BY start DESC LIMIT 50;`,
  },
  {
    label: "Reaction emoji frequency (last 30d)",
    sql: `SELECT emoji, COUNT(*) AS n FROM reactions
WHERE timestamp > datetime('now', '-30 days')
GROUP BY emoji ORDER BY n DESC LIMIT 50;`,
  },
  {
    label: "My messages that got reactions",
    sql: `SELECT m.timestamp, m.content, r.emoji, r.reactor
FROM messages m JOIN reactions r ON r.target_id = m.id
WHERE m.is_from_me = 1
ORDER BY m.timestamp DESC LIMIT 50;`,
  },
  {
    label: "Quoted-reply chains (last 7d)",
    sql: `SELECT replied.sender AS reply_sender,
       target.sender AS quoted_sender,
       substr(replied.content, 1, 80) AS reply,
       substr(target.content, 1, 80) AS quoted
FROM messages replied
JOIN messages target ON target.id = replied.quoted_message_id
WHERE replied.timestamp > datetime('now', '-7 days')
LIMIT 50;`,
  },
  {
    label: "Activity heatmap (day-of-week × hour)",
    sql: `SELECT strftime('%w', timestamp) AS dow,
       strftime('%H', timestamp) AS hour,
       COUNT(*) AS n
FROM messages
GROUP BY dow, hour ORDER BY dow, hour;`,
  },
  {
    label: "Find messages mentioning a keyword",
    sql: `SELECT m.timestamp, c.name AS chat, m.sender,
       substr(m.content, 1, 120) AS content
FROM messages m JOIN chats c ON c.jid = m.chat_jid
WHERE m.content LIKE '%keyword%'
ORDER BY m.timestamp DESC LIMIT 50;`,
  },
  {
    label: "Messages by media type",
    sql: `SELECT COALESCE(media_type, 'text') AS type, COUNT(*) AS n
FROM messages GROUP BY type ORDER BY n DESC;`,
  },
  {
    label: "Resolve a LID to a name",
    sql: `SELECT m.lid, m.pn, c.push_name, c.full_name
FROM wa.whatsmeow_lid_map m
LEFT JOIN wa.whatsmeow_contacts c
  ON c.their_jid = m.pn || '@s.whatsapp.net'
WHERE m.lid = '<paste-lid-here>';`,
  },
  {
    label: "Top senders in a chat (last 30d)",
    sql: `SELECT sender, COUNT(*) AS n
FROM messages
WHERE chat_jid = '<paste-chat-jid-here>'
  AND timestamp > datetime('now', '-30 days')
GROUP BY sender ORDER BY n DESC LIMIT 20;`,
  },
];

type Result = {
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  durationMs?: number;
  truncated?: boolean;
  error?: string;
  effectiveQuery?: string;
};

const LS_KEY = "whatsapp-viewer.sql.history";

export default function SqlPlayground() {
  const [query, setQuery] = useState(SAMPLES[0].sql);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setHistory(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = (await res.json()) as Result;
      setResult(json);
      if (!json.error) {
        const trimmed = query.trim();
        setHistory((h) => {
          const next = [trimmed, ...h.filter((q) => q !== trimmed)].slice(0, 20);
          try {
            localStorage.setItem(LS_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    }
  }

  const hasResults = !!result && !result.error && result.rows && result.rows.length > 0;
  const cols = useMemo(() => result?.columns ?? [], [result]);

  return (
    <div className="h-screen grid grid-cols-[280px_1fr]">
      <aside className="border-r border-zinc-800 overflow-y-auto">
        <div className="p-3 border-b border-zinc-800">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500">Sample queries</h2>
        </div>
        <ul className="text-sm">
          {SAMPLES.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => setQuery(s.sql)}
                className="block w-full text-left px-3 py-2 border-b border-zinc-900 hover:bg-zinc-900 text-zinc-300"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        {history.length > 0 && (
          <>
            <div className="p-3 border-b border-zinc-800 border-t mt-2">
              <h2 className="text-xs uppercase tracking-wide text-zinc-500">Recent</h2>
            </div>
            <ul className="text-xs">
              {history.map((q, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setQuery(q)}
                    className="block w-full text-left px-3 py-2 border-b border-zinc-900 hover:bg-zinc-900 text-zinc-400 font-mono truncate"
                    title={q}
                  >
                    {q.split("\n")[0].slice(0, 60)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <div className="flex flex-col overflow-hidden">
        <div className="border-b border-zinc-800 p-3 flex flex-col gap-2">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            className="w-full h-40 bg-zinc-950 border border-zinc-800 rounded p-2 text-sm font-mono focus:outline-none focus:border-zinc-600"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-sm text-white"
            >
              {loading ? "Running…" : "Run"}
            </button>
            <span className="text-xs text-zinc-500">⌘+Enter to run. Read-only DB, hard LIMIT 1000.</span>
            {result?.durationMs !== undefined && (
              <span className="ml-auto text-xs text-zinc-500">
                {result.durationMs}ms
                {result.rowCount !== undefined && ` · ${result.rowCount} rows`}
                {result.truncated && " · truncated"}
              </span>
            )}
          </div>
          {result?.effectiveQuery && (
            <div className="text-xs text-zinc-500 font-mono">
              Effective: <span className="text-zinc-300">{result.effectiveQuery}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {result?.error && (
            <div className="p-4 text-sm text-red-300 bg-red-950/20 m-3 rounded border border-red-900 font-mono whitespace-pre-wrap">
              {result.error}
            </div>
          )}
          {hasResults && (
            <table className="text-xs w-full">
              <thead className="sticky top-0 bg-zinc-950 border-b border-zinc-800">
                <tr>
                  {cols.map((c) => (
                    <th key={c} className="text-left px-3 py-2 font-medium text-zinc-300 border-r border-zinc-900">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result!.rows!.map((row, i) => (
                  <tr key={i} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                    {cols.map((c) => (
                      <td key={c} className="px-3 py-1 align-top border-r border-zinc-900 font-mono">
                        {renderCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!result && (
            <div className="p-4 text-sm text-zinc-500">Pick a sample query and hit Run.</div>
          )}
          {result && !result.error && !hasResults && (
            <div className="p-4 text-sm text-zinc-500">Query returned 0 rows.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 200 ? v.slice(0, 200) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}
