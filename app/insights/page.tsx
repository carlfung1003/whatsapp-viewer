import Link from "next/link";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/insights/reply-latency",
    title: "Reply latency",
    desc: "How fast you reply to each contact — median time-to-respond, per-DM.",
  },
  {
    href: "/insights/initiator",
    title: "Initiator vs responder",
    desc: "Who reaches out first in each DM, by share of conversation starts.",
  },
  {
    href: "/insights/calendar",
    title: "Activity calendar",
    desc: "GitHub-style year grid — daily message volume shaded by intensity.",
  },
  {
    href: "/insights/drifting",
    title: "Drifting relationships",
    desc: "DMs where activity dropped >50% from the prior 90-day window.",
  },
  {
    href: "/insights/words",
    title: "Words + emojis",
    desc: "Most-used words and emojis in a specific chat — picker on the page.",
  },
  {
    href: "/insights/reactions",
    title: "Reaction analytics",
    desc: "Your messages that hit, and which emojis you give vs receive.",
  },
];

export default function InsightsHub() {
  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <h1 className="text-lg font-semibold text-zinc-100">Insights</h1>
        <p className="text-xs text-zinc-500">
          Six analytics views, all read-only over your bridge SQLite.
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CARDS.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="block border border-zinc-800 rounded-lg bg-zinc-950 p-4 hover:bg-zinc-900 hover:border-zinc-700"
              >
                <h2 className="text-base font-semibold text-zinc-100">{c.title}</h2>
                <p className="text-sm text-zinc-400 mt-1">{c.desc}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
