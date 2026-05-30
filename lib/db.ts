import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";

const BRIDGE_STORE = path.join(os.homedir(), "whatsapp-mcp", "whatsapp-bridge", "store");

let _messagesDb: Database.Database | null = null;
let _whatsappDb: Database.Database | null = null;
let _nameCache: Map<string, string> | null = null;
let _ownLidCache: Set<string> | null = null;

export function messagesDb(): Database.Database {
  if (!_messagesDb) {
    _messagesDb = new Database(path.join(BRIDGE_STORE, "messages.db"), { readonly: true, fileMustExist: true });
  }
  return _messagesDb;
}

export function whatsappDb(): Database.Database {
  if (!_whatsappDb) {
    _whatsappDb = new Database(path.join(BRIDGE_STORE, "whatsapp.db"), { readonly: true, fileMustExist: true });
  }
  return _whatsappDb;
}

function ownLids(): Set<string> {
  if (_ownLidCache) return _ownLidCache;
  const set = new Set<string>();
  try {
    const device = whatsappDb().prepare("SELECT jid FROM whatsmeow_device LIMIT 1").get() as { jid?: string } | undefined;
    if (device?.jid) {
      // jid looks like "<phone>.<X>:<Y>@s.whatsapp.net" — pull the user part
      const userPart = device.jid.split("@")[0].split(":")[0];
      // Find the LID that maps to this phone
      const lidRow = whatsappDb().prepare("SELECT lid FROM whatsmeow_lid_map WHERE pn = ?").get(userPart) as { lid?: string } | undefined;
      if (lidRow?.lid) set.add(lidRow.lid);
      set.add(userPart);
    }
  } catch {
    /* ignore */
  }
  _ownLidCache = set;
  return set;
}

/**
 * Resolve a WhatsApp sender identifier (LID, phone, or LID@lid) to a display name.
 * Falls back to the raw identifier when no contact is found.
 */
export function resolveName(rawSender: string | null | undefined): string {
  if (!rawSender) return "(unknown)";
  if (!_nameCache) _nameCache = new Map();
  if (_nameCache.has(rawSender)) return _nameCache.get(rawSender)!;

  let name: string | null = null;
  const own = ownLids();

  // Strip @lid / @s.whatsapp.net suffix; keep bare id
  const bare = rawSender.replace(/@.*/, "");

  if (own.has(bare) || own.has(rawSender)) {
    name = "Me";
  } else {
    // Look up via lid_map first (treats bare as LID)
    const lidRow = whatsappDb().prepare("SELECT pn FROM whatsmeow_lid_map WHERE lid = ?").get(bare) as { pn?: string } | undefined;
    const phone = lidRow?.pn ?? bare;

    const contact = whatsappDb()
      .prepare(
        `SELECT push_name, full_name, first_name FROM whatsmeow_contacts WHERE their_jid = ? OR their_jid = ? LIMIT 1`
      )
      .get(`${phone}@s.whatsapp.net`, `${bare}@lid`) as
      | { push_name?: string; full_name?: string; first_name?: string }
      | undefined;

    name = contact?.full_name || contact?.push_name || contact?.first_name || null;
    if (!name) name = `+${phone}`;
  }

  _nameCache.set(rawSender, name);
  return name;
}

export type ChatRow = {
  jid: string;
  name: string | null;
  last_message_time: string | null;
  message_count: number;
  is_group: boolean;
};

/**
 * Return the set of chat_jid aliases for a DM. WhatsApp's ongoing LID rollout
 * splits a single DM across `<phone>@s.whatsapp.net` and `<lid>@lid`; we look
 * them up via whatsmeow_lid_map and return both so queries see the merged view.
 * Group jids (@g.us) and unrecognized jids return as-is.
 */
