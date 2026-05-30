import Link from "next/link";
import { listChats } from "@/lib/db";
import SnapshotPicker from "@/components/SnapshotPicker";

export const dynamic = "force-dynamic";

export default function SnapshotPage() {
  const chats = listChats(300);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Relationship snapshot</h1>
            <p className="text-xs text-zinc-500">
              Spotify-Wrapped-style PNG card per contact. Pick someone, download.
            </p>
          </div>
          <Link href="/insights" className="text-xs text-zinc-400 hover:text-zinc-200">
            ← insights
          </Link>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <SnapshotPicker chats={chats} />
      </div>
    </div>
  );
}
