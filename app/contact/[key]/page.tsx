import Link from "next/link";
import { listContactMessagesAcrossChats, resolveName } from "@/lib/db";

export const dynamic = "force-dynamic";

function shortTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ContactPage({ params }: { params: Promise<{ key: string }> }) {
  const { key: rawKey } = await params;
  const contactKey = decodeURIComponent(rawKey);
  const name = resolveName(contactKey);
  const messages = listContactMessagesAcrossChats(contactKey, 500);

  // Group messages by date for easy scanning
  const byDay = new Map<string, typeof messages>();
  for (const m of messages) {
    const day = new Date(m.timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(m);
  }

  // Per-chat tallies
  const byChat = new Map<string, { name: string | null; jid: string; count: number; is_group: boolean }>();
  for (const m of messages) {
    const existing = byChat.get(m.chat_jid);
    if (existing) existing.count++;
    else
      byChat.set(m.chat_jid, {
        name: m.chat_name,
        jid: m.chat_jid,
        count: 1,
        is_group: m.is_group,
      });
  }
  const chatBreakdown = Array.from(byChat.values()).sort((a, b) => b.count - a.count);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-100 truncate">{name}</h1>
            <p className="text-xs text-zinc-500">
              {messages.length} messages across {chatBreakdown.length} chat
              {chatBreakdown.length === 1 ? "" : "s"} · contact key{" "}
              <span className="font-mono">{contactKey}</span>
            </p>
          </div>
          <Link href="/contacts" className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200">
            ← all contacts
          </Link>
        </div>
        {chatBreakdown.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {chatBreakdown.map((c) => (
              <Link
                key={c.jid}
                href={`/chat/${encodeURIComponent(c.jid)}`}
                className="px-2 py-1 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
                title={c.jid}
              >
                {c.is_group ? "👥" : "💬"} {c.name ?? c.jid.slice(0, 12)} · {c.count}
              </Link>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-16">No messages found.</div>
        ) : (
          <div className="flex flex-col gap-4">
            {Array.from(byDay.entries()).map(([day, msgs]) => (
              <div key={day}>
                <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2 sticky top-0 bg-zinc-950 py-1">
                  {day}
                </div>
                <ul className="flex flex-col gap-2">
                  {msgs.map((m) => (
                    <li
                      key={`${m.chat_jid}-${m.id}`}
                      className="rounded border border-zinc-800 bg-zinc-900 p-3"
                    >
                      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                        <Link
                          href={`/chat/${encodeURIComponent(m.chat_jid)}`}
                          className="hover:text-emerald-400 truncate"
                        >
                          {m.is_group ? "👥" : "💬"} {m.chat_name ?? m.chat_jid}
                        </Link>
                        <span className="shrink-0 ml-2">{shortTime(m.timestamp)}</span>
                      </div>
                      {m.media_type ? (
                        <div className="text-xs text-zinc-400">[{m.media_type}]</div>
                      ) : null}
                      {m.content && (
                        <div className="text-sm text-zinc-200 whitespace-pre-wrap break-words">
                          {m.content}
                        </div>
                      )}
                      {m.reactions.length > 0 && (
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {m.reactions.map((r, i) => (
                            <span key={i} className="mr-1">
                              {r.emoji} <span className="text-zinc-600">({r.reactor_name})</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
