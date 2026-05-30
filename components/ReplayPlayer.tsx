"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayMessage } from "@/lib/insights";

type Speed = 1 | 5 | 30 | 120 | 600;
const SPEEDS: Speed[] = [1, 5, 30, 120, 600];

function shortTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReplayPlayer({ messages }: { messages: ReplayMessage[] }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(30);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Stash message timestamps in ms
  const times = useMemo(() => messages.map((m) => new Date(m.timestamp).getTime()), [messages]);

  // Convert messages so reactions only appear once their own timestamp <= current playhead
  const visibleMessages = useMemo(() => messages.slice(0, idx + 1), [messages, idx]);
  const playheadMs = times[idx] ?? 0;

  // RAF-driven playback: at speed=N, 1 real second = N message-seconds.
  // We advance through messages by walking the "playhead time" forward, then
  // bumping idx whenever the next message's ts is reached.
  useEffect(() => {
    if (!playing) return;
    if (idx >= messages.length - 1) {
      setPlaying(false);
      return;
    }
    lastTickRef.current = performance.now();
    let playheadTime = times[idx];
    function tick(now: number) {
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      playheadTime += dt * speed; // scale real ms → message-time ms
      let next = idx;
      while (next < messages.length - 1 && times[next + 1] <= playheadTime) next++;
      if (next !== idx) setIdx(next);
      if (next >= messages.length - 1) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, idx, messages.length, speed, times]);

  // Auto-scroll to bottom as messages appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [idx]);

  if (messages.length === 0) {
    return <div className="text-sm text-zinc-500 py-16 text-center">No messages to replay.</div>;
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-2 border border-zinc-800 rounded-lg bg-zinc-950">
        <button
          type="button"
          onClick={() => {
            if (idx >= messages.length - 1) setIdx(0);
            setPlaying((p) => !p);
          }}
          className="w-10 h-10 rounded-full bg-emerald-700 hover:bg-emerald-600 text-white text-lg flex items-center justify-center"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="flex gap-1 text-xs">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`px-2 py-1 rounded border ${
                s === speed
                  ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                  : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={messages.length - 1}
            value={idx}
            onChange={(e) => {
              setPlaying(false);
              setIdx(Number(e.target.value));
            }}
            className="flex-1 accent-emerald-600"
          />
          <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap">
            {idx + 1} / {messages.length}
          </span>
        </div>
        <div className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">{shortTime(messages[idx].timestamp)}</div>
      </div>

      {/* Message stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950 p-4">
        <div className="flex flex-col gap-2">
          {visibleMessages.map((m) => {
            const visibleReactions = m.reactions.filter(
              (r) => new Date(r.timestamp).getTime() <= playheadMs
            );
            return (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-lg px-3 py-1.5 ${
                  m.is_from_me
                    ? "self-end bg-emerald-900/60 border border-emerald-800"
                    : "self-start bg-zinc-900 border border-zinc-800"
                } animate-[fadeIn_0.3s_ease-out]`}
              >
                {!m.is_from_me && (
                  <div className="text-[10px] text-zinc-500 font-medium">{m.sender_name}</div>
                )}
                <div className="text-sm text-zinc-100">
                  {m.content ?? (m.media_type ? <span className="italic text-zinc-400">{`<${m.media_type}>`}</span> : "")}
                </div>
                {visibleReactions.length > 0 && (
                  <div className="text-xs text-zinc-400 mt-0.5 flex flex-wrap gap-1">
                    {visibleReactions.map((r, i) => (
                      <span key={i} className="bg-zinc-800/80 rounded-full px-1.5">
                        {r.emoji} <span className="text-[9px] text-zinc-500">{r.reactor_name}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[9px] text-zinc-600 mt-0.5 tabular-nums">{shortTime(m.timestamp)}</div>
              </div>
            );
          })}
        </div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
