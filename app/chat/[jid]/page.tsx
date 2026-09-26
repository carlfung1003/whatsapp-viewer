import { listMessages, detectDrops, listChats, aliasesForChatJid } from "@/lib/db";
import { MessageList, DropsBanner } from "@/components/Messages";
import ChatSummary from "@/components/ChatSummary";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Play } from "@phosphor-icons/react/dist/ssr";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ jid: string }> }) {
  const { jid: rawJid } = await params;
  const jid = decodeURIComponent(rawJid);

  // Accept either alias for a DM — find by canonical-or-alias match
  const aliasSet = new Set(aliasesForChatJid(jid));
  const allChats = listChats(500, false);
  const chat = allChats.find((c) => aliasSet.has(c.jid));
  if (!chat) notFound();

  const messages = listMessages(jid, 200);
  const drops = detectDrops(messages);

  const name = chat.name ?? jid;
  return (
    <div className="h-full flex flex-col">
      <header className="px-4 md:px-6 py-3 border-b border-[var(--color-line)] bg-[var(--background)]/85 backdrop-blur-md sticky top-0 z-20">
        {/* flex-wrap: an open ChatSummary panel takes its own full-width row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Avatar name={name} seed={chat.jid} group={chat.is_group} size={40} />
          <div className="min-w-0 flex-1" title={jid}>
            <h1 className="text-[17px] font-semibold tracking-tight text-zinc-50 truncate">{name}</h1>
            <p className="text-[13px] text-zinc-500">
              {chat.is_group ? "Group" : "Direct message"}, {chat.message_count.toLocaleString()} messages
            </p>
          </div>
          <Link
            href={`/chat/${encodeURIComponent(jid)}/replay`}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-ctl)] text-sm text-zinc-300 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] active:scale-[0.97] transition"
            title="Replay conversation chronologically"
          >
            <Play size={14} weight="fill" />
            <span className="hidden sm:inline">Replay</span>
          </Link>
          <ChatSummary chatJid={jid} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgb(52_211_153/0.06),transparent)]">
        <DropsBanner drops={drops} messages={messages} chatJid={jid} />
        <MessageList messages={messages} isGroup={chat.is_group} />
      </div>
    </div>
  );
}
