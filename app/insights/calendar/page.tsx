import Link from "next/link";
import { dailyMessageCounts } from "@/lib/insights";
import { ActivityCalendar } from "@/components/ActivityCalendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year ?? now.getFullYear());
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31 23:59:59`;
  const data = dailyMessageCounts(yearStart, yearEnd);
  const total = data.reduce((s, d) => s + d.count, 0);
  const activeDays = data.filter((d) => d.count > 0).length;

  // Available years from the data — naive: just offer current and prior 2
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Activity calendar — {year}</h1>
            <p className="text-xs text-zinc-500">
              {total.toLocaleString()} messages on {activeDays} active days. Hover any square for the
              date + count.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 text-xs">
              {yearOptions.map((y) => (
                <Link
                  key={y}
                  href={`/insights/calendar?year=${y}`}
                  className={`px-2 py-1 rounded border ${
                    y === year
                      ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                      : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {y}
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
        <ActivityCalendar data={data} yearStart={yearStart} />
      </div>
    </div>
  );
}
