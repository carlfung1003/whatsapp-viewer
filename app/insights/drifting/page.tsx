import Link from "next/link";
import { driftingContacts } from "@/lib/insights";
import ReopenerButton from "@/components/ReopenerButton";

export const dynamic = "force-dynamic";

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function DriftingPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const sp = await searchParams;
  const windowDays = Math.max(7, Math.min(180, Number(sp.window ?? "90") || 90));
  const rows = driftingContacts(windowDays, 20);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Drifting relationships</h1>
            <p className="text-xs text-zinc-500">
              {rows.length} DM{rows.length === 1 ? "" : "s"} where message volume in the last{" "}
              {windowDays} days dropped &gt;50% from the prior {windowDays} days.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 text-xs">
              {[30, 60, 90, 180].map((w) => (
                <Link
                  key={w}
                  href={`/insights/drifting?window=${w}`}
                  className={`px-2 py-1 rounded border ${
                    w === windowDays
                      ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                      : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {w}d
                </Link>
              ))}
            </div>
            <Link href="/insights" className="text-xs text-zinc-400 hover:text-zinc-200 ml-2">
              ← insights
            </Link>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        {rows.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">
            ✨ No drifting relationships — you're staying in touch.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.chat_jid} className="border border-zinc-800 rounded-lg bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <Link
                    href={`/chat/${encodeURIComponent(r.chat_jid)}`}
                    className="text-sm font-semibold text-zinc-100 hover:text-emerald-400 truncate"
                  >
                    {r.name}
                  </Link>
                  <span className="shrink-0 text-xs text-amber-400 tabular-nums">
                    −{Math.round(r.drop_pct * 100)}%
                  </span>
                </div>
                <div className="text-xs text-zinc-500 tabular-nums">
                  {r.current_count} now vs {r.prior_count} prior · last seen {shortDate(r.last_seen)}
                </div>
                <ReopenerButton chatJid={r.chat_jid} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
