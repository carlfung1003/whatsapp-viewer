import Link from "next/link";
import { listNeedsReply } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmtAgo(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const d = hours / 24;
  if (d < 7) return `${Math.round(d)}d`;
  return `${Math.round(d / 7)}w`;
}

export default async function NeedsReplyPage({
  searchParams,
}: {
  searchParams: Promise<{ hours?: string }>;
}) {
  const sp = await searchParams;
  const hoursMin = Math.max(0, Math.min(168, Number(sp.hours ?? "2") || 2));
  const rows = listNeedsReply(hoursMin, 200);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Needs reply</h1>
            <p className="text-xs text-zinc-500">
              {rows.length} DM{rows.length === 1 ? "" : "s"} where they sent the last message
              ≥ {hoursMin}h ago
            </p>
          </div>
          <div className="flex gap-1 text-xs">
            {[1, 2, 4, 12, 24, 72].map((h) => (
              <Link
                key={h}
                href={`/needs-reply?hours=${h}`}
                className={`px-2 py-1 rounded border ${
                  h === hoursMin
                    ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                    : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                ≥{h}h
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full">
        {rows.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">
            Inbox zero. No DM has been waiting on you for ≥ {hoursMin}h.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.chat_jid}
                className="border border-zinc-800 rounded-lg bg-zinc-950 p-3 hover:bg-zinc-900"
              >
                <Link href={`/chat/${encodeURIComponent(r.chat_jid)}`} className="block">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-zinc-100">
                        {r.chat_name ?? r.sender_name}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">via {r.sender_name}</span>
                    </div>
                    <span className="shrink-0 text-xs text-amber-400 tabular-nums">
                      {fmtAgo(r.hours_ago)} ago
                    </span>
                  </div>
                  <div className="text-sm text-zinc-300 truncate">
                    {r.content || (r.media_type ? `<${r.media_type}>` : "<no content>")}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
