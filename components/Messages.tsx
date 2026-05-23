"use client";

import { useMemo, useState } from "react";
import type { MessageRow, Drop } from "@/lib/db";

function shortTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ m }: { m: MessageRow }) {
  const mine = !!m.is_from_me;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] rounded-lg px-3 py-2 ${
          mine ? "bg-emerald-900/40 border border-emerald-800" : "bg-zinc-900 border border-zinc-800"
        }`}
      >
        {!mine && <div className="text-xs font-medium text-emerald-400 mb-1">{m.sender_name}</div>}

        {m.quoted_message_id && (
          <div className="mb-1 border-l-2 border-zinc-600 pl-2 text-xs text-zinc-400">
            <div className="font-medium text-zinc-300">{m.quoted_sender_name ?? "?"}</div>
            <div className="truncate">{m.quoted_preview ?? `(msg ${m.quoted_message_id.slice(0, 8)}…)`}</div>
          </div>
        )}

        {m.media_type === "image" ? (
          <ImageTile chatJid={m.chat_jid} messageId={m.id} />
        ) : m.media_type ? (
          <div className="text-xs text-zinc-400 mb-1">
            [{m.media_type}
            {m.filename ? ` · ${m.filename}` : ""}]
          </div>
        ) : null}

        {m.content && <div className="whitespace-pre-wrap text-sm break-words">{m.content}</div>}

        <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
          <span>{shortTime(m.timestamp)}</span>
          {m.reactions.length > 0 && (
            <span className="text-zinc-300">
              {m.reactions.map((r, i) => (
                <span key={i} className="ml-1">
                  {r.emoji}
                  <span className="text-zinc-500 ml-0.5">({r.reactor_name})</span>
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

type TileState = "idle" | "loading" | "loaded" | "expired" | "error";

function ImageTile({
  chatJid,
  messageId,
  small = false,
  claimed = false,
}: {
  chatJid: string;
  messageId: string;
  small?: boolean;
  claimed?: boolean;
}) {
  const [state, setState] = useState<TileState>("idle");
  // ?v=2 busts browser cache entries written before the filename-collision fix
  // (2026-05-22), when many URLs were cached pointing to the same bytes.
  const src = `/api/media/${encodeURIComponent(chatJid)}/${encodeURIComponent(messageId)}?v=2`;

  const size = small
    ? "aspect-square text-[8px]"
    : "max-w-[280px] max-h-[280px] aspect-square";

  async function load() {
    if (state !== "idle") return;
    setState("loading");
    try {
      const res = await fetch(src);
      if (res.ok) {
        setState("loaded");
        return;
      }
      if (res.status === 410) setState("expired");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  if (state === "expired") {
    return (
      <div
        title={`${messageId} — WhatsApp purged this media from their CDN (older than ~30-45 days)`}
        className={`${size} rounded border bg-zinc-900/40 border-zinc-800 flex flex-col items-center justify-center text-[9px] text-zinc-500 font-mono overflow-hidden`}
      >
        <span>expired</span>
        <span className="text-zinc-600">{messageId.slice(0, 4)}</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        title={messageId}
        className={`${size} rounded border bg-red-950/30 border-red-900 flex items-center justify-center text-[10px] text-red-300 font-mono overflow-hidden`}
      >
        err {messageId.slice(0, 4)}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={load}
      title={messageId}
      className={`${size} relative rounded border ${
        claimed ? "bg-emerald-900/30 border-emerald-700" : "bg-zinc-900 border-zinc-800"
      } flex items-center justify-center text-[10px] text-zinc-500 font-mono overflow-hidden hover:border-zinc-500`}
    >
      {state === "loaded" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={messageId}
          className="w-full h-full object-cover"
          onError={() => setState("error")}
        />
      ) : state === "loading" ? (
        <span className="text-zinc-400">…</span>
      ) : (
        <span>{messageId.slice(0, 4)}</span>
      )}
    </button>
  );
}

export function MessageList({ messages }: { messages: MessageRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter((m) => {
      if (m.content && m.content.toLowerCase().includes(needle)) return true;
      if (m.sender_name.toLowerCase().includes(needle)) return true;
      if (m.media_type && m.media_type.toLowerCase().includes(needle)) return true;
      return false;
    });
  }, [q, messages]);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-4 py-2">
        <input
          type="search"
          placeholder="Search in this chat…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm focus:outline-none focus:border-zinc-600"
        />
        {q && (
          <div className="mt-1 text-[10px] text-zinc-500">
            {filtered.length} of {messages.length} match
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        {filtered.map((m) => (
          <MessageBubble key={`${m.chat_jid}-${m.id}`} m={m} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-zinc-500 py-8">No messages match “{q}”.</div>
        )}
      </div>
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
    <div className="bg-zinc-900/40 border-b border-zinc-800 px-4 py-3">
      <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
        Image drops in this window ({drops.length})
      </h2>
      <div className="flex flex-col gap-3">
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
            <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2 text-xs text-zinc-400">
                <div>
                  <span className="text-zinc-200 font-medium">{d.sender_name}</span>
                  <span className="ml-2">
                    {shortTime(d.start)} → {shortTime(d.end)}
                  </span>
                </div>
                <div className="flex gap-3">
                  <span>{d.message_ids.length} items</span>
                  <span>{reactionCount} reactions</span>
                  <span>{quotedReplyCount} quoted replies</span>
                </div>
              </div>
              <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1">
                {d.message_ids.map((id) => {
                  const msg = messagesById.get(id);
                  const claimed = !!(msg && msg.reactions.length > 0);
                  return <ImageTile key={id} chatJid={chatJid} messageId={id} small claimed={claimed} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
