import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { replayMessages } from "@/lib/insights";
import { aliasesForChatJid, listChats } from "@/lib/db";
import ReplayPlayer from "@/components/ReplayPlayer";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

const LIMITS = [200, 500, 1000, 2000];

export default async function ReplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ jid: string }>;
  searchParams: Promise<{ limit?: string }>;
}) {
  const { jid: jidParam } = await params;
  const sp = await searchParams;
  const chatJid = decodeURIComponent(jidParam);
  const limit = Math.max(50, Math.min(2000, Number(sp.limit ?? "500") || 500));

  const messages = replayMessages(chatJid, limit);
  const aliases = new Set(aliasesForChatJid(chatJid));
  const meta = listChats(500, false).find((c) => aliases.has(c.jid));
  const title = meta?.name ?? chatJid;
  const isGroup = meta?.is_group ?? chatJid.endsWith("@g.us");

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 px-4 md:px-6 py-3 border-b border-[var(--color-line)] bg-[var(--background)]/85 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href={`/chat/${encodeURIComponent(chatJid)}`}
            aria-label="Back to chat"
            title="Back to chat"
            className="grid place-items-center size-9 -ml-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
          >
            <CaretLeft size={18} weight="bold" />
          </Link>
          <Avatar name={title} seed={meta?.jid ?? chatJid} group={isGroup} size={36} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold tracking-tight text-zinc-50 truncate">{title}</h1>
            <p className="text-[13px] text-zinc-500 truncate">Replay of the last {messages.length.toLocaleString()} messages</p>
          </div>
          <nav aria-label="How many messages" className="flex w-full sm:w-auto justify-between sm:justify-start rounded-full bg-[var(--color-surface-2)] p-0.5">
            {LIMITS.map((n) => (
              <Link
                key={n}
                href={`/chat/${encodeURIComponent(chatJid)}/replay?limit=${n}`}
                className={`h-8 px-3 inline-flex items-center rounded-full text-[13px] tabular-nums transition-colors ${
                  n === limit ? "bg-emerald-400/15 text-emerald-300" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {n.toLocaleString()}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="flex-1 min-h-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgb(52_211_153/0.06),transparent)]">
        <div className="h-full w-full max-w-4xl mx-auto">
          <ReplayPlayer key={limit} messages={messages} isGroup={isGroup} />
        </div>
      </div>
    </div>
  );
}
