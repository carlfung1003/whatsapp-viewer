import { listMessages, detectDrops, listChats } from "@/lib/db";
import { MessageList, DropsBanner } from "@/components/Messages";
import ChatSummary from "@/components/ChatSummary";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ jid: string }> }) {
  const { jid: rawJid } = await params;
  const jid = decodeURIComponent(rawJid);

  const allChats = listChats(500);
  const chat = allChats.find((c) => c.jid === jid);
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
          <ChatSummary chatJid={jid} />
        </div>
      </header>

      <DropsBanner drops={drops} messages={messages} chatJid={jid} />

      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} />
      </div>
    </div>
  );
}
