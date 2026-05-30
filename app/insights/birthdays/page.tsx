import Link from "next/link";
import { detectBirthdays } from "@/lib/insights";

export const dynamic = "force-dynamic";

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysUntil(month: number, day: number): number {
  const today = new Date();
  const target = new Date(today.getFullYear(), month - 1, day);
  if (target.getTime() < today.setHours(0, 0, 0, 0)) target.setFullYear(today.getFullYear() + 1);
  return Math.floor((target.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
}

export default function BirthdaysPage() {
  const birthdays = detectBirthdays();

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Birthdays</h1>
            <p className="text-xs text-zinc-500">
              {birthdays.length} birthday{birthdays.length === 1 ? "" : "s"} inferred from past
              &ldquo;happy birthday&rdquo; / 🎂 messages you sent.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/birthdays.ics"
              download
              className="text-xs px-3 py-1.5 rounded border border-emerald-700 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-800/60"
            >
              ⬇ .ics
            </a>
            <Link href="/insights" className="text-xs text-zinc-400 hover:text-zinc-200 ml-2">
              ← insights
            </Link>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        {birthdays.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">
            No birthday wishes detected yet. (Detection is based on messages you sent containing &ldquo;happy birthday&rdquo;, 🎂, or 生日快樂.)
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {birthdays.map((b) => {
              const dleft = daysUntil(b.month, b.day);
              const upcoming = dleft <= 14;
              return (
                <li
                  key={`${b.chat_jid}-${b.month}-${b.day}`}
                  className={`border rounded-lg p-3 flex items-center gap-4 ${
                    upcoming ? "border-amber-800 bg-amber-950/20" : "border-zinc-800 bg-zinc-950"
                  }`}
                >
                  <div className="flex flex-col items-center justify-center w-16 shrink-0">
                    <div className="text-2xl font-bold text-zinc-100 tabular-nums leading-none">{b.day}</div>
                    <div className="text-xs text-zinc-500 uppercase tracking-wide">{MONTH_NAMES[b.month]}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/chat/${encodeURIComponent(b.chat_jid)}`}
                      className="text-sm font-semibold text-zinc-100 hover:text-emerald-400 truncate"
                    >
                      🎂 {b.name}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {dleft === 0
                        ? "today!"
                        : dleft === 1
                          ? "tomorrow"
                          : `in ${dleft} days`}{" "}
                      · last wished {b.last_wish_year}
                      {b.evidence_count > 1 ? ` · ${b.evidence_count}× evidence` : ""}
                    </div>
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
