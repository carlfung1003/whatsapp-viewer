import Link from "next/link";
import { listNeedsReply } from "@/lib/db";
import ReplyTriage from "@/components/ReplyTriage";
import { Avatar } from "@/components/ui";

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
  searchParams: Promise<{ hours?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "time" ? "time" : "ai";
  const hoursMin = Math.max(0, Math.min(168, Number(sp.hours ?? "2") || 2));
  const rows = view === "time" ? listNeedsReply(hoursMin, 200) : [];

  const tab = (v: "ai" | "time", label: string) => (
    <Link
      href={v === "ai" ? "/needs-reply" : `/needs-reply?view=time&hours=${hoursMin}`}
      className={`h-8 px-3 inline-flex items-center rounded-full text-[13px] transition-colors ${
        view === v ? "bg-emerald-400/15 text-emerald-300" : "text-zinc-400 hover:text-zinc-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-full flex flex-col">
      <header className="px-4 md:px-6 py-3 border-b border-[var(--color-line)] bg-[var(--background)]/85 backdrop-blur-md sticky top-0 z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Needs reply</h1>
            <p className="text-[13px] text-zinc-500">
              {view === "ai" ? "Ranked by what actually needs you" : `DMs where they sent the last message ${hoursMin}h+ ago`}
            </p>
          </div>
          <nav className="flex rounded-full bg-[var(--color-surface-2)] p-0.5">
            {tab("ai", "AI priority")}
            {tab("time", "By time")}
          </nav>
        </div>
        {view === "time" && (
          <div className="mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {[1, 2, 4, 12, 24, 72].map((h) => (
              <Link
                key={h}
                href={`/needs-reply?view=time&hours=${h}`}
                className={`shrink-0 h-7 px-2.5 inline-flex items-center rounded-full text-[12px] tabular-nums ${
                  h === hoursMin ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {h}h+
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 w-full max-w-3xl mx-auto px-3 md:px-6 py-4">
        {view === "ai" ? (
          <ReplyTriage />
        ) : rows.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">
            Inbox zero. No DM has been waiting on you for {hoursMin}h or more.
          </div>
        ) : (
          <ul className="flex flex-col">
            {rows.map((r) => (
              <li key={r.chat_jid}>
                <Link
                  href={`/chat/${encodeURIComponent(r.chat_jid)}`}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-[12px] hover:bg-white/[0.03]"
                >
                  <Avatar name={r.chat_name ?? r.sender_name} seed={r.chat_jid} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-medium text-zinc-100">{r.chat_name ?? r.sender_name}</span>
                      <span className="shrink-0 text-xs text-amber-300 tabular-nums">{fmtAgo(r.hours_ago)} ago</span>
                    </div>
                    <div className="text-[13px] text-zinc-500 truncate">
                      {r.content || (r.media_type ? `[${r.media_type}]` : "")}
                    </div>
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
