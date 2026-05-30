import { ImageResponse } from "next/og";
import { contactSnapshot } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

function fmtYear(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).getFullYear().toString();
}

const flex = { display: "flex" } as const;
const col = { ...flex, flexDirection: "column" as const };
const row = { ...flex, flexDirection: "row" as const };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chat = url.searchParams.get("chat");
  if (!chat) return new Response("chat required", { status: 400 });
  const snap = contactSnapshot(chat);
  if (!snap) return new Response("no data", { status: 404 });

  const yearSpan =
    snap.first_message && snap.last_message
      ? `${fmtYear(snap.first_message)} — ${fmtYear(snap.last_message)}`
      : "—";
  const longestSilence =
    snap.longest_gap_days >= 1 ? `${snap.longest_gap_days.toFixed(0)} days` : "<1 day";
  const topEmojiSub = `used ${snap.top_emoji_count}× by either of you`;

  return new ImageResponse(
    (
      <div
        style={{
          ...col,
          width: "1200px",
          height: "630px",
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "radial-gradient(circle at 80% 20%, #064e3b 0%, transparent 50%), radial-gradient(circle at 20% 80%, #1e3a8a 0%, transparent 50%)",
          padding: "60px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#fafafa",
        }}
      >
        <div style={{ ...col, gap: "8px" }}>
          <div style={{ ...flex, fontSize: "20px", color: "#10b981", letterSpacing: "4px", textTransform: "uppercase" }}>
            WhatsApp wrapped
          </div>
          <div style={{ ...flex, fontSize: "64px", fontWeight: 700, lineHeight: 1 }}>{snap.name}</div>
          <div style={{ ...flex, fontSize: "20px", color: "#a1a1aa" }}>{yearSpan}</div>
        </div>

        <div style={{ ...row, marginTop: "48px", gap: "32px" }}>
          <Stat label="Total messages" value={snap.total_messages.toLocaleString()} />
          <Stat label="From me" value={snap.by_me.toLocaleString()} accent="#10b981" />
          <Stat label="From them" value={snap.by_them.toLocaleString()} accent="#3b82f6" />
          <Stat label="Images" value={snap.total_images.toLocaleString()} />
        </div>

        <div style={{ ...row, marginTop: "32px", gap: "32px" }}>
          <Stat label="Peak day" value={`${DOW_NAMES[snap.peak_dow]} · ${fmtHour(snap.peak_hour)}`} />
          <Stat label="Longest silence" value={longestSilence} />
        </div>

        <div style={{ ...row, marginTop: "auto", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ ...col, gap: "6px" }}>
            <div style={{ ...flex, fontSize: "16px", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "2px" }}>
              Top emoji
            </div>
            <div style={{ ...flex, fontSize: "96px", lineHeight: 1 }}>{snap.top_emoji ?? "—"}</div>
            <div style={{ ...flex, fontSize: "16px", color: "#71717a" }}>{topEmojiSub}</div>
          </div>
          <div style={{ ...col, gap: "6px", alignItems: "flex-end" }}>
            <div style={{ ...flex, fontSize: "16px", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "2px" }}>
              Reactions
            </div>
            <div style={{ ...row, gap: "16px" }}>
              <div style={{ ...col, alignItems: "flex-end" }}>
                <div style={{ ...flex, fontSize: "32px", color: "#10b981" }}>{snap.reactions_received.toString()}</div>
                <div style={{ ...flex, fontSize: "14px", color: "#71717a" }}>received</div>
              </div>
              <div style={{ ...col, alignItems: "flex-end" }}>
                <div style={{ ...flex, fontSize: "32px", color: "#3b82f6" }}>{snap.reactions_given.toString()}</div>
                <div style={{ ...flex, fontSize: "14px", color: "#71717a" }}>given</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ ...col, gap: "4px" }}>
      <div style={{ ...flex, fontSize: "14px", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "1.5px" }}>
        {label}
      </div>
      <div style={{ ...flex, fontSize: "40px", fontWeight: 600, color: accent ?? "#fafafa" }}>{value}</div>
    </div>
  );
}
