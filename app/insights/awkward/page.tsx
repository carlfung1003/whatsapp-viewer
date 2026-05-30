import Link from "next/link";
import { awkwardMoments } from "@/lib/insights";

export const dynamic = "force-dynamic";

function shortTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtHours(h: number): string {
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export default async function AwkwardPage({
  searchParams,
}: {
  searchParams: Promise<{ silence?: string }>;
}) {
  const sp = await searchParams;
  const silenceHours = Math.max(6, Math.min(168, Number(sp.silence ?? "24") || 24));
  const moments = awkwardMoments(1, silenceHours, 50);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Awkwardness detector</h1>
            <p className="text-xs text-zinc-500">
              {moments.length} moment{moments.length === 1 ? "" : "s"} where reply rhythm hit a wall ≥{" "}
              {fmtHours(silenceHours)} (≥5× this chat&apos;s normal cadence).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 text-xs">
              {[6, 12, 24, 72, 168].map((h) => (
                <Link
                  key={h}
                  href={`/insights/awkward?silence=${h}`}
                  className={`px-2 py-1 rounded border ${
                    h === silenceHours
                      ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                      : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {fmtHours(h)}
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
        {moments.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">
            No awkward silences detected in chats with established rhythm. ✨
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {moments.map((m) => (
              <li key={`${m.chat_jid}-${m.message_id}`} className="border border-zinc-800 rounded-lg bg-zinc-950 p-3">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <Link
                    href={`/chat/${encodeURIComponent(m.chat_jid)}`}
                    className="text-sm font-semibold text-zinc-100 hover:text-emerald-400 truncate"
                  >
                    {m.name}
                  </Link>
                  <span className="shrink-0 text-xs text-amber-400 tabular-nums">
                    {fmtHours(m.silence_hours)} silence · {m.ratio.toFixed(0)}× normal
                  </span>
                </div>
                <div className="text-xs text-zinc-500 mb-1">
                  {m.preceding_sender} · {shortTime(m.timestamp)}
                </div>
                <div className="text-sm text-zinc-300 italic border-l-2 border-zinc-700 pl-3 line-clamp-3">
                  {m.preceding_content ?? (m.preceding_media ? `<${m.preceding_media}>` : "(empty)")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
