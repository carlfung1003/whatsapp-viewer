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

export default function Sidebar({ chats, onCollapse }: { chats: ChatRow[]; onCollapse?: () => void }) {
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
    <aside className="md:border-r border-zinc-800 flex flex-col h-full">
      <div className="p-3 border-b border-zinc-800 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="text-sm font-semibold text-zinc-200 hover:text-white truncate">
            WhatsApp viewer
          </Link>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="hidden md:block shrink-0 text-xs px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              title="Hide chat list"
            >
              «
            </button>
          )}
        </div>
        <nav className="flex items-center gap-1 flex-wrap">
          {[
            { href: "/needs-reply", label: "Reply" },
            { href: "/contacts", label: "People" },
            { href: "/drops", label: "Drops" },
            { href: "/iluxury", label: "iLuxury" },
            { href: "/stats", label: "Stats" },
            { href: "/insights", label: "Insights" },
            { href: "/sql", label: "SQL" },
          ].map((nav) => (
            <Link
              key={nav.href}
              href={nav.href}
              className={`text-xs px-2 py-0.5 rounded border ${
                pathname.startsWith(nav.href.split("/").slice(0, 2).join("/"))
                  ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                  : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {nav.label}
            </Link>
          ))}
        </nav>
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
                  {/* Depends on Date.now(): server and client can straddle a minute boundary. */}
                  <span className="shrink-0 text-xs text-zinc-500" suppressHydrationWarning>
                    {relativeTime(c.last_message_time)}
                  </span>
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
