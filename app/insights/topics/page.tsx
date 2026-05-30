import Link from "next/link";
import TopicGraph from "@/components/TopicGraph";

export const dynamic = "force-dynamic";

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.max(7, Math.min(180, Number(sp.days ?? "30") || 30));

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Topic graph</h1>
            <p className="text-xs text-zinc-500">
              Claude clusters your top {days}-day DMs into themes. Cached for 24h.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 text-xs">
              {[7, 14, 30, 60, 90].map((d) => (
                <Link
                  key={d}
                  href={`/insights/topics?days=${d}`}
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
            <Link href="/insights" className="text-xs text-zinc-400 hover:text-zinc-200 ml-2">
              ← insights
            </Link>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <TopicGraph days={days} />
      </div>
    </div>
  );
}