export function aliasesForChatJid(jid: string): string[] {
  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return [jid];
  const bare = jid.replace(/@.*/, "");
  try {
    if (jid.endsWith("@lid")) {
      const row = whatsappDb()
        .prepare("SELECT pn FROM whatsmeow_lid_map WHERE lid = ?")
        .get(bare) as { pn?: string } | undefined;
      if (row?.pn) return [jid, `${row.pn}@s.whatsapp.net`];
    } else {
      const row = whatsappDb()
        .prepare("SELECT lid FROM whatsmeow_lid_map WHERE pn = ?")
        .get(bare) as { lid?: string } | undefined;
      if (row?.lid) return [jid, `${row.lid}@lid`];
    }
  } catch {
    /* ignore */
  }
  return [jid];
}

/** Pick the canonical jid for a DM — prefer the phone-number form. */
function canonicalJid(jid: string): string {
  const aliases = aliasesForChatJid(jid);
  return aliases.find((j) => j.endsWith("@s.whatsapp.net")) ?? aliases[0];
}

export function listChats(limit = 50): ChatRow[] {
  // Pull more than `limit` so we have headroom to merge LID/PN duplicates without
  // running short. Use MAX(timestamp) FROM messages for real last activity.
  const raw = messagesDb()
    .prepare(
      `SELECT c.jid, c.name, COALESCE(m.last_ts, c.last_message_time) AS last_message_time, COALESCE(m.cnt, 0) AS message_count
       FROM chats c
       LEFT JOIN (
         SELECT chat_jid, MAX(timestamp) AS last_ts, COUNT(*) AS cnt FROM messages GROUP BY chat_jid
       ) m ON m.chat_jid = c.jid
       WHERE last_message_time IS NOT NULL
       ORDER BY last_message_time DESC
       LIMIT ?`
    )
    .all(limit * 2) as Array<{ jid: string; name: string | null; last_message_time: string | null; message_count: number }>;

  // Merge LID/PN duplicates: group by canonical jid, sum message counts, take
  // the most recent last_message_time, prefer a non-numeric chat name.
  const byCanonical = new Map<string, { jid: string; name: string | null; last_message_time: string | null; message_count: number }>();
  for (const r of raw) {
    const key = canonicalJid(r.jid);
    const existing = byCanonical.get(key);
    if (!existing) {
      byCanonical.set(key, { jid: key, name: r.name, last_message_time: r.last_message_time, message_count: r.message_count });
    } else {
      existing.message_count += r.message_count;
      if (
        r.last_message_time &&
        (!existing.last_message_time || r.last_message_time > existing.last_message_time)
      ) {
        existing.last_message_time = r.last_message_time;
      }
      // Prefer a name that's not just a raw numeric jid (a contact name over a bare phone/LID)
      const looksNumeric = (s: string | null) => !s || /^[0-9]+$/.test(s);
      if (looksNumeric(existing.name) && !looksNumeric(r.name)) existing.name = r.name;
    }
  }

  // Final enrichment: when chats.name is null/numeric (no saved contact),
  // fall back to resolveName() which checks whatsmeow_lid_map → contacts for
  // push_name / full_name / first_name. Unresolvable phones come back as
  // "+<phone>"; truly opaque LIDs stay numeric.
  const looksNumeric = (s: string | null) => !s || /^[0-9]+$/.test(s);
  return Array.from(byCanonical.values())
    .filter((r) => r.last_message_time !== null)
    // Filter junk jids that have no useful content (the literal "0" entry,
    // and the rare bare-number chat rows that are neither DMs nor groups)
    .filter((r) => r.jid !== "0")
    .sort((a, b) => (a.last_message_time! < b.last_message_time! ? 1 : -1))
    .slice(0, limit)
    .map((r) => {
      let displayName = r.name;
      if (looksNumeric(displayName)) {
        const resolved = resolveName(r.jid.split("@")[0]);
        if (resolved && resolved !== "(unknown)") displayName = resolved;
      }
      return { ...r, name: displayName, is_group: r.jid.endsWith("@g.us") };
    });
}

