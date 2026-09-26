"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  File,
  Microphone,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  VideoCamera,
} from "@phosphor-icons/react";
import type { ReplayMessage } from "@/lib/insights";
import { ImageTile } from "@/components/Messages";
import { dayLabel, senderColor } from "@/components/ui";

const INTERVAL_KEY = "whatsapp-viewer.replay-interval";
const PRESETS = [0.5, 1, 2, 3];
const MIN_S = 0.1;
const MAX_S = 10;

const MEDIA_ICON: Record<string, typeof File> = { video: VideoCamera, audio: Microphone, document: File };

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function TypingBubble({ mine, name, seed }: { mine: boolean; name: string; seed: string }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} mt-3 animate-fade`} aria-label={`${name} is typing`}>
      <div
        className={`flex items-center gap-2 h-9 px-3.5 rounded-[var(--radius-bubble)] ${
          mine ? "bg-[var(--color-mine)] ring-1 ring-inset ring-[var(--color-mine-line)]" : "bg-[var(--color-surface-2)] ring-1 ring-inset ring-white/5"
        }`}
      >
        {!mine && (
          <span className="text-[12px] font-medium" style={{ color: senderColor(seed) }}>
            {name}
          </span>
        )}
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 rounded-full bg-zinc-400 animate-bounce"
              style={{ animationDelay: `${i * 140}ms`, animationDuration: "900ms" }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

export default function ReplayPlayer({ messages, isGroup }: { messages: ReplayMessage[]; isGroup: boolean }) {
  const total = messages.length;
  // `shown` = how many messages are on screen (0 = nothing yet).
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [interval, setIntervalS] = useState(1);
  const [custom, setCustom] = useState("1");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  // Restore the viewer's preferred pace.
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(INTERVAL_KEY));
      if (v >= MIN_S && v <= MAX_S) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
        setIntervalS(v);
        setCustom(String(v));
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const choose = useCallback((s: number) => {
    const v = Math.min(MAX_S, Math.max(MIN_S, Math.round(s * 10) / 10));
    setIntervalS(v);
    setCustom(String(v));
    try {
      localStorage.setItem(INTERVAL_KEY, String(v));
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Fixed-pace playback: one message every `interval` seconds.
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      const next = Math.min(total, shown + 1);
      setShown(next);
      if (next >= total) setPlaying(false);
    }, interval * 1000);
    return () => clearTimeout(id);
  }, [playing, shown, interval, total]);

  const togglePlay = useCallback(() => {
    if (!playing && shown >= total) setShown(0);
    setPlaying((p) => !p);
  }, [playing, shown, total]);

  const step = useCallback(
    (d: number) => {
      setPlaying(false);
      setShown((n) => Math.min(total, Math.max(0, n + d)));
    },
    [total]
  );

  // Space = play/pause, arrows = step. Ignored while typing in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, step]);

  // Follow new messages, unless the viewer scrolled up to reread.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown, playing]);

  const visible = useMemo(() => messages.slice(0, shown), [messages, shown]);
  const current = shown > 0 ? messages[shown - 1] : null;
  const playheadMs = current ? new Date(current.timestamp).getTime() : 0;
  const upNext = playing && shown < total ? messages[shown] : null;

  if (total === 0) {
    return <div className="text-sm text-zinc-500 py-16 text-center">No messages to replay.</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Stream */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-x-none px-3 md:px-6 pt-2 pb-6"
      >
        {shown === 0 && (
          <div className="h-full grid place-items-center text-center">
            <div className="animate-rise">
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Start replay"
                className="mx-auto grid place-items-center size-16 rounded-full bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:scale-95 transition shadow-[0_8px_40px_rgb(52_211_153/0.25)]"
              >
                <Play size={26} weight="fill" />
              </button>
              <p className="mt-4 text-[15px] text-zinc-300">
                {total.toLocaleString()} messages, one every {interval}s
              </p>
              <p className="mt-1 text-[13px] text-zinc-500">
                Starts {fullTime(messages[0].timestamp)}. Space to play, arrow keys to step.
              </p>
            </div>
          </div>
        )}

        {visible.map((m, i) => {
          const prev = visible[i - 1];
          const newDay = !prev || dayKey(prev.timestamp) !== dayKey(m.timestamp);
          const first = newDay || prev.sender !== m.sender;
          const mine = !!m.is_from_me;
          const reactions = m.reactions.filter((r) => new Date(r.timestamp).getTime() <= playheadMs);
          const Icon =
            m.media_type && m.media_type !== "image" && m.media_type !== "sticker" ? MEDIA_ICON[m.media_type] ?? File : null;
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="flex justify-center py-3">
                  <span
                    className="px-3 h-7 inline-flex items-center rounded-full bg-[var(--color-surface-3)] text-xs font-medium text-zinc-300 ring-1 ring-white/5"
                    suppressHydrationWarning
                  >
                    {dayLabel(m.timestamp)}
                  </span>
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-0.5"} animate-rise`}>
                <div className={`flex flex-col ${mine ? "items-end" : "items-start"} min-w-0 max-w-[85%] md:max-w-[68%]`}>
                  <div
                    className={`max-w-full min-w-0 px-3 pt-2 pb-1.5 rounded-[var(--radius-bubble)] ${
                      mine
                        ? `bg-[var(--color-mine)] ring-1 ring-inset ring-[var(--color-mine-line)] ${first ? "rounded-tr-[6px]" : ""}`
                        : `bg-[var(--color-surface-2)] ring-1 ring-inset ring-white/5 ${first ? "rounded-tl-[6px]" : ""}`
                    }`}
                  >
                    {!mine && first && isGroup && (
                      <div className="text-[13px] font-medium mb-0.5" style={{ color: senderColor(m.sender) }}>
                        {m.sender_name}
                      </div>
                    )}
                    {(m.media_type === "image" || m.media_type === "sticker") && (
                      <div className="-mx-1.5 mb-1">
                        <ImageTile
                          chatJid={m.chat_jid}
                          messageId={m.id}
                          timestamp={m.timestamp}
                          sticker={m.media_type === "sticker"}
                          caption={m.content ?? undefined}
                        />
                      </div>
                    )}
                    {Icon && (
                      <div className="mb-1 flex min-w-0 items-center gap-2 rounded-[8px] bg-black/25 px-2.5 py-2 text-[13px] text-zinc-300">
                        <Icon size={16} className="shrink-0 text-zinc-400" />
                        <span className="capitalize">{m.media_type}</span>
                      </div>
                    )}
                    {m.content && (
                      <span className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-[1.4] text-zinc-100">{m.content}</span>
                    )}
                    <span className="float-right ml-3 mt-1.5 translate-y-0.5 text-[11px] text-zinc-500 tabular-nums">
                      {clock(m.timestamp)}
                    </span>
                  </div>
                  {reactions.length > 0 && (
                    <div className={`-mt-1.5 ${mine ? "mr-2" : "ml-2"} flex gap-1 relative z-[1]`}>
                      {reactions.map((r, j) => (
                        <span
                          key={j}
                          title={r.reactor_name}
                          className="inline-flex items-center h-6 px-2 rounded-full bg-[var(--color-surface-3)] ring-1 ring-[var(--background)] text-[13px] animate-pop"
                        >
                          {r.emoji}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}

        {upNext && interval >= 0.6 && (
          <TypingBubble key={shown} mine={!!upNext.is_from_me} name={upNext.sender_name} seed={upNext.sender} />
        )}
      </div>

      {/* Player bar */}
      <div className="shrink-0 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-3 md:px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 tabular-nums w-[4.5rem] shrink-0">
            {shown.toLocaleString()} / {total.toLocaleString()}
          </span>
          <input
            type="range"
            aria-label="Replay position"
            min={0}
            max={total}
            value={shown}
            onChange={(e) => {
              setPlaying(false);
              stickRef.current = true;
              setShown(Number(e.target.value));
            }}
            className="flex-1 h-1.5 cursor-pointer accent-emerald-400"
          />
          <span className="hidden sm:block text-xs text-zinc-500 tabular-nums shrink-0 min-w-[9rem] text-right" suppressHydrationWarning>
            {current ? fullTime(current.timestamp) : ""}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setShown(0);
              }}
              aria-label="Restart"
              title="Restart"
              className="grid place-items-center size-10 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
            >
              <ArrowCounterClockwise size={18} />
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous message"
              title="Previous message (left arrow)"
              className="grid place-items-center size-10 rounded-full text-zinc-300 hover:text-zinc-100 hover:bg-white/5"
            >
              <SkipBack size={18} weight="fill" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              title={playing ? "Pause (space)" : "Play (space)"}
              className="grid place-items-center size-12 rounded-full bg-emerald-400 text-emerald-950 hover:bg-emerald-300 active:scale-95 transition"
            >
              {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next message"
              title="Next message (right arrow)"
              className="grid place-items-center size-10 rounded-full text-zinc-300 hover:text-zinc-100 hover:bg-white/5"
            >
              <SkipForward size={18} weight="fill" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">One message every</span>
            <div className="flex rounded-full bg-[var(--color-surface-2)] p-0.5">
              {PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => choose(s)}
                  className={`h-8 px-3 rounded-full text-[13px] tabular-nums transition-colors ${
                    s === interval ? "bg-emerald-400/15 text-emerald-300" : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
            <label className="flex items-center h-9 rounded-full bg-[var(--color-surface-2)] px-3 text-[13px] text-zinc-400 focus-within:ring-1 focus-within:ring-emerald-400/40">
              <input
                type="number"
                aria-label="Custom seconds between messages"
                min={MIN_S}
                max={MAX_S}
                step={0.1}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={() => {
                  const v = Number(custom);
                  if (Number.isFinite(v) && v > 0) choose(v);
                  else setCustom(String(interval));
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="w-8 bg-transparent text-zinc-100 tabular-nums text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="ml-0.5">s</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
