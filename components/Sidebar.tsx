"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowBendUpLeft,
  CaretDoubleLeft,
  ChartBar,
  Database,
  Diamond,
  File,
  Image as ImageIcon,
  MagnifyingGlass,
  Microphone,
  Smiley,
  Sparkle,
  Stack,
  UsersThree,
  VideoCamera,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import type { ChatRow, LastPreview } from "@/lib/db";
import { Avatar, listTime } from "@/components/ui";

const NAV = [
  { href: "/needs-reply", label: "Reply", icon: ArrowBendUpLeft },
  { href: "/contacts", label: "People", icon: UsersThree },
  { href: "/drops", label: "Drops", icon: Stack },
  { href: "/iluxury", label: "iLuxury", icon: Diamond },
  { href: "/stats", label: "Stats", icon: ChartBar },
  { href: "/insights", label: "Insights", icon: Sparkle },
  { href: "/sql", label: "SQL", icon: Database },
];

const MEDIA_LABEL: Record<string, { label: string; icon: typeof ImageIcon }> = {
  image: { label: "Photo", icon: ImageIcon },
  video: { label: "Video", icon: VideoCamera },
  audio: { label: "Voice message", icon: Microphone },
  document: { label: "Document", icon: File },
  sticker: { label: "Sticker", icon: Smiley },
};

function Preview({ p }: { p: LastPreview | null | undefined }) {
  if (!p) return <span className="text-zinc-600">No messages</span>;
  const media = p.media_type ? MEDIA_LABEL[p.media_type] ?? { label: p.media_type, icon: File } : null;
  const who = p.is_from_me ? "You" : p.sender_name;
  return (
    <span className="flex items-center gap-1 min-w-0">
      {who && <span className="shrink-0 text-zinc-400">{who}:</span>}
      {media && <media.icon size={14} className="shrink-0 text-zinc-500" />}
      <span className="truncate">{p.content?.trim() || media?.label || ""}</span>
    </span>
  );
}

export default function Sidebar({ chats, onCollapse }: { chats: ChatRow[]; onCollapse?: () => void }) {
  const [q, setQ] = useState("");
  const pathname = usePathname();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return chats;
    return chats.filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(needle) ||
        c.jid.toLowerCase().includes(needle) ||
        (c.last_preview?.content ?? "").toLowerCase().includes(needle)
    );
  }, [q, chats]);

  return (
    <aside className="md:border-r border-[var(--color-line)] flex flex-col h-full bg-[var(--color-surface)]">
      <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 group min-w-0">
            <span className="grid place-items-center size-8 rounded-[var(--radius-ctl)] bg-emerald-400/15 text-emerald-300">
              <WhatsappLogo size={18} weight="fill" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-100 truncate">Chats</span>
          </Link>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="hidden md:grid place-items-center size-8 rounded-[var(--radius-ctl)] text-zinc-500 hover:text-zinc-100 hover:bg-white/5 transition-colors"
              title="Hide chat list"
              aria-label="Hide chat list"
            >
              <CaretDoubleLeft size={16} />
            </button>
          )}
        </div>

        <label className="relative block">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
          <input
            type="search"
            aria-label="Search chats"
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full h-10 pl-9 pr-9 rounded-[var(--radius-ctl)] bg-[var(--color-surface-2)] border border-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-400/40 focus:bg-[var(--color-surface-3)] transition-colors [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center size-6 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/10"
            >
              <X size={12} />
            </button>
          )}
        </label>

        <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-0.5 pr-6 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href.split("/").slice(0, 2).join("/"));
            return (
              <Link
                key={href}
                href={href}
                className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] transition-colors ${
                  active
                    ? "bg-emerald-400/15 text-emerald-300"
                    : "text-zinc-400 hover:text-zinc-100 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]"
                }`}
              >
                <Icon size={14} weight={active ? "fill" : "regular"} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <ul className="overflow-y-auto flex-1 px-2 pb-3">
        {filtered.map((c) => {
          const href = `/chat/${encodeURIComponent(c.jid)}`;
          const active = pathname === href;
          const name = c.name || c.jid;
          return (
            <li key={c.jid}>
              <Link
                href={href}
                className={`relative flex items-center gap-3 px-2.5 py-2.5 rounded-[12px] transition-colors ${
                  active ? "bg-[var(--color-surface-3)]" : "hover:bg-white/[0.03]"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-emerald-400" />
                )}
                <Avatar name={name} seed={c.jid} group={c.is_group} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-medium text-zinc-100">{name}</span>
                    {/* Depends on Date.now(): server and client can straddle a minute boundary. */}
                    <span className="shrink-0 text-xs text-zinc-500 tabular-nums" suppressHydrationWarning>
                      {listTime(c.last_message_time)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13px] text-zinc-500">
                    <Preview p={c.last_preview} />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-zinc-500">
            Nothing matches <span className="text-zinc-300">&ldquo;{q}&rdquo;</span>
          </li>
        )}
      </ul>
    </aside>
  );
}
