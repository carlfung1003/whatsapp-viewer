"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import type { ChatRow } from "@/lib/db";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export default function Sidebar({ chats }: { chats: ChatRow[] }) {
  const [q, setQ] = useState("");
  const pathname = usePathname();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return chats;
    return chats.filter(
      (c) => (c.name ?? "").toLowerCase().includes(needle) || c.jid.toLowerCase().includes(needle)
    );
  }, [q, chats]);

  return (
    <aside className="border-r border-zinc-800 flex flex-col h-screen">
      <div className="p-3 border-b border-zinc-800 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-zinc-200 hover:text-white">
            WhatsApp viewer
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/drops"
              className={`text-xs px-2 py-0.5 rounded border ${
                pathname.startsWith("/drops")
                  ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                  : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Drops
            </Link>
            <Link
              href="/stats"
              className={`text-xs px-2 py-0.5 rounded border ${
                pathname.startsWith("/stats")
                  ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                  : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Stats
            </Link>
            <Link
              href="/sql"
              className={`text-xs px-2 py-0.5 rounded border ${
                pathname.startsWith("/sql")
                  ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                  : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              SQL
            </Link>
          </div>
        </div>
        <input
          type="search"
          placeholder="Search chats…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm focus:outline-none focus:border-zinc-600"
        />
      </div>
      <ul className="overflow-y-auto flex-1">
        {filtered.map((c) => {
          const href = `/chat/${encodeURIComponent(c.jid)}`;
          const active = pathname === href;
          return (
            <li key={c.jid}>
              <Link
                href={href}
                className={`block px-3 py-2 border-b border-zinc-900 hover:bg-zinc-900 ${
                  active ? "bg-zinc-900" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-200">
                    {c.name || c.jid}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{relativeTime(c.last_message_time)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{c.is_group ? "group" : "dm"}</span>
                  <span>·</span>
                  <span>{c.message_count.toLocaleString()} msgs</span>
                </div>
              </Link>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">No chats match “{q}”.</li>
        )}
      </ul>
    </aside>
  );
}
