import type { ReactNode } from "react";
import { UsersThree } from "@phosphor-icons/react/dist/ssr";

// Stable per-person hue so the same contact is recognisable everywhere.
// Low chroma on purpose: identity, not decoration.
function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

function initials(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (!clean) return "?";
  // CJK names: first character reads better than two initials.
  if (/\p{Script=Han}/u.test(clean[0])) return clean[0];
  const parts = clean.split(/\s+/);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({
  name,
  seed,
  group = false,
  size = 40,
}: {
  name: string;
  seed: string;
  group?: boolean;
  size?: number;
}) {
  const hue = hueFor(seed);
  const numeric = /^\+?[0-9]+$/.test(name);
  return (
    <div
      aria-hidden
      className="shrink-0 rounded-full grid place-items-center font-medium select-none ring-1 ring-white/5"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `oklch(0.32 0.05 ${hue})`,
        color: `oklch(0.88 0.06 ${hue})`,
      }}
    >
      {group || numeric ? <UsersThree size={size * 0.48} weight="duotone" /> : initials(name)}
    </div>
  );
}

export function IconButton({
  children,
  title,
  onClick,
  active = false,
  className = "",
}: {
  children: ReactNode;
  title: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-ctl)] text-sm transition-[background,color,transform] active:scale-[0.97] ${
        active
          ? "bg-emerald-400/15 text-emerald-300"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
      } ${className}`}
    >
      {children}
    </button>
  );
}

// "14:08", "Yesterday", "Tue", "Sep 12", "12/3/24"
export function listTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "numeric", day: "numeric" });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