export type Reaction = { reactor: string; reactor_name: string; emoji: string; timestamp: string };

export type MessageRow = {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string | null;
  timestamp: string;
  is_from_me: number;
  media_type: string | null;
  filename: string | null;
  quoted_message_id: string | null;
  quoted_preview: string | null;
  quoted_sender_name: string | null;
  reactions: Reaction[];
};

export function listMessages(chatJid: string, limit = 200): MessageRow[] {
  // Pull from every alias (LID + PN) of this DM so the conversation reads as one.
  const aliases = aliasesForChatJid(chatJid);
  const placeholders = aliases.map(() => "?").join(",");
  const raw = messagesDb()
    .prepare(
      `SELECT id, chat_jid, sender, content, timestamp, is_from_me, media_type, filename, quoted_message_id
       FROM messages WHERE chat_jid IN (${placeholders}) ORDER BY timestamp DESC LIMIT ?`
    )
    .all(...aliases, limit) as Array<Omit<MessageRow, "sender_name" | "quoted_preview" | "quoted_sender_name" | "reactions">>;

  // Bulk-fetch reactions (match by target_id only; chat_jid can diverge across LID/PN rollout)
  const ids = raw.map((r) => r.id);
  const reactionsById = new Map<string, Reaction[]>();
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    const rRows = messagesDb()
      .prepare(
        `SELECT target_id, reactor, emoji, timestamp FROM reactions WHERE target_id IN (${placeholders})`
      )
      .all(...ids) as Array<{ target_id: string; reactor: string; emoji: string; timestamp: string }>;
    for (const r of rRows) {
      const list = reactionsById.get(r.target_id) ?? [];
      list.push({ reactor: r.reactor, reactor_name: resolveName(r.reactor), emoji: r.emoji, timestamp: r.timestamp });
      reactionsById.set(r.target_id, list);
    }
  }

  // Bulk-fetch quoted-message previews
  const quotedIds = raw.map((r) => r.quoted_message_id).filter((x): x is string => !!x);
  const quotedByTarget = new Map<string, { sender: string; content: string | null; media_type: string | null }>();
  if (quotedIds.length > 0) {
    const placeholders = quotedIds.map(() => "?").join(",");
    const qRows = messagesDb()
      .prepare(`SELECT id, sender, content, media_type FROM messages WHERE id IN (${placeholders})`)
      .all(...quotedIds) as Array<{ id: string; sender: string; content: string | null; media_type: string | null }>;
    for (const q of qRows) quotedByTarget.set(q.id, q);
  }

  return raw
    .map<MessageRow>((r) => {
      const q = r.quoted_message_id ? quotedByTarget.get(r.quoted_message_id) : undefined;
      return {
        ...r,
        sender_name: r.is_from_me ? "Me" : resolveName(r.sender),
        quoted_preview: q ? (q.media_type ? `[${q.media_type}]` : (q.content ?? "").slice(0, 80)) : null,
        quoted_sender_name: q ? resolveName(q.sender) : null,
        reactions: reactionsById.get(r.id) ?? [],
      };
    })
    .reverse(); // chronological for display
}

/**
 * Group a chronological message list into image-drop bursts.
 * A burst = run of ≥5 image messages from the same sender within `windowMs`.
 */
export type Drop = {
  sender: string;
  sender_name: string;
  start: string;
  end: string;
  message_ids: string[];
};

export function detectDrops(messages: MessageRow[], minSize = 5, windowMs = 5 * 60_000): Drop[] {
  return detectDropsLite(
    messages.map((m) => ({ id: m.id, sender: m.sender, timestamp: m.timestamp, media_type: m.media_type })),
    minSize,
    windowMs
  );
}

type DropSeed = { id: string; sender: string; timestamp: string; media_type: string | null };

