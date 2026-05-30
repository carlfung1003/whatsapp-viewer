import Link from "next/link";
import { listChats } from "@/lib/db";
import Simulator from "@/components/Simulator";

export const dynamic = "force-dynamic";

export default function SimulatorPage() {
  const dms = listChats(300).filter((c) => !c.is_group);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Conversation simulator</h1>
            <p className="text-xs text-zinc-500">
              Pick a contact, type a draft, get Claude&apos;s prediction of how they&apos;d respond — based on their actual message history with you.
            </p>
          </div>
          <Link href="/insights" className="text-xs text-zinc-400 hover:text-zinc-200">
            ← insights
          </Link>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <Simulator dms={dms} />
      </div>
    </div>
  );
}
