import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";

const BRIDGE_STORE = path.join(os.homedir(), "whatsapp-mcp", "whatsapp-bridge", "store");
const MAX_ROWS = 1000;
const TIMEOUT_MS = 5_000;

// Block obvious writes; SQLite's read-only open enforces this at the db
// layer too, but matching here gives a clearer error.
const WRITE_PATTERN = /\b(insert|update|delete|drop|alter|create|attach|detach|replace|reindex|vacuum|pragma)\b/i;

export async function POST(req: Request) {
  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  const rawQuery = (body.query ?? "").trim();
  if (!rawQuery) return NextResponse.json({ error: "empty query" }, { status: 400 });
  if (WRITE_PATTERN.test(rawQuery)) {
    return NextResponse.json(
      { error: "writes are blocked — this connection is read-only" },
      { status: 400 }
    );
  }

  // Auto-enforce LIMIT if user forgot one
  let query = rawQuery;
  if (!/\blimit\s+\d+/i.test(query)) {
    query = query.replace(/;\s*$/, "") + ` LIMIT ${MAX_ROWS}`;
  }

  // Open both DBs read-only; ATTACH whatsapp.db so user queries can join on
  // lid_map / contacts without opening two connections.
  const db = new Database(path.join(BRIDGE_STORE, "messages.db"), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    db.exec(`ATTACH DATABASE '${path.join(BRIDGE_STORE, "whatsapp.db").replaceAll("'", "''")}' AS wa`);

    const start = Date.now();
    // Race against a timeout. better-sqlite3 is synchronous so this is best-
    // effort; in practice MAX_ROWS keeps things bounded.
    const stmt = db.prepare(query);
    stmt.raw(false);
    const rowsPromise = new Promise<unknown[]>((resolve, reject) => {
      try {
        const result = stmt.all() as unknown[];
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
    const timed = await Promise.race([
      rowsPromise,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
    ]).catch((e) => e);

    const durationMs = Date.now() - start;

    if (timed instanceof Error) {
      return NextResponse.json({ error: timed.message, durationMs }, { status: 400 });
    }
    const rows = timed as Array<Record<string, unknown>>;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return NextResponse.json({
      columns,
      rows,
      rowCount: rows.length,
      durationMs,
      truncated: rows.length === MAX_ROWS,
      effectiveQuery: query !== rawQuery ? query : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  } finally {
    db.close();
  }
}
