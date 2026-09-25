"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowsDownUp,
  ArrowBendUpLeft,
  File,
  ImageBroken,
  MagnifyingGlass,
  Microphone,
  Stack,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import type { MessageRow, Drop } from "@/lib/db";
import { dayLabel, senderColor } from "@/components/ui";

const ORDER_KEY = "whatsapp-viewer.message-order";
const GROUP_GAP_MS = 5 * 60_000;
const CDN_RETENTION_MS = 30 * 86_400_000;

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function shortTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/* ---------- Lightbox ---------- */

function Lightbox({ src, caption, onClose }: { src: string; caption: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4 animate-fade"
    >
      <button
        onClick={onClose}
        aria-label="Close image"
        className="absolute top-4 right-4 grid place-items-center size-10 rounded-full bg-white/10 text-zinc-100 hover:bg-white/20"
      >
        <X size={18} />
      </button>
      <figure onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-3 animate-pop">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption} className="max-h-[85dvh] max-w-[92vw] rounded-[12px] object-contain shadow-2xl" />
        <figcaption className="text-xs text-zinc-400">{caption}</figcaption>
      </figure>
    </div>
  );
}

/* ---------- Image tile ---------- */

type TileState = "loading" | "loaded" | "purged" | "unavailable";

export function ImageTile({
  chatJid,
  messageId,
  small = false,
  claimed = false,
  sticker = false,
  timestamp,
  caption,
}: {
  chatJid: string;
  messageId: string;
  small?: boolean;
  claimed?: boolean;
  sticker?: boolean;
  timestamp?: string;
  caption?: string;
}) {
  const [state, setState] = useState<TileState>("loading");
  const [open, setOpen] = useState(false);
  // ?v=2 busts browser cache entries written before the filename-collision fix
  // (2026-05-22), when many URLs were cached pointing to the same bytes.
  const src = `/api/media/${encodeURIComponent(chatJid)}/${encodeURIComponent(messageId)}?v=2`;
  const close = useCallback(() => setOpen(false), []);

  const box = sticker
    ? "size-36 rounded-[12px]"
    : small
      ? "aspect-square w-full rounded-[8px]"
      : "w-[min(280px,70vw)] aspect-[4/3] rounded-[12px]";

  // Decided on error (not during render): old media is gone from WhatsApp's CDN.
  function onError() {
    const old = !!timestamp && Date.now() - new Date(timestamp).getTime() > CDN_RETENTION_MS;
    setState(old ? "purged" : "unavailable");
  }

  if (state === "purged" || state === "unavailable") {
    const purged = state === "purged";
    return (
      <div
        title={
          purged
            ? "WhatsApp no longer keeps this image (older than about 30 days)"
            : "Couldn't load this image. The WhatsApp bridge may be offline."
        }
        className={`${box} grid place-items-center bg-white/[0.03] ring-1 ring-inset ring-white/5 text-zinc-600`}
      >
        <div className="flex flex-col items-center gap-1">
          <ImageBroken size={small ? 14 : 22} />
          {!small && <span className="text-[11px]">{purged ? "No longer on WhatsApp" : "Couldn't load"}</span>}
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => state === "loaded" && setOpen(true)}
        aria-label="Open image"
        className={`${box} relative overflow-hidden block ${state === "loading" ? "skeleton" : sticker ? "" : "bg-[var(--color-surface-2)]"} ${
          claimed ? "ring-2 ring-emerald-400/70" : sticker ? "" : "ring-1 ring-inset ring-white/5"
        } transition-transform hover:scale-[1.02] active:scale-[0.98]`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption ?? (sticker ? "Sticker" : "Photo")}
          loading="lazy"
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={onError}
          className={`size-full ${sticker ? "object-contain" : "object-cover"} transition-opacity duration-300 ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      </button>
      {open && <Lightbox src={src} caption={caption ?? (timestamp ? shortTime(timestamp) : "")} onClose={close} />}
    </>
  );
}

/* ---------- Bubble ---------- */

const MEDIA_ICON: Record<string, typeof File> = { video: VideoCamera, audio: Microphone, document: File };

function MessageBubble({ m, first, isGroup }: { m: MessageRow; first: boolean; isGroup: boolean }) {
  const mine = !!m.is_from_me;
  const Icon =
    m.media_type && m.media_type !== "image" && m.media_type !== "sticker" ? MEDIA_ICON[m.media_type] ?? File : null;
  const reactionGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of m.reactions) map.set(r.emoji, [...(map.get(r.emoji) ?? []), r.reactor_name]);
    return [...map.entries()];
  }, [m.reactions]);

  if (m.media_type === "sticker") {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-1"} animate-rise`}>
        <div className={`flex flex-col ${mine ? "items-end" : "items-start"} gap-1`}>
          {!mine && first && isGroup && (
            <span className="text-[13px] font-medium px-1" style={{ color: senderColor(m.sender) }}>
              {m.sender_name}
            </span>
          )}
          <ImageTile chatJid={m.chat_jid} messageId={m.id} timestamp={m.timestamp} sticker />
          <span className="px-2 h-5 inline-flex items-center rounded-full bg-black/40 text-[11px] text-zinc-400 tabular-nums">
            {clock(m.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-0.5"} animate-rise`}>
      <div className={`flex flex-col ${mine ? "items-end" : "items-start"} max-w-[85%] md:max-w-[68%]`}>
        <div
          className={`relative px-3 pt-2 pb-1.5 rounded-[var(--radius-bubble)] ${
            mine
              ? `bg-[var(--color-mine)] ring-1 ring-inset ring-[var(--color-mine-line)] ${first ? "rounded-tr-[6px]" : ""}`
              : `bg-[var(--color-surface-2)] ring-1 ring-inset ring-white/5 ${first ? "rounded-tl-[6px]" : ""}`
          }`}
        >
          {!mine && first && isGroup && (
            <Link
              href={`/contact/${encodeURIComponent(m.sender.replace(/@.*/, ""))}`}
              className="block text-[13px] font-medium mb-0.5 hover:underline"
              style={{ color: senderColor(m.sender) }}
            >
              {m.sender_name}
            </Link>
          )}

          {m.quoted_message_id && (
            <div className="mb-1.5 rounded-[8px] bg-black/25 border-l-[3px] border-emerald-400/60 px-2.5 py-1.5 text-[13px]">
              <div className="flex items-center gap-1 font-medium text-emerald-300/90">
                <ArrowBendUpLeft size={12} />
                {m.quoted_sender_name ?? "Reply"}
              </div>
              <div className="text-zinc-400 line-clamp-2">
                {m.quoted_preview ?? "Original message not in this window"}
              </div>
            </div>
          )}

          {m.media_type === "image" && (
            <div className="-mx-1.5 mb-1">
              <ImageTile chatJid={m.chat_jid} messageId={m.id} timestamp={m.timestamp} caption={m.content ?? undefined} />
            </div>
          )}

          {Icon && (
            <div className="mb-1 flex items-center gap-2 rounded-[8px] bg-black/25 px-2.5 py-2 text-[13px] text-zinc-300">
              <Icon size={16} className="shrink-0 text-zinc-400" />
              <span className="truncate">{m.filename ?? m.media_type}</span>
            </div>
          )}

          {m.content && (
            <span className="whitespace-pre-wrap break-words text-[15px] leading-[1.4] text-zinc-100">{m.content}</span>
          )}
          <span className="float-right ml-3 mt-1.5 translate-y-0.5 text-[11px] text-zinc-500 tabular-nums">
            {clock(m.timestamp)}
          </span>
        </div>

        {reactionGroups.length > 0 && (
          <div className={`-mt-1.5 ${mine ? "mr-2" : "ml-2"} flex gap-1 relative z-[1]`}>
            {reactionGroups.map(([emoji, names]) => (
              <span
                key={emoji}
                title={names.join(", ")}
                className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-surface-3)] ring-1 ring-[var(--background)] text-[13px]"
              >
                {emoji}
                {names.length > 1 && <span className="text-[11px] text-zinc-400 tabular-nums">{names.length}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- List ---------- */

export function MessageList({ messages, isGroup = true }: { messages: MessageRow[]; isGroup?: boolean }) {
  const [q, setQ] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  // Restore order preference once on mount
  useEffect(() => {
    try {
      const v = localStorage.getItem(ORDER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
      if (v === "oldest") setNewestFirst(false);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleOrder() {
    setNewestFirst((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(ORDER_KEY, next ? "newest" : "oldest");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = !needle
      ? messages
      : messages.filter((m) => {
          if (m.content && m.content.toLowerCase().includes(needle)) return true;
          if (m.sender_name.toLowerCase().includes(needle)) return true;
          if (m.media_type && m.media_type.toLowerCase().includes(needle)) return true;
          return false;
        });
    // `messages` arrives chronological ascending (oldest first). Reverse if showing newest first.
    return newestFirst ? [...matched].reverse() : matched;
  }, [q, messages, newestFirst]);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 bg-[var(--background)]/80 backdrop-blur-md px-4 py-2.5 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2">
          <label className="relative flex-1">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="search"
              aria-label="Search in this chat"
              placeholder="Search in this chat"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-[var(--radius-ctl)] bg-[var(--color-surface-2)] text-sm text-zinc-100 placeholder:text-zinc-500 border border-transparent focus:outline-none focus:border-emerald-400/40 transition-colors"
            />
          </label>
          <button
            type="button"
            onClick={toggleOrder}
            title={newestFirst ? "Newest first. Click for oldest first." : "Oldest first. Click for newest first."}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-ctl)] text-sm text-zinc-300 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] active:scale-[0.97] transition"
          >
            <ArrowsDownUp size={15} />
            {newestFirst ? "Newest" : "Oldest"}
          </button>
        </div>
        {q && (
          <div className="mt-1.5 text-xs text-zinc-500">
            {filtered.length} of {messages.length} messages match
          </div>
        )}
      </div>

      <div className="px-3 md:px-6 pb-8 pt-1">
        {filtered.map((m, i) => {
          const prev = filtered[i - 1];
          const newDay = !prev || dayKey(prev.timestamp) !== dayKey(m.timestamp);
          const first =
            newDay ||
            prev.sender !== m.sender ||
            Math.abs(new Date(prev.timestamp).getTime() - new Date(m.timestamp).getTime()) > GROUP_GAP_MS;
          return (
            <Fragment key={`${m.chat_jid}-${m.id}`}>
              {newDay && (
                <div className="sticky top-[57px] z-[5] flex justify-center py-3 pointer-events-none">
                  <span className="px-3 h-7 inline-flex items-center rounded-full bg-[var(--color-surface-3)]/90 backdrop-blur text-xs font-medium text-zinc-300 ring-1 ring-white/5" suppressHydrationWarning>
                    {dayLabel(m.timestamp)}
                  </span>
                </div>
              )}
              <MessageBubble m={m} first={first} isGroup={isGroup} />
            </Fragment>
          );
        })}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-zinc-500">
            <MagnifyingGlass size={28} />
            <span className="text-sm">
              No messages match <span className="text-zinc-300">&ldquo;{q}&rdquo;</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Drops ---------- */

const DROP_PREVIEW = 15;

function DropGrid({
  ids,
  chatJid,
  messagesById,
}: {
  ids: string[];
  chatJid: string;
  messagesById: Map<string, MessageRow>;
}) {
  const [all, setAll] = useState(false);
  const shown = all || ids.length <= DROP_PREVIEW ? ids : ids.slice(0, DROP_PREVIEW - 1);
  const hidden = ids.length - shown.length;
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {shown.map((id) => {
        const msg = messagesById.get(id);
        const claimed = !!(msg && msg.reactions.length > 0);
        return <ImageTile key={id} chatJid={chatJid} messageId={id} small claimed={claimed} timestamp={msg?.timestamp} />;
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="aspect-square rounded-[8px] grid place-items-center bg-[var(--color-surface-3)] text-sm font-medium text-zinc-200 hover:bg-emerald-400/15 hover:text-emerald-200 transition-colors"
        >
          +{hidden}
        </button>
      )}
    </div>
  );
}

export function DropsBanner({
  drops,
  messages,
  chatJid,
}: {
  drops: Drop[];
  messages: MessageRow[];
  chatJid: string;
}) {
  if (drops.length === 0) return null;
  const messagesById = new Map(messages.map((m) => [m.id, m] as const));
  return (
    <section className="px-3 md:px-6 pt-4">
      <div className="flex items-center gap-2 mb-2.5 text-sm font-medium text-zinc-300">
        <Stack size={16} className="text-emerald-300" />
        {drops.length === 1 ? "1 image drop" : `${drops.length} image drops`} in this window
      </div>
      <div className="flex gap-3 overflow-x-auto snap-x pb-2 -mx-1 px-1">
        {drops.map((d, i) => {
          let reactionCount = 0;
          for (const id of d.message_ids) {
            const msg = messagesById.get(id);
            if (msg) reactionCount += msg.reactions.length;
          }
          const idSet = new Set(d.message_ids);
          let quotedReplyCount = 0;
          for (const m of messagesById.values()) {
            if (m.quoted_message_id && idSet.has(m.quoted_message_id)) quotedReplyCount++;
          }
          return (
            <article
              key={i}
              className="snap-start shrink-0 w-[min(420px,85vw)] rounded-[14px] bg-[var(--color-surface)] ring-1 ring-inset ring-white/5 p-3"
            >
              <header className="flex items-baseline justify-between gap-2 mb-2.5">
                <span className="text-sm font-medium text-zinc-100 truncate">{d.sender_name}</span>
                <span className="text-xs text-zinc-500 shrink-0">{shortTime(d.start)}</span>
              </header>
              <DropGrid ids={d.message_ids} chatJid={chatJid} messagesById={messagesById} />
              <footer className="mt-2.5 flex gap-3 text-xs text-zinc-500 tabular-nums">
                <span>{d.message_ids.length} items</span>
                <span className={reactionCount ? "text-emerald-300" : ""}>{reactionCount} reactions</span>
                <span>{quotedReplyCount} replies</span>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
