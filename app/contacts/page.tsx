import Link from "next/link";
import { listContactsWithActivity } from "@/lib/db";

export const dynamic = "force-dynamic";

function shortAgo(iso: string | null): string {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default async function ContactsPage() {
  const contacts = listContactsWithActivity(300);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-zinc-100">Contacts</h1>
        <p className="text-xs text-zinc-500">
          {contacts.length} senders observed across all chats. Click into one to see their messages
          everywhere — DMs and groups combined.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 max-w-5xl mx-auto w-full">
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {contacts.map((c) => (
            <li
              key={c.key}
              className="border border-zinc-800 rounded-lg bg-zinc-950 p-3 hover:bg-zinc-900"
            >
              <Link href={`/contact/${encodeURIComponent(c.key)}`} className="block">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <span className="text-sm font-semibold text-zinc-100 truncate">{c.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                    {shortAgo(c.last_active)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span>{c.message_count.toLocaleString()} msgs</span>
                  {c.phone && <span className="font-mono">+{c.phone}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
