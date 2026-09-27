import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runTriage, TriageError } from "@/lib/triage-run";

export const dynamic = "force-dynamic";

// Read-only "who needs a reply" briefing for an external agent (Muse).
// The only route reachable through Tailscale Funnel; guarded by its own
// bearer token (BRIEFING_TOKEN), not the browser passcode. Returns no raw
// message text: names, priority, reason, wait time and a draft reply.

function authorized(req: Request): boolean {
  const token = process.env.BRIEFING_TOKEN;
  if (!token) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

function hoursLabel(h: number): string {
  if (h < 1) return "under an hour";
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export async function GET(req: Request) {
  if (!process.env.BRIEFING_TOKEN) {
    return NextResponse.json({ error: "briefing not configured" }, { status: 503 });
  }
  if (!authorized(req)) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let t;
  try {
    t = await runTriage();
  } catch (e) {
    const status = e instanceof TriageError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }

  const open = t.items.filter((i) => i.needs_reply && !i.dismissed);
  const items = open.map((i) => ({
    chat: i.name,
    is_group: i.is_group,
    priority: i.priority,
    reason: i.reason,
    waiting_hours: Math.round(i.hours_waiting * 10) / 10,
    suggested_reply: i.suggested_reply,
  }));

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "text") {
    const lines = items.length
      ? items.map((i) => `- [${i.priority}] ${i.chat}${i.is_group ? " (group)" : ""}, waiting ${hoursLabel(i.waiting_hours)}: ${i.reason}`)
      : ["- Nothing needs a reply right now."];
    const body = [
      `WhatsApp: ${items.length} chat${items.length === 1 ? " needs" : "s need"} a reply (analysed ${new Date(t.generated_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT).`,
      ...lines,
    ].join("\n");
    return new NextResponse(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }

  return NextResponse.json(
    {
      analysed_at: t.generated_at,
      needs_reply_count: items.length,
      waiting_chats_considered: t.candidates,
      items,
      note: "Excludes iLuxury customer groups, chats marked done, and group chatter not aimed at the user.",
    },
    { headers: { "cache-control": "no-store" } }
  );
}
