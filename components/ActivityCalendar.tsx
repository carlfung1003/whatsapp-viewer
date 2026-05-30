import type { DailyCount } from "@/lib/insights";

const WEEKDAY_LABELS = ["Mon", "Wed", "Fri"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function bucket(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 0;
  const ratio = count / max;
  if (ratio < 0.15) return 1;
  if (ratio < 0.35) return 2;
  if (ratio < 0.6) return 3;
  return 4;
}

const BUCKET_BG = ["bg-zinc-900", "bg-emerald-950", "bg-emerald-800", "bg-emerald-600", "bg-emerald-400"];

export function ActivityCalendar({
  data,
  yearStart,
}: {
  data: DailyCount[];
  yearStart: string;
}) {
  // Build a Map for O(1) lookup
  const map = new Map(data.map((d) => [d.date, d.count]));
  const max = data.reduce((m, d) => Math.max(m, d.count), 0);

  // Build 53 weeks × 7 days starting from the Sunday of yearStart's week
  const start = new Date(yearStart);
  start.setHours(0, 0, 0, 0);
  // Roll back to Sunday
  const dow = start.getDay();
  start.setDate(start.getDate() - dow);

  const weeks: Array<Array<{ date: string; count: number }>> = [];
  for (let w = 0; w < 53; w++) {
    const days: Array<{ date: string; count: number }> = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      const iso = dt.toISOString().slice(0, 10);
      days.push({ date: iso, count: map.get(iso) ?? 0 });
    }
    weeks.push(days);
  }

  // Compute month label positions (which week column starts a month)
  const monthCols: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks.length; w++) {
    const firstDate = new Date(weeks[w][0].date);
    const m = firstDate.getMonth();
    if (m !== lastMonth) {
      monthCols.push({ col: w, label: MONTH_LABELS[m] });
      lastMonth = m;
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        {/* Month labels */}
        <div className="flex pl-8 mb-1 text-[10px] text-zinc-500">
          {monthCols.map((m, i) => {
            const nextCol = monthCols[i + 1]?.col ?? weeks.length;
            const span = nextCol - m.col;
            return (
              <div key={i} style={{ width: `${span * 14}px` }}>
                {m.label}
              </div>
            );
          })}
        </div>
        <div className="flex">
          {/* Weekday labels (Mon/Wed/Fri only) */}
          <div className="flex flex-col gap-0.5 mr-1 text-[10px] text-zinc-500 mt-0.5">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <div key={d} style={{ height: "12px", lineHeight: "12px" }}>
                {d === 1 ? WEEKDAY_LABELS[0] : d === 3 ? WEEKDAY_LABELS[1] : d === 5 ? WEEKDAY_LABELS[2] : ""}
              </div>
            ))}
          </div>
          {/* Grid */}
          <div className="flex gap-0.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {week.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.count} msg${day.count === 1 ? "" : "s"}`}
                    className={`w-3 h-3 rounded-sm ${BUCKET_BG[bucket(day.count, max)]}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500">
          <span>less</span>
          {BUCKET_BG.map((cls, i) => (
            <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} />
          ))}
          <span>more</span>
          <span className="ml-3 text-zinc-600">peak day: {max} msgs</span>
        </div>
      </div>
    </div>
  );
}
