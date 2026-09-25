import {
  topChats,
  mediaBreakdown,
  topEmojis,
  activityHeatmap,
  messagesPerDay,
  overviewTotals,
} from "@/lib/db";
import {
  TopChatsBar,
  MediaPie,
  EmojiPie,
  DailyVolumeLine,
  ActivityHeatmap,
} from "@/components/StatsCharts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.max(1, Math.min(180, Number(sp.days ?? "30") || 30));

  const totals = overviewTotals();
  const chats = topChats(days, 12);
  const media = mediaBreakdown(days);
  const emojis = topEmojis(days, 10);
  const heatmap = activityHeatmap(days);
  const daily = messagesPerDay(days);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--color-line)] px-6 py-4 bg-[var(--background)]/85 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Stats</h1>
            <p className="text-xs text-zinc-500">
              {totals.total_messages.toLocaleString()} total messages · {totals.total_reactions.toLocaleString()} reactions
              · {totals.total_images.toLocaleString()} images · {totals.total_chats} chats ({totals.total_active_chats_7d} active in 7d)
            </p>
          </div>
          <div className="flex gap-1 text-xs">
            {[7, 14, 30, 60, 90, 180].map((d) => (
              <Link
                key={d}
                href={`/stats?days=${d}`}
                className={`px-2 py-1 rounded-[var(--radius-ctl)] border ${
                  d === days
                    ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                    : "border-[var(--color-line)] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-7xl mx-auto w-full">
        <Card title={`Top chats by message count (last ${days}d)`}>
          <TopChatsBar data={chats} />
        </Card>

        <Card title={`Messages per day (last ${days}d)`}>
          <DailyVolumeLine data={daily} />
        </Card>

        <Card title={`Media type breakdown (last ${days}d)`}>
          <MediaPie data={media} />
        </Card>

        <Card title={`Top reaction emojis (last ${days}d)`}>
          <EmojiPie data={emojis} />
        </Card>

        <Card title={`Activity heatmap (last ${days}d, local time)`} className="lg:col-span-2">
          <ActivityHeatmap data={heatmap} />
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-[var(--color-line)] rounded-[14px] bg-zinc-950 p-4 ${className}`}>
      <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">{title}</h2>
      {children}
    </div>
  );
}