function detectDropsLite(items: DropSeed[], minSize: number, windowMs: number): Drop[] {
  const drops: Drop[] = [];
  let current: { sender: string; ids: string[]; firstTs: number; lastTs: number } | null = null;

  const flush = () => {
    if (current && current.ids.length >= minSize) {
      drops.push({
        sender: current.sender,
        sender_name: resolveName(current.sender),
        start: new Date(current.firstTs).toISOString(),
        end: new Date(current.lastTs).toISOString(),
        message_ids: [...current.ids],
      });
    }
    current = null;
  };

  for (const m of items) {
    const ts = new Date(m.timestamp).getTime();
    if (m.media_type !== "image") {
      flush();
      continue;
    }
    if (current && current.sender === m.sender && ts - current.lastTs <= windowMs) {
      current.ids.push(m.id);
      current.lastTs = ts;
    } else {
      flush();
      current = { sender: m.sender, ids: [m.id], firstTs: ts, lastTs: ts };
    }
  }
  flush();
  return drops;
}

// --- /needs-reply ---

export type NeedsReplyRow = {
  chat_jid: string;
  chat_name: string | null;
  sender: string;
  sender_name: string;
  content: string | null;
  media_type: string | null;
  timestamp: string;
  hours_ago: number;
};

/**
 * DMs where the latest message is not from me AND is older than `hoursMin` (so
 * I've had at least that much time to reply and haven't). Group chats are
 * excluded for now — group @-mention detection is a future enhancement.
 */
export function listNeedsReply(hoursMin = 2, limit = 100): NeedsReplyRow[] {
  // For each chat (canonical), find the latest message across all alias jids.
  const chats = listChats(500);
  const rows: NeedsReplyRow[] = [];
  for (const c of chats) {
    if (c.is_group) continue;
    const aliases = aliasesForChatJid(c.jid);
    const placeholders = aliases.map(() => "?").join(",");
    const last = messagesDb()
      .prepare(
        `SELECT id, chat_jid, sender, content, media_type, timestamp, is_from_me
         FROM messages WHERE chat_jid IN (${placeholders})
         ORDER BY timestamp DESC LIMIT 1`
      )
      .get(...aliases) as
      | {
          id: string;
          chat_jid: string;
          sender: string;
          content: string | null;
          media_type: string | null;
          timestamp: string;
          is_from_me: number;
        }
      | undefined;
    if (!last || last.is_from_me) continue;
    const hours = (Date.now() - new Date(last.timestamp).getTime()) / 3_600_000;
    if (hours < hoursMin) continue;
    rows.push({
      chat_jid: c.jid,
      chat_name: c.name,
      sender: last.sender,
      sender_name: resolveName(last.sender),
      content: last.content,
      media_type: last.media_type,
      timestamp: last.timestamp,
      hours_ago: hours,
    });
  }
  rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return rows.slice(0, limit);
}

// --- /contacts + /contact/[key] ---

export type ContactRow = {
  key: string;             // canonical phone identifier (the `pn` from lid_map, or LID if no pn)
  name: string;
  phone: string | null;
  last_active: string | null;
  message_count: number;
};

/**
 * Aggregated contacts list across the union of whatsmeow_contacts + every sender
 * we've ever observed. Each contact gets a canonical key (phone preferred, LID
 * as fallback) and a count of messages they sent in any chat.
 */
