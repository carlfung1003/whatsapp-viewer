import Link from "next/link";
import { listChats } from "@/lib/db";
import { listLedgerDrops, ILUXURY_DEFAULT_JID } from "@/lib/iluxury";
import ClaimLedger from "@/components/ClaimLedger";

export const dynamic = "force-dynamic";

export default async function ILuxuryPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string; days?: string }>;
}) {
  const sp = await searchParams;
  const chatJid = sp.chat ?? ILUXURY_DEFAULT_JID;
  const days = Math.max(1, Math.min(180, Number(sp.days ?? "30") || 30));
  const drops = listLedgerDrops(chatJid, days);

  // Provide a quick picker among iLuxury-named chats
  const allChats = listChats(500);
  const iluxuryChats = allChats.filter((c) =>
    (c.name ?? "").toLowerCase().includes("iluxury") || (c.name ?? "").toLowerCase().includes("luxury")
  );
  const selectedChat = allChats.find((c) => c.jid === chatJid);

  const totals = drops.reduce(
    (a, d) => ({
      items: a.items + d.item_count,
      claimed: a.claimed + d.claimed_count,
      paid: a.paid + d.paid_count,
      shipped: a.shipped + d.shipped_count,
    }),
    { items: 0, claimed: 0, paid: 0, shipped: 0 }
  );

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-100 truncate">
              iLuxury claim ledger
            </h1>
            <p className="text-xs text-zinc-500">
              {drops.length} drops · {totals.items} items ·{" "}
              <span className="text-emerald-400">{totals.claimed} claimed</span> ·{" "}
              <span className="text-amber-400">{totals.paid} paid</span> ·{" "}
              <span className="text-blue-400">{totals.shipped} shipped</span> · last {days}d
            </p>
            {selectedChat && (
              <p className="text-[11px] text-zinc-600 truncate mt-0.5">
                {selectedChat.name ?? chatJid}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 text-xs">
              {[7, 14, 30, 60, 90].map((d) => (
                <Link
                  key={d}
                  href={`/iluxury?chat=${encodeURIComponent(chatJid)}&days=${d}`}
                  className={`px-2 py-1 rounded border ${
                    d === days
                      ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                      : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {d}d
                </Link>
              ))}
            </div>
          </div>
        </div>
        {iluxuryChats.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {iluxuryChats.map((c) => (
              <Link
                key={c.jid}
                href={`/iluxury?chat=${encodeURIComponent(c.jid)}&days=${days}`}
                className={`px-2 py-1 rounded border ${
                  c.jid === chatJid
                    ? "bg-emerald-700/40 border-emerald-700 text-zinc-100"
                    : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {c.name ?? c.jid}
              </Link>
            ))}
          </div>
        )}
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <ClaimLedger drops={drops} chatJid={chatJid} />
      </div>
    </div>
  );
}
