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
    desc: "DMs where activity dropped >50% from prior window. Includes AI re-opener composer.",
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
  {
    href: "/insights/awkward",
    title: "Awkwardness detector",
    desc: "Moments where your normal back-and-forth rhythm hit a long silence. The message that landed before the wall.",
  },
  {
    href: "/insights/simulator",
    title: "Conversation simulator",
    desc: "Type a draft, Claude predicts how a specific contact would actually respond. Pre-mortem for risky messages.",
  },
  {
    href: "/insights/snapshot",
    title: "Relationship snapshot",
    desc: "Spotify-Wrapped-style PNG per contact — totals, peak hour, longest silence, top emoji. One-click download.",
  },
  {
    href: "/insights/topics",
    title: "Topic graph",
    desc: "Claude clusters recent DMs into themes (wedding, family, projects). Cached for 24h.",
  },
  {
    href: "/insights/birthdays",
    title: "Birthdays",
    desc: "Birthdays inferred from past 🎂 / &ldquo;happy birthday&rdquo; messages. Download as .ics for your calendar.",
  },
];

export default function InsightsHub() {
  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 bg-zinc-950/80 backdrop-blur shrink-0">
        <h1 className="text-lg font-semibold text-zinc-100">Insights</h1>
        <p className="text-xs text-zinc-500">
          {CARDS.length} analytics views over your WhatsApp data — SQL-backed where simple, Claude-backed where smart.
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
