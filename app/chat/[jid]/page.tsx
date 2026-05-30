import { listMessages, detectDrops, listChats, aliasesForChatJid } from "@/lib/db";
import { MessageList, DropsBanner } from "@/components/Messages";
import ChatSummary from "@/components/ChatSummary";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ jid: string }> }) {
  const { jid: rawJid } = await params;
  const jid = decodeURIComponent(rawJid);

  // Accept either alias for a DM — find by canonical-or-alias match
  const aliasSet = new Set(aliasesForChatJid(jid));
  const allChats = listChats(500);
  const chat = allChats.find((c) => aliasSet.has(c.jid));
  if (!chat) notFound();

  const messages = listMessages(jid, 200);
  const drops = detectDrops(messages);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-4 py-3 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-zinc-100 truncate">{chat.name ?? jid}</h1>
            <p className="text-xs text-zinc-500">
              {chat.is_group ? "group" : "dm"} · {chat.message_count.toLocaleString()} messages · {jid}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/chat/${encodeURIComponent(jid)}/replay`}
              className="text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              title="Replay conversation chronologically"
            >
              ▶ Replay
            </Link>
            <ChatSummary chatJid={jid} />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <DropsBanner drops={drops} messages={messages} chatJid={jid} />
        <MessageList messages={messages} />
      </div>
    </div>
  );
}
