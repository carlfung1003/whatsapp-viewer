import { NextResponse } from "next/server";
import { setTriageDismissal } from "@/lib/state-db";

// Mark a triaged chat as done (hidden until a newer message arrives), or undo.
export async function POST(req: Request) {
  let body: { chat_jid?: string; last_msg_id?: string; undo?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.chat_jid || (!body.undo && !body.last_msg_id)) {
    return NextResponse.json({ error: "chat_jid and last_msg_id required" }, { status: 400 });
  }
  setTriageDismissal(body.chat_jid, body.undo ? null : body.last_msg_id!);
  return NextResponse.json({ ok: true });
}
