import Link from "next/link";
import { initiatorRatioPerChat } from "@/lib/insights";

export const dynamic = "force-dynamic";

export default async function InitiatorPage() {
  const rows = initiatorRatioPerChat(6, 3);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Initiator vs responder</h1>
            <p className="text-xs text-zinc-500">
              A "start" = first message after a 6+ hour silence. Shows what share of conversations you
              kick off vs they do.
            </p>
          </div>
          <Link href="/insights" className="text-xs text-zinc-400 hover:text-zinc-200">
            ← insights
          </Link>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        {rows.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">Not enough data yet.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => {
              const myPct = Math.round(r.my_pct * 100);
              return (
                <li
                  key={r.chat_jid}
                  className="border border-zinc-800 rounded-lg bg-zinc-950 p-3"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <Link
                      href={`/chat/${encodeURIComponent(r.chat_jid)}`}
                      className="text-sm font-semibold text-zinc-100 hover:text-emerald-400 truncate"
                    >
                      {r.name}
                    </Link>
                    <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                      {r.total_starts} starts
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-900 rounded overflow-hidden flex">
                    <div className="bg-emerald-700" style={{ width: `${myPct}%` }} />
                    <div className="bg-amber-700" style={{ width: `${100 - myPct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[11px] text-zinc-400">
                    <span>
                      <span className="text-emerald-400 font-medium">{myPct}%</span> me ({r.my_starts})
                    </span>
                    <span>
                      <span className="text-amber-400 font-medium">{100 - myPct}%</span> them ({r.their_starts})
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