export function listContactsWithActivity(limit = 200): ContactRow[] {
  // Walk every distinct sender we've stored
  const senders = messagesDb()
    .prepare("SELECT sender, COUNT(*) AS n, MAX(timestamp) AS last_ts FROM messages WHERE is_from_me = 0 GROUP BY sender")
    .all() as Array<{ sender: string; n: number; last_ts: string }>;

  const byKey = new Map<string, { name: string; phone: string | null; last_active: string | null; message_count: number }>();
  for (const s of senders) {
    if (!s.sender) continue;
    // Determine canonical key: prefer phone form. If sender is bare LID, look up pn.
    let key = s.sender;
    let phone: string | null = null;
    try {
      const lidRow = whatsappDb()
        .prepare("SELECT pn FROM whatsmeow_lid_map WHERE lid = ?")
        .get(s.sender) as { pn?: string } | undefined;
      if (lidRow?.pn) {
        key = lidRow.pn;
        phone = lidRow.pn;
      } else if (/^\d+$/.test(s.sender)) {
        phone = s.sender;
      }
    } catch {
      /* ignore */
    }
    const name = resolveName(s.sender);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { name, phone, last_active: s.last_ts, message_count: s.n });
    } else {
      existing.message_count += s.n;
      if (s.last_ts && (!existing.last_active || s.last_ts > existing.last_active)) {
        existing.last_active = s.last_ts;
      }
      // Prefer a real name over a numeric fallback
      if (/^\+?\d+$/.test(existing.name) && !/^\+?\d+$/.test(name)) existing.name = name;
    }
  }

  return Array.from(byKey.entries())
    .map(([key, v]) => ({ key, name: v.name, phone: v.phone, last_active: v.last_active, message_count: v.message_count }))
    .sort((a, b) => (a.last_active && b.last_active ? (a.last_active < b.last_active ? 1 : -1) : 0))
    .slice(0, limit);
}

export type ContactMessageRow = MessageRow & {
  chat_name: string | null;
  is_group: boolean;
};

/**
 * Every message sent by a contact, across all chats they appear in. Handles
 * LID/PN aliasing: a contact "key" of either phone or LID resolves to all
 * sender variants we've ever stored for them.
 */
export function listContactMessagesAcrossChats(contactKey: string, limit = 300): ContactMessageRow[] {
  // Resolve aliases — a contact's sender field could be the phone OR the LID
  const aliases = new Set<string>([contactKey]);
  try {
    if (/^\d+$/.test(contactKey)) {
      // It's a phone — look up matching LID
      const r = whatsappDb()
        .prepare("SELECT lid FROM whatsmeow_lid_map WHERE pn = ?")
        .get(contactKey) as { lid?: string } | undefined;
      if (r?.lid) aliases.add(r.lid);
    } else {
      // It's a LID — look up matching phone
      const r = whatsappDb()
        .prepare("SELECT pn FROM whatsmeow_lid_map WHERE lid = ?")
        .get(contactKey) as { pn?: string } | undefined;
      if (r?.pn) aliases.add(r.pn);
    }
  } catch {
    /* ignore */
  }

  const placeholders = Array.from(aliases).map(() => "?").join(",");
  const raw = messagesDb()
    .prepare(
      `SELECT m.id, m.chat_jid, m.sender, m.content, m.timestamp, m.is_from_me,
              m.media_type, m.filename, m.quoted_message_id, c.name AS chat_name
       FROM messages m LEFT JOIN chats c ON c.jid = m.chat_jid
       WHERE m.sender IN (${placeholders}) AND m.is_from_me = 0
       ORDER BY m.timestamp DESC LIMIT ?`
    )
    .all(...aliases, limit) as Array<{
      id: string;
      chat_jid: string;
      sender: string;
      content: string | null;
      timestamp: string;
      is_from_me: number;
      media_type: string | null;
      filename: string | null;
      quoted_message_id: string | null;
      chat_name: string | null;
    }>;

  // Bulk reactions
  const reactionsById = new Map<string, Reaction[]>();
  if (raw.length > 0) {
    const ids = raw.map((r) => r.id);
    const ph = ids.map(() => "?").join(",");
    const rRows = messagesDb()
      .prepare(`SELECT target_id, reactor, emoji, timestamp FROM reactions WHERE target_id IN (${ph})`)
      .all(...ids) as Array<{ target_id: string; reactor: string; emoji: string; timestamp: string }>;
    for (const r of rRows) {
      const list = reactionsById.get(r.target_id) ?? [];
      list.push({ reactor: r.reactor, reactor_name: resolveName(r.reactor), emoji: r.emoji, timestamp: r.timestamp });
      reactionsById.set(r.target_id, list);
    }
  }

  return raw.map<ContactMessageRow>((r) => ({
    id: r.id,
    chat_jid: r.chat_jid,
    sender: r.sender,
    sender_name: resolveName(r.sender),
    content: r.content,
    timestamp: r.timestamp,
    is_from_me: r.is_from_me,
    media_type: r.media_type,
    filename: r.filename,
    quoted_message_id: r.quoted_message_id,
    quoted_preview: null,
    quoted_sender_name: null,
    reactions: reactionsById.get(r.id) ?? [],
    chat_name: r.chat_name,
    is_group: r.chat_jid.endsWith("@g.us"),
  }));
}

