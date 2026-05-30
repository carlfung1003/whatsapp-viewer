import Link from "next/link";
import { listChats } from "@/lib/db";
import { wordFrequencyForChat, emojiFrequencyForChat } from "@/lib/insights";

export const dynamic = "force-dynamic";

export default async function WordsPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string }>;
}) {
  const sp = await searchParams;
  const chatJid = sp.chat ?? "";
  const chats = listChats(100);
  const selected = chats.find((c) => c.jid === chatJid);
  const words = chatJid ? wordFrequencyForChat(chatJid, 40) : [];
  const emojis = chatJid ? emojiFrequencyForChat(chatJid, 24) : [];
  const wordMax = words[0]?.count ?? 1;

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-100">Words + emojis</h1>
            <p className="text-xs text-zinc-500">
              {selected
                ? `Top vocab in ${selected.name ?? chatJid}`
                : "Pick a chat to analyze its top words and emojis."}
            </p>
          </div>
          <Link href="/insights" className="text-xs text-zinc-400 hover:text-zinc-200">
            ← insights
          </Link>
        </div>
        <form action="/insights/words" method="get" className="mt-3 flex items-center gap-2">
          <select
            name="chat"
            defaultValue={chatJid}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600 max-w-md w-full"
          >
            <option value="">— pick a chat —</option>
            {chats.map((c) => (
              <option key={c.jid} value={c.jid}>
                {(c.is_group ? "👥 " : "💬 ") + (c.name ?? c.jid)} ({c.message_count.toLocaleString()})
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-sm text-white"
          >
            Go
          </button>
        </form>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        {!chatJid ? (
          <div className="text-center text-sm text-zinc-500 py-16">Pick a chat to begin.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section>
              <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
                Top words ({words.length})
              </h2>
              <ul className="flex flex-col gap-1">
                {words.map((w) => (
                  <li key={w.word} className="flex items-center gap-2 text-sm">
                    <span className="w-24 truncate text-zinc-200">{w.word}</span>
                    <div className="flex-1 h-3 bg-zinc-900 rounded overflow-hidden">
                      <div
                        className="bg-emerald-700 h-full"
                        style={{ width: `${(w.count / wordMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-zinc-500 tabular-nums text-xs">
                      {w.count}
                    </span>
                  </li>
                ))}
                {words.length === 0 && (
                  <li className="text-sm text-zinc-500">No words to tally.</li>
                )}
              </ul>
            </section>
            <section>
              <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
                Top emojis ({emojis.length})
              </h2>
              <ul className="grid grid-cols-2 gap-2">
                {emojis.map((e) => (
                  <li
                    key={e.emoji}
                    className="border border-zinc-800 rounded p-2 bg-zinc-950 flex items-center gap-3"
                  >
                    <span className="text-2xl">{e.emoji}</span>
                    <div className="flex-1 text-xs text-zinc-400">
                      <div className="text-zinc-200 font-medium tabular-nums">
                        {e.total} total
                      </div>
                      <div className="text-zinc-500">
                        <span className="text-emerald-400">{e.by_me}</span> me ·{" "}
                        <span className="text-amber-400">{e.by_them}</span> them
                      </div>
                    </div>
                  </li>
                ))}
                {emojis.length === 0 && (
                  <li className="text-sm text-zinc-500 col-span-2">No emojis used here.</li>
                )}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
