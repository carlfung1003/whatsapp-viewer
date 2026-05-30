import { NextResponse } from "next/server";
import { setClaimState } from "@/lib/state-db";

export async function POST(req: Request) {
  let body: {
    message_id?: string;
    chat_jid?: string;
    paid?: boolean;
    shipped?: boolean;
    claimer_override?: string | null;
    notes?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { message_id, chat_jid, ...fields } = body;
  if (!message_id || !chat_jid) {
    return NextResponse.json({ error: "message_id and chat_jid required" }, { status: 400 });
  }
  try {
    setClaimState(message_id, chat_jid, fields);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