// --- Stats queries for /stats dashboard ---

// Stored timestamps look like '2026-05-22 17:06:00-07:00' (Go's RFC3339-with-space
// + TZ offset). A naive JS-produced ISO cutoff is 'T'-separated UTC, which makes
// SQLite's default text comparison wrong on same-day rows. We wrap both sides in
// SQLite's datetime() so the comparison happens on parsed datetimes (normalized
// to UTC), then bind the window as a '-N days' modifier so the database controls
// the format on both sides.
function sinceModifier(days: number): string {
  return `-${days} days`;
}

export type TopChat = { name: string; jid: string; msgs: number; is_group: boolean };

export function topChats(days = 30, limit = 10): TopChat[] {
  const rows = messagesDb()
    .prepare(
      `SELECT c.jid, c.name, COUNT(*) AS msgs
       FROM messages m JOIN chats c ON c.jid = m.chat_jid
       WHERE datetime(m.timestamp) > datetime('now', ?)
       GROUP BY c.jid ORDER BY msgs DESC LIMIT ?`
    )
    .all(sinceModifier(days), limit) as Array<{ jid: string; name: string | null; msgs: number }>;
  return rows.map((r) => ({
    name: r.name ?? r.jid,
    jid: r.jid,
    msgs: r.msgs,
    is_group: r.jid.endsWith("@g.us"),
  }));
}

export type MediaBreakdown = { type: string; count: number };

export function mediaBreakdown(days = 30): MediaBreakdown[] {
  const rows = messagesDb()
    .prepare(
      `SELECT COALESCE(media_type, 'text') AS type, COUNT(*) AS count
       FROM messages WHERE datetime(timestamp) > datetime('now', ?)
       GROUP BY type ORDER BY count DESC`
    )
    .all(sinceModifier(days)) as Array<{ type: string; count: number }>;
  return rows;
}

export type EmojiCount = { emoji: string; count: number };

export function topEmojis(days = 30, limit = 12): EmojiCount[] {
  const rows = messagesDb()
    .prepare(
      `SELECT emoji, COUNT(*) AS count
       FROM reactions WHERE datetime(timestamp) > datetime('now', ?)
       GROUP BY emoji ORDER BY count DESC LIMIT ?`
    )
    .all(sinceModifier(days), limit) as Array<{ emoji: string; count: number }>;
  return rows;
}

export type HeatmapCell = { dow: number; hour: number; count: number };

export function activityHeatmap(days = 30): HeatmapCell[] {
  const rows = messagesDb()
    .prepare(
      `SELECT CAST(strftime('%w', timestamp, 'localtime') AS INT) AS dow,
              CAST(strftime('%H', timestamp, 'localtime') AS INT) AS hour,
              COUNT(*) AS count
       FROM messages WHERE datetime(timestamp) > datetime('now', ?)
       GROUP BY dow, hour`
    )
    .all(sinceModifier(days)) as Array<{ dow: number; hour: number; count: number }>;
  return rows;
}

export type DailyCount = { date: string; count: number };

