import { listDropsAcrossChats, type CrossChatDrop } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmtRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const dateOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${s.toLocaleString(undefined, dateOpts)} → ${e.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" })}`
    : `${s.toLocaleString(undefined, dateOpts)} → ${e.toLocaleString(undefined, dateOpts)}`;
}

async function DropCard({ drop }: { drop: CrossChatDrop }) {
  const claimRate = drop.message_ids.length
    ? Math.round((drop.reaction_count / drop.message_ids.length) * 100)
    : 0;
  return (
    <li className="border border-zinc-800 rounded-lg bg-zinc-950 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/chat/${encodeURIComponent(drop.chat_jid)}`}
            className="block text-sm font-semibold text-zinc-100 hover:text-emerald-400 truncate"
          >
            {drop.chat_name ?? drop.chat_jid}
          </Link>
          <div className="text-xs text-zinc-400 mt-0.5">
            <span className="text-zinc-200">{drop.sender_name}</span>
            <span className="mx-2 text-zinc-600">·</span>
            <span>{fmtRange(drop.start, drop.end)}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-semibold text-zinc-100 leading-none">
            {drop.message_ids.length}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">items</div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div>
          <span className="text-zinc-200 font-medium">{drop.reaction_count}</span>
          <span className="text-zinc-500 ml-1">reactions</span>
        </div>
        <div>
          <span className="text-zinc-200 font-medium">{drop.quoted_reply_count}</span>
          <span className="text-zinc-500 ml-1">quoted replies</span>
        </div>
        {drop.reaction_count > 0 && (
          <div className="ml-auto text-emerald-400">
            {claimRate}% claimed
          </div>
        )}
      </div>
    </li>
  );
}

export default async function DropsDashboard({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.max(1, Math.min(60, Number(sp.days ?? "7") || 7));
  const drops = listDropsAcrossChats(days);

  const totalItems = drops.reduce((s, d) => s + d.message_ids.length, 0);
  const totalReactions = drops.reduce((s, d) => s + d.reaction_count, 0);
  const totalQuoted = drops.reduce((s, d) => s + d.quoted_reply_count, 0);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Image drops</h1>
            <p className="text-xs text-zinc-500">
              {drops.length} drops · {totalItems} items · {totalReactions} reactions · {totalQuoted} quoted replies · last {days}d
            </p>
          </div>
          <div className="flex gap-1 text-xs">
            {[1, 3, 7, 14, 30].map((d) => (
              <Link
                key={d}
                href={`/drops?days=${d}`}
                className={`px-2 py-1 rounded border ${
                  d === days
                    ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                    : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {drops.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">
            No image drops in the last {days} days.
          </div>
        ) : (
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-5xl mx-auto">
            {drops.map((d, i) => (
              <DropCard key={`${d.chat_jid}-${i}`} drop={d} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
