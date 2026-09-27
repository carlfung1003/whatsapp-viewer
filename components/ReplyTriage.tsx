"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowBendUpLeft, ArrowClockwise, ArrowCounterClockwise, At, CaretDown, Check, CheckCircle, Copy, Sparkle } from "@phosphor-icons/react";
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

function Context({ it }: { it: TriageItem }) {
  return (
    <div className="mt-3 flex flex-col gap-1.5 rounded-[12px] bg-black/20 p-3">
      {it.context.map((m, i) => (
        <div key={i} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[85%] min-w-0 px-3 py-1.5 rounded-[14px] text-[14px] leading-[1.4] [overflow-wrap:anywhere] ${
              m.mine ? "bg-[var(--color-mine)] text-zinc-100" : "bg-[var(--color-surface-2)] text-zinc-200"
            }`}
          >
            {!m.mine && it.is_group && <div className="text-[12px] font-medium text-zinc-400">{m.who}</div>}
            {m.text || <span className="text-zinc-500">(empty)</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ it, onDone }: { it: TriageItem; onDone: (it: TriageItem) => void }) {
  const p = PRIORITY[it.priority];
  const [showCtx, setShowCtx] = useState(false);
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
            {it.is_group && (
              <span className="h-6 px-2 inline-flex items-center gap-1 rounded-full text-[12px] bg-white/5 text-zinc-400">
                {it.why_candidate === "reply-to-me" ? <ArrowBendUpLeft size={12} /> : <At size={12} />}
                {it.why_candidate === "reply-to-me" ? "replied to you" : "mentioned you"}
              </span>
            )}
            <span className="ml-auto text-xs text-zinc-500 tabular-nums">waiting {ago(it.hours_waiting)}</span>
          </div>
          <p className="mt-1 text-[14px] text-zinc-300">{it.reason}</p>
          {it.last_preview && (
            <p className="mt-1 text-[13px] text-zinc-500 truncate">&ldquo;{it.last_preview}&rdquo;</p>
          )}
        </div>
      </div>
      {showCtx && it.context?.length > 0 && <Context it={it} />}
      {it.suggested_reply && <Draft text={it.suggested_reply} />}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {it.context?.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCtx((v) => !v)}
            className="mr-auto inline-flex items-center gap-1 h-8 px-2 rounded-full text-[13px] text-zinc-400 hover:text-zinc-100"
          >
            <CaretDown size={13} className={`transition-transform ${showCtx ? "rotate-180" : ""}`} />
            {showCtx ? "Hide conversation" : "Show conversation"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDone(it)}
          title="Hide until they send something new"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] text-emerald-200 bg-emerald-400/10 hover:bg-emerald-400/20 active:scale-[0.97] transition"
        >
          <CheckCircle size={14} />
          Done
        </button>
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
  const [showDone, setShowDone] = useState(false);

  // Optimistic: flip locally, persist in the background, roll back on failure.
  const setDismissed = useCallback(async (it: TriageItem, dismissed: boolean) => {
    const flip = (v: boolean) =>
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.chat_jid === it.chat_jid ? { ...x, dismissed: v } : x)) } : d));
    flip(dismissed);
    try {
      const res = await fetch("/api/reply-triage/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_jid: it.chat_jid, last_msg_id: it.last_msg_id, undo: !dismissed }),
      });
      if (!res.ok) throw new Error();
    } catch {
      flip(!dismissed);
      setError("Couldn't save that. Try again.");
    }
  }, []);

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

  const needs = data?.items.filter((i) => i.needs_reply && !i.dismissed) ?? [];
  const rest = data?.items.filter((i) => !i.needs_reply && !i.dismissed) ?? [];
  const done = data?.items.filter((i) => i.dismissed) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-zinc-500">
        <Sparkle size={15} weight="fill" className="text-emerald-300" />
        <span suppressHydrationWarning>
          {loading
            ? "Claude is reading your waiting chats…"
            : data
              ? `${needs.length} of ${data.candidates} waiting chats need you${done.length ? `, ${done.length} done` : ""}. ${data.cached ? "Cached" : "Analysed"} ${new Date(data.generated_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`
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
            <Card key={it.chat_jid} it={it} onDone={(x) => setDismissed(x, true)} />
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

      {done.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-200"
          >
            <CaretDown size={14} className={`transition-transform ${showDone ? "rotate-180" : ""}`} />
            {done.length} marked done
          </button>
          {showDone && (
            <ul className="mt-2 flex flex-col">
              {done.map((it) => (
                <li key={it.chat_jid} className="flex items-center gap-3 px-2 py-2.5">
                  <Avatar name={it.name} seed={it.chat_jid} group={it.is_group} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] text-zinc-300 truncate">{it.name}</div>
                    <div className="text-[13px] text-zinc-500 truncate">Hidden until they send something new</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDismissed(it, false)}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[13px] text-zinc-300 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]"
                  >
                    <ArrowCounterClockwise size={13} />
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
