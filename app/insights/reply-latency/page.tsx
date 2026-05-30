import Link from "next/link";
import { replyLatencyPerContact, fmtMinutes } from "@/lib/insights";

export const dynamic = "force-dynamic";

export default async function ReplyLatencyPage() {
  const rows = replyLatencyPerContact(5);
  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Reply latency</h1>
            <p className="text-xs text-zinc-500">
              Median time you take to reply, per DM (≥5 reply samples). Sorted fastest first.
            </p>
          </div>
          <Link href="/insights" className="text-xs text-zinc-400 hover:text-zinc-200">
            ← insights
          </Link>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        {rows.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">
            Not enough reply samples yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left py-2 font-medium">Contact</th>
                <th className="text-right py-2 font-medium">Median</th>
                <th className="text-right py-2 font-medium">P90</th>
                <th className="text-right py-2 font-medium">Samples</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.chat_jid} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                  <td className="py-2">
                    <Link
                      href={`/chat/${encodeURIComponent(r.chat_jid)}`}
                      className="text-zinc-100 hover:text-emerald-400"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right text-emerald-400 tabular-nums">
                    {fmtMinutes(r.median_min)}
                  </td>
                  <td className="py-2 text-right text-zinc-400 tabular-nums">
                    {fmtMinutes(r.p90_min)}
                  </td>
                  <td className="py-2 text-right text-zinc-500 tabular-nums">{r.sample_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
