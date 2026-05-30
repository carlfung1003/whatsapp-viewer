import Link from "next/link";
import { topReactedMessages, reactionsGivenVsReceived } from "@/lib/insights";

export const dynamic = "force-dynamic";

function shortTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ReactionsPage() {
  const topMessages = topReactedMessages(20, true);
  const traffic = reactionsGivenVsReceived().slice(0, 16);
  const trafficMax = traffic.reduce((m, t) => Math.max(m, t.given + t.received), 1);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Reaction analytics</h1>
            <p className="text-xs text-zinc-500">
              Your most-reacted-to messages, and which emojis you give vs receive most.
            </p>
          </div>
          <Link href="/insights" className="text-xs text-zinc-400 hover:text-zinc-200">
            ← insights
          </Link>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
            Your top reacted messages
          </h2>
          {topMessages.length === 0 ? (
            <div className="text-sm text-zinc-500">No reactions captured yet.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {topMessages.map((m) => (
                <li
                  key={`${m.chat_jid}-${m.message_id}`}
                  className="border border-zinc-800 rounded-lg bg-zinc-950 p-3"
                >
                  <Link
                    href={`/chat/${encodeURIComponent(m.chat_jid)}`}
                    className="block hover:bg-zinc-900 rounded -m-1 p-1"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                      <span className="truncate">{m.chat_name ?? m.chat_jid}</span>
                      <span className="shrink-0 ml-2 tabular-nums">
                        {shortTime(m.timestamp)} · <span className="text-amber-400">{m.reaction_count}🔥</span>
                      </span>
                    </div>
                    <div className="text-sm text-zinc-200 line-clamp-3 whitespace-pre-wrap break-words">
                      {m.content || "(no text)"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
            Emojis: given vs received
          </h2>
          {traffic.length === 0 ? (
            <div className="text-sm text-zinc-500">No reactions captured yet.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {traffic.map((t) => {
                const givenPct = (t.given / trafficMax) * 100;
                const recvPct = (t.received / trafficMax) * 100;
                return (
                  <li
                    key={t.emoji}
                    className="border border-zinc-800 rounded-lg bg-zinc-950 p-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">{t.emoji}</span>
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-16 text-emerald-400 tabular-nums">given {t.given}</span>
                          <div className="flex-1 h-2 bg-zinc-900 rounded overflow-hidden">
                            <div className="bg-emerald-700 h-full" style={{ width: `${givenPct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-16 text-amber-400 tabular-nums">recv {t.received}</span>
                          <div className="flex-1 h-2 bg-zinc-900 rounded overflow-hidden">
                            <div className="bg-amber-700 h-full" style={{ width: `${recvPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
