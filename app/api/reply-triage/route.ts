import { NextResponse } from "next/server";
import { runTriage, TriageError } from "@/lib/triage-run";

export const dynamic = "force-dynamic";

export type { TriageItem, TriageResponse } from "@/lib/triage-run";

export async function POST(req: Request) {
  let body: { refresh?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  try {
    return NextResponse.json(await runTriage({ refresh: !!body.refresh }));
  } catch (e) {
    const status = e instanceof TriageError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
