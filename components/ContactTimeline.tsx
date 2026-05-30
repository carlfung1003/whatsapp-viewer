"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ContactMessageRow } from "@/lib/db";

function shortTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ChatTally = {
  jid: string;
  name: string | null;
  count: number;
  is_group: boolean;
};

export default function ContactTimeline({
  messages,
  chatBreakdown,
}: {
  messages: ContactMessageRow[];
  chatBreakdown: ChatTally[];
}) {
  const [filterJid, setFilterJid] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let rows = messages;
    if (filterJid) rows = rows.filter((m) => m.chat_jid === filterJid);
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((m) => (m.content ?? "").toLowerCase().includes(needle));
    }
    return rows;
  }, [messages, filterJid, q]);

  const byDay = useMemo(() => {
    const map = new Map<string, ContactMessageRow[]>();
    for (const m of filtered) {
      const day = new Date(m.timestamp).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(m);
    }
    return map;
  }, [filtered]);

  return (
    <>
      <div className="sticky top-0 z-10 bg-zinc-950 pt-3 pb-3 border-b border-zinc-900">
      {chatBreakdown.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFilterJid(null)}
            className={`px-2 py-1 rounded border ${
              filterJid === null
                ? "bg-emerald-700/40 border-emerald-700 text-zinc-100"
                : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
            }`}
          >
            All · {messages.length}
          </button>
          {chatBreakdown.map((c) => {
            const active = filterJid === c.jid;
            return (
              <button
                key={c.jid}
                type="button"
                onClick={() => setFilterJid(active ? null : c.jid)}
                title={c.jid}
                className={`px-2 py-1 rounded border ${
                  active
                    ? "bg-emerald-700/40 border-emerald-700 text-zinc-100"
                    : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
                }`}
              >
                {c.is_group ? "👥" : "💬"} {c.name ?? c.jid.slice(0, 12)} · {c.count}
              </button>
            );
          })}
          {filterJid && (
            <Link
              href={`/chat/${encodeURIComponent(filterJid)}`}
              className="ml-auto text-zinc-400 hover:text-zinc-200 underline decoration-dotted"
            >
              open this chat ↗
            </Link>
          )}
        </div>
      )}

      <div className="mt-3">
        <input
          type="search"
          placeholder="Search this contact's messages…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm focus:outline-none focus:border-zinc-600"
        />
        {(q || filterJid) && (
          <div className="mt-1 text-[10px] text-zinc-500">
            Showing {filtered.length} of {messages.length} messages
          </div>
        )}
      </div>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">
            No messages match the current filter.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Array.from(byDay.entries()).map(([day, msgs]) => (
              <div key={day}>
                <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2 sticky top-0 bg-zinc-950 py-1">
                  {day}
                </div>
                <ul className="flex flex-col gap-2">
                  {msgs.map((m) => (
                    <li
                      key={`${m.chat_jid}-${m.id}`}
                      className="rounded border border-zinc-800 bg-zinc-900 p-3"
                    >
                      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                        <Link
                          href={`/chat/${encodeURIComponent(m.chat_jid)}`}
                          className="hover:text-emerald-400 truncate"
                        >
                          {m.is_group ? "👥" : "💬"} {m.chat_name ?? m.chat_jid}
                        </Link>
                        <span className="shrink-0 ml-2">{shortTime(m.timestamp)}</span>
                      </div>
                      {m.media_type ? (
                        <div className="text-xs text-zinc-400">[{m.media_type}]</div>
                      ) : null}
                      {m.content && (
                        <div className="text-sm text-zinc-200 whitespace-pre-wrap break-words">
                          {m.content}
                        </div>
                      )}
                      {m.reactions.length > 0 && (
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {m.reactions.map((r, i) => (
                            <span key={i} className="mr-1">
                              {r.emoji} <span className="text-zinc-600">({r.reactor_name})</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
