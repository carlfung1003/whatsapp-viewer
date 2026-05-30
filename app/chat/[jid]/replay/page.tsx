import Link from "next/link";
import { replayMessages } from "@/lib/insights";
import { listChats } from "@/lib/db";
import ReplayPlayer from "@/components/ReplayPlayer";

export const dynamic = "force-dynamic";

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
  const allChats = listChats(500);
  const meta = allChats.find((c) => c.jid === chatJid);
  const title = meta?.name ?? chatJid;

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-100 truncate">Replay · {title}</h1>
            <p className="text-xs text-zinc-500">
              {messages.length} messages. Drag the slider or press play. Reactions appear at their real timestamps.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 text-xs">
              {[200, 500, 1000, 2000].map((n) => (
                <Link
                  key={n}
                  href={`/chat/${encodeURIComponent(chatJid)}/replay?limit=${n}`}
                  className={`px-2 py-1 rounded border ${
                    n === limit
                      ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                      : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {n}
                </Link>
              ))}
            </div>
            <Link
              href={`/chat/${encodeURIComponent(chatJid)}`}
              className="text-xs text-zinc-400 hover:text-zinc-200 ml-2"
            >
              ← chat
            </Link>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-hidden p-6 max-w-3xl mx-auto w-full">
        <ReplayPlayer messages={messages} />
      </div>
    </div>
  );
}
