"use client";

import Link from "next/link";
import { useState } from "react";
import { ImageTile } from "@/components/Messages";
import type { LedgerDrop, LedgerItem } from "@/lib/iluxury";

function shortTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ItemRow({
  item,
  chatJid,
  initial,
}: {
  item: LedgerItem;
  chatJid: string;
  initial: { paid: boolean; shipped: boolean };
}) {
  const [paid, setPaid] = useState(initial.paid);
  const [shipped, setShipped] = useState(initial.shipped);
  const [saving, setSaving] = useState(false);

  async function toggle(field: "paid" | "shipped", value: boolean) {
    setSaving(true);
    try {
      const next = { paid, shipped, [field]: value };
      const res = await fetch("/api/iluxury/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: item.message_id,
          chat_jid: chatJid,
          paid: next.paid,
          shipped: next.shipped,
        }),
      });
      if (res.ok) {
        if (field === "paid") setPaid(value);
        else setShipped(value);
      }
    } finally {
      setSaving(false);
    }
  }

  const hasClaimer = !!item.claimer_reactor;
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded border ${
        hasClaimer ? "border-emerald-900 bg-emerald-950/20" : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <div className="w-16 h-16 shrink-0">
        <ImageTile chatJid={chatJid} messageId={item.message_id} small claimed={hasClaimer} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-100">
          {item.claimer_name ?? <span className="text-zinc-500">no claimer</span>}
        </div>
        <div className="text-[10px] text-zinc-500 font-mono truncate">{item.message_id.slice(0, 16)}…</div>
      </div>
      <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={paid}
          disabled={saving}
          onChange={(e) => toggle("paid", e.target.checked)}
          className="accent-emerald-600"
        />
        Paid
      </label>
      <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={shipped}
          disabled={saving}
          onChange={(e) => toggle("shipped", e.target.checked)}
          className="accent-emerald-600"
        />
        Shipped
      </label>
    </div>
  );
}

export default function ClaimLedger({ drops, chatJid }: { drops: LedgerDrop[]; chatJid: string }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  if (drops.length === 0) {
    return (
      <div className="text-center text-sm text-zinc-500 py-16">
        No drops detected in this window.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {drops.map((d, i) => {
        const open = expandedIdx === i;
        return (
          <div key={i} className="border border-zinc-800 rounded-lg bg-zinc-950">
            <button
              type="button"
              onClick={() => setExpandedIdx(open ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900 rounded-t-lg"
            >
              <div className="text-left">
                <div className="text-sm font-semibold text-zinc-100">
                  {d.sender_name} — {shortTime(d.start)}
                </div>
                <div className="text-xs text-zinc-500">
                  {d.item_count} items · <span className="text-emerald-400">{d.claimed_count} claimed</span> ·{" "}
                  <span className="text-amber-400">{d.paid_count} paid</span> ·{" "}
                  <span className="text-blue-400">{d.shipped_count} shipped</span>
                </div>
              </div>
              <span className="text-xs text-zinc-500">{open ? "▾" : "▸"}</span>
            </button>
            {open && (
              <div className="px-4 pb-4 flex flex-col gap-2">
                {d.items.map((item) => (
                  <ItemRow
                    key={item.message_id}
                    item={item}
                    chatJid={chatJid}
                    initial={{
                      paid: !!item.claim_state?.paid,
                      shipped: !!item.claim_state?.shipped,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
