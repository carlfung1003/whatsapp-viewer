"use client";

import { useState } from "react";
import type { ChatRow } from "@/lib/db";

export default function SnapshotPicker({ chats }: { chats: ChatRow[] }) {
  const [chatJid, setChatJid] = useState(chats[0]?.jid ?? "");
  const [cacheBust, setCacheBust] = useState(0);

  function copyImageUrl() {
    const url = `${window.location.origin}/api/snapshot?chat=${encodeURIComponent(chatJid)}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  const src = chatJid
    ? `/api/snapshot?chat=${encodeURIComponent(chatJid)}&v=${cacheBust}`
    : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <select
          value={chatJid}
          onChange={(e) => {
            setChatJid(e.target.value);
            setCacheBust((v) => v + 1);
          }}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-100"
        >
          {chats.map((c) => (
            <option key={c.jid} value={c.jid}>
              {c.name ?? c.jid} {c.is_group ? "(group)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCacheBust((v) => v + 1)}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          ↻ Refresh
        </button>
        <a
          href={src}
          download={`whatsapp-snapshot.png`}
          className="text-xs px-3 py-1.5 rounded border border-emerald-700 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-800/60"
        >
          ⬇ PNG
        </a>
        <button
          type="button"
          onClick={copyImageUrl}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          Copy URL
        </button>
      </div>

      {chatJid && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={`Snapshot for ${chatJid}`}
            className="w-full h-auto"
          />
        </div>
      )}
      <p className="text-[11px] text-zinc-600">
        1200×630 PNG generated from your chat data. Shows total messages, peak hour, longest silence, top emoji, and reaction traffic.
      </p>
    </div>
  );
}