export function messagesPerDay(days = 30): DailyCount[] {
  const rows = messagesDb()
    .prepare(
      `SELECT date(timestamp, 'localtime') AS date, COUNT(*) AS count
       FROM messages WHERE datetime(timestamp) > datetime('now', ?)
       GROUP BY date ORDER BY date ASC`
    )
    .all(sinceModifier(days)) as DailyCount[];
  return rows;
}

export type OverviewTotals = {
  total_chats: number;
  total_messages: number;
  total_reactions: number;
  total_images: number;
  total_active_chats_7d: number;
};

export function overviewTotals(): OverviewTotals {
  const m = messagesDb();
  return {
    total_chats: (m.prepare("SELECT COUNT(*) AS n FROM chats").get() as { n: number }).n,
    total_messages: (m.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n,
    total_reactions: (m.prepare("SELECT COUNT(*) AS n FROM reactions").get() as { n: number }).n,
    total_images: (m.prepare("SELECT COUNT(*) AS n FROM messages WHERE media_type='image'").get() as { n: number }).n,
    total_active_chats_7d: (m
      .prepare(
        "SELECT COUNT(DISTINCT chat_jid) AS n FROM messages WHERE datetime(timestamp) > datetime('now', ?)"
      )
      .get(sinceModifier(7)) as { n: number }).n,
  };
}

export type CrossChatDrop = Drop & {
  chat_jid: string;
  chat_name: string | null;
  reaction_count: number;
  quoted_reply_count: number;
};

/**
 * Scan every chat for image-drop bursts within the last `days` and return them
 * sorted by start time DESC. Used by the cross-chat dashboard.
 */
export function listDropsAcrossChats(days = 7, minSize = 5, windowMs = 5 * 60_000): CrossChatDrop[] {
  // Pull image messages from the window, grouped by chat, ordered by timestamp ASC.
  // See sinceModifier() above for why this uses datetime() on both sides.
  const imgRows = messagesDb()
    .prepare(
      `SELECT id, chat_jid, sender, timestamp, media_type
       FROM messages
       WHERE media_type = 'image' AND datetime(timestamp) > datetime('now', ?)
       ORDER BY chat_jid, timestamp ASC`
    )
    .all(sinceModifier(days)) as Array<{ id: string; chat_jid: string; sender: string; timestamp: string; media_type: string }>;

  // Partition by chat_jid
  const byChat = new Map<string, DropSeed[]>();
  for (const r of imgRows) {
    const list = byChat.get(r.chat_jid) ?? [];
    list.push({ id: r.id, sender: r.sender, timestamp: r.timestamp, media_type: r.media_type });
    byChat.set(r.chat_jid, list);
  }

  // Chat names lookup
  const chatNameRows = messagesDb()
    .prepare("SELECT jid, name FROM chats")
    .all() as Array<{ jid: string; name: string | null }>;
  const chatNames = new Map(chatNameRows.map((r) => [r.jid, r.name] as const));

  // Detect drops per chat, then compute reaction + quoted-reply counts
  const drops: CrossChatDrop[] = [];
  for (const [chatJid, items] of byChat) {
    const chatDrops = detectDropsLite(items, minSize, windowMs);
    for (const d of chatDrops) {
      const ids = d.message_ids;
      const placeholders = ids.map(() => "?").join(",");
      const rcRow = messagesDb()
        .prepare(`SELECT COUNT(*) AS n FROM reactions WHERE target_id IN (${placeholders})`)
        .get(...ids) as { n: number };
      const qrRow = messagesDb()
        .prepare(
          `SELECT COUNT(*) AS n FROM messages WHERE chat_jid = ? AND quoted_message_id IN (${placeholders})`
        )
        .get(chatJid, ...ids) as { n: number };

      drops.push({
        ...d,
        chat_jid: chatJid,
        chat_name: chatNames.get(chatJid) ?? null,
        reaction_count: rcRow?.n ?? 0,
        quoted_reply_count: qrRow?.n ?? 0,
      });
    }
  }

  drops.sort((a, b) => (a.start < b.start ? 1 : -1));
  return drops;
}
