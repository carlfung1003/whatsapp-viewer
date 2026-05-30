import Link from "next/link";
import { listContactMessagesAcrossChats, resolveName } from "@/lib/db";
import ContactTimeline from "@/components/ContactTimeline";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ key: string }> }) {
  const { key: rawKey } = await params;
  const contactKey = decodeURIComponent(rawKey);
  const name = resolveName(contactKey);
  const messages = listContactMessagesAcrossChats(contactKey, 500);

  // Per-chat tallies for the filter pills
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
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
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
      </header>

      <div className="flex-1 overflow-y-auto px-6 max-w-3xl mx-auto w-full">
        <ContactTimeline messages={messages} chatBreakdown={chatBreakdown} />
      </div>
    </div>
  );
}
