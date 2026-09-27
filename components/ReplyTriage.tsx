"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, CaretDown, Check, Copy, Sparkle } from "@phosphor-icons/react";
import type { TriageItem, TriageResponse } from "@/app/api/reply-triage/route";
import { Avatar } from "@/components/ui";

// Semantic colours for priority only; the rest of the UI stays on the emerald accent.
const PRIORITY: Record<TriageItem["priority"], { label: string; cls: string }> = {
  urgent: { label: "Urgent", cls: "bg-rose-500/15 text-rose-300" },
  high: { label: "High", cls: "bg-amber-400/15 text-amber-300" },
  normal: { label: "Normal", cls: "bg-emerald-400/15 text-emerald-300" },
  low: { label: "Low", cls: "bg-white/5 text-zinc-400" },
};

function ago(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs a secure context; the plain-http tailnet URL isn't one.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function Draft({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-[12px] bg-[var(--color-mine)] ring-1 ring-inset ring-[var(--color-mine-line)] p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12px] font-medium text-emerald-300/90">Suggested reply</span>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(text)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] text-zinc-200 bg-white/5 hover:bg-white/10 active:scale-[0.97] transition"
        >
          {copied ? <Check size={13} weight="bold" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[15px] leading-[1.45] text-zinc-100 whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>
    </div>
  );
}

function Card({ it }: { it: TriageItem }) {
  const p = PRIORITY[it.priority];
  return (
    <li className="rounded-[14px] bg-[var(--color-surface)] ring-1 ring-inset ring-white/5 p-4 animate-rise">
      <div className="flex items-start gap-3">
        <Avatar name={it.name} seed={it.chat_jid} group={it.is_group} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/chat/${encodeURIComponent(it.chat_jid)}`} className="text-[15px] font-medium text-zinc-100 hover:underline truncate">
              {it.name}
            </Link>
            <span className={`h-6 px-2 inline-flex items-center rounded-full text-[12px] font-medium ${p.cls}`}>{p.label}</span>
            <span className="ml-auto text-xs text-zinc-500 tabular-nums">waiting {ago(it.hours_waiting)}</span>
          </div>
          <p className="mt-1 text-[14px] text-zinc-300">{it.reason}</p>
          {it.last_preview && (
            <p className="mt-1 text-[13px] text-zinc-500 truncate">&ldquo;{it.last_preview}&rdquo;</p>
          )}
        </div>
      </div>
      {it.suggested_reply && <Draft text={it.suggested_reply} />}
      <div className="mt-3 flex justify-end">
        <Link
          href={`/chat/${encodeURIComponent(it.chat_jid)}`}
          className="inline-flex items-center h-8 px-3 rounded-full text-[13px] text-zinc-300 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]"
        >
          Open chat
        </Link>
      </div>
    </li>
  );
}

export default function ReplyTriage() {
  const [data, setData] = useState<TriageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRest, setShowRest] = useState(false);

  const run = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reply-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as TriageResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    run(false);
  }, [run]);

  const needs = data?.items.filter((i) => i.needs_reply) ?? [];
  const rest = data?.items.filter((i) => !i.needs_reply) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-zinc-500">
        <Sparkle size={15} weight="fill" className="text-emerald-300" />
        <span suppressHydrationWarning>
          {loading
            ? "Claude is reading your waiting chats…"
            : data
              ? `${needs.length} of ${data.candidates} waiting chats need you. ${data.cached ? "Cached" : "Analysed"} ${new Date(data.generated_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`
              : ""}
        </span>
        <span className="text-zinc-600">iLuxury groups excluded</span>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] text-zinc-200 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] disabled:opacity-50 transition"
        >
          <ArrowClockwise size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-200 bg-red-500/10 rounded-[var(--radius-ctl)] ring-1 ring-inset ring-red-500/25">{error}</div>
      )}

      {loading && !data && (
        <ul className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-40 rounded-[14px] skeleton" />
          ))}
        </ul>
      )}

      {data && needs.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-2 py-16 text-zinc-500">
          <Check size={28} />
          <span className="text-sm">Nothing needs a reply right now.</span>
        </div>
      )}

      {needs.length > 0 && (
        <ul className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {needs.map((it) => (
            <Card key={it.chat_jid} it={it} />
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowRest((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-200"
          >
            <CaretDown size={14} className={`transition-transform ${showRest ? "rotate-180" : ""}`} />
            {rest.length} {rest.length === 1 ? "chat doesn't" : "chats don't"} need a reply
          </button>
          {showRest && (
            <ul className="mt-2 flex flex-col">
              {rest.map((it) => (
                <li key={it.chat_jid}>
                  <Link
                    href={`/chat/${encodeURIComponent(it.chat_jid)}`}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-[12px] hover:bg-white/[0.03]"
                  >
                    <Avatar name={it.name} seed={it.chat_jid} group={it.is_group} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] text-zinc-200 truncate">{it.name}</div>
                      <div className="text-[13px] text-zinc-500 truncate">{it.reason}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
