/**
 * Writable state DB for viewer-managed manual state (paid/shipped toggles,
 * notes, etc.). Lives at ~/whatsapp-viewer-state/state.db so it stays
 * separate from the bridge's read-only SQLite.
 */
import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const STATE_DIR = path.join(os.homedir(), "whatsapp-viewer-state");
const STATE_DB = path.join(STATE_DIR, "state.db");

let _db: Database.Database | null = null;

function stateDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  _db = new Database(STATE_DB);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS claim_state (
      message_id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      shipped INTEGER NOT NULL DEFAULT 0,
      claimer_override TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (message_id, chat_jid)
    );
    CREATE TABLE IF NOT EXISTS topic_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return _db;
}

export function getTopicCache(key: string, maxAgeHours = 24): unknown | null {
  const row = stateDb()
    .prepare(
      `SELECT payload FROM topic_cache
       WHERE cache_key = ? AND datetime(created_at) > datetime('now', ?)`
    )
    .get(key, `-${maxAgeHours} hours`) as { payload: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

export function setTopicCache(key: string, payload: unknown): void {
  stateDb()
    .prepare(
      `INSERT INTO topic_cache (cache_key, payload, created_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at`
    )
    .run(key, JSON.stringify(payload));
}

export type ClaimState = {
  paid: boolean;
  shipped: boolean;
  claimer_override: string | null;
  notes: string | null;
  updated_at: string;
};

export function getClaimStates(messageIds: string[]): Map<string, ClaimState> {
  if (messageIds.length === 0) return new Map();
  const placeholders = messageIds.map(() => "?").join(",");
  const rows = stateDb()
    .prepare(
      `SELECT message_id, paid, shipped, claimer_override, notes, updated_at
       FROM claim_state WHERE message_id IN (${placeholders})`
    )
    .all(...messageIds) as Array<{
      message_id: string;
      paid: number;
      shipped: number;
      claimer_override: string | null;
      notes: string | null;
      updated_at: string;
    }>;
  const map = new Map<string, ClaimState>();
  for (const r of rows) {
    map.set(r.message_id, {
      paid: !!r.paid,
      shipped: !!r.shipped,
      claimer_override: r.claimer_override,
      notes: r.notes,
      updated_at: r.updated_at,
    });
  }
  return map;
}

export function setClaimState(
  message_id: string,
  chat_jid: string,
  fields: Partial<Omit<ClaimState, "updated_at">>
): void {
  const cur = getClaimStates([message_id]).get(message_id) ?? {
    paid: false,
    shipped: false,
    claimer_override: null,
    notes: null,
    updated_at: "",
  };
  const next = { ...cur, ...fields };
  stateDb()
    .prepare(
      `INSERT INTO claim_state (message_id, chat_jid, paid, shipped, claimer_override, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(message_id, chat_jid) DO UPDATE SET
         paid = excluded.paid,
         shipped = excluded.shipped,
         claimer_override = excluded.claimer_override,
         notes = excluded.notes,
         updated_at = excluded.updated_at`
    )
    .run(
      message_id,
      chat_jid,
      next.paid ? 1 : 0,
      next.shipped ? 1 : 0,
      next.claimer_override,
      next.notes,
    );
}
