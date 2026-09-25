import Link from "next/link";
import {
  ArrowBendUpLeft,
  ArrowRight,
  ChatsCircle,
  Sparkle,
  Stack,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";

const SHORTCUTS = [
  { href: "/needs-reply", label: "Needs a reply", desc: "DMs where they sent the last message", icon: ArrowBendUpLeft },
  { href: "/drops", label: "Image drops", desc: "Photo bursts across every chat", icon: Stack },
  { href: "/insights", label: "Insights", desc: "Reply speed, drifting friends, reactions", icon: Sparkle },
  { href: "/contacts", label: "People", desc: "Everyone you talk to, across chats", icon: UsersThree },
];

export default function Home() {
  return (
    <div className="min-h-full grid place-items-center px-6 py-16 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgb(52_211_153/0.08),transparent)]">
      <div className="w-full max-w-[560px] animate-rise">
        <div className="grid place-items-center size-14 rounded-[16px] bg-emerald-400/15 text-emerald-300 mb-6">
          <ChatsCircle size={30} weight="duotone" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Pick a conversation</h1>
        <p className="mt-2 text-[15px] text-zinc-400 max-w-[46ch]">
          Choose a chat on the left, or jump straight into one of these.
        </p>
        <div className="mt-8 grid sm:grid-cols-2 gap-2">
          {SHORTCUTS.map(({ href, label, desc, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-3 p-4 rounded-[14px] bg-[var(--color-surface)] ring-1 ring-inset ring-white/5 hover:ring-emerald-400/30 hover:bg-[var(--color-surface-2)] transition"
            >
              <Icon size={20} className="mt-0.5 shrink-0 text-emerald-300" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between text-[15px] font-medium text-zinc-100">
                  {label}
                  <ArrowRight
                    size={14}
                    className="text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-300"
                  />
                </span>
                <span className="block mt-0.5 text-[13px] text-zinc-500">{desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
