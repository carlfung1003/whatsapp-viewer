/**
 * Insight queries — read-only analytics over the bridge SQLite.
 * Imported from lib/db.ts which manages the read-only connections.
 */
import { messagesDb, whatsappDb, resolveName, aliasesForChatJid } from "./db";

// ──────────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────────

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtMinutes(min: number): string {
  if (min < 1) return "<1m";
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 60 * 24) return `${(min / 60).toFixed(1)}h`;
  return `${(min / 60 / 24).toFixed(1)}d`;
}
export { fmtMinutes };

// ──────────────────────────────────────────────────────────────────────────
// 1. Reply latency per contact (DM only)
// ──────────────────────────────────────────────────────────────────────────

export type ReplyLatencyRow = {
  chat_jid: string;
  name: string;
  median_min: number;
  p90_min: number;
  sample_count: number;
};

export function replyLatencyPerContact(minSamples = 5): ReplyLatencyRow[] {
  // Build per-DM message stream; for each "their message", find the time to my next reply
  const rows = messagesDb()
    .prepare(
      `WITH dm AS (
         SELECT chat_jid, is_from_me, timestamp,
           LEAD(is_from_me) OVER (PARTITION BY chat_jid ORDER BY timestamp) AS next_from_me,
           (julianday(LEAD(timestamp) OVER (PARTITION BY chat_jid ORDER BY timestamp))
            - julianday(timestamp)) * 1440 AS delay_min
         FROM messages WHERE chat_jid NOT LIKE '%@g.us'
       )
       SELECT chat_jid, delay_min FROM dm
       WHERE is_from_me = 0 AND next_from_me = 1 AND delay_min > 0 AND delay_min < 60 * 24 * 7`
    )
    .all() as Array<{ chat_jid: string; delay_min: number }>;

  // Group by canonical jid (merge LID + PN halves)
  const byCanon = new Map<string, number[]>();
  for (const r of rows) {
    const aliases = aliasesForChatJid(r.chat_jid);
    const canon = aliases.find((a) => a.endsWith("@s.whatsapp.net")) ?? aliases[0];
    if (!byCanon.has(canon)) byCanon.set(canon, []);
    byCanon.get(canon)!.push(r.delay_min);
  }

  const out: ReplyLatencyRow[] = [];
  for (const [canon, delays] of byCanon) {
    if (delays.length < minSamples) continue;
    const sorted = [...delays].sort((a, b) => a - b);
    const p90Idx = Math.floor(sorted.length * 0.9);
    out.push({
      chat_jid: canon,
      name: resolveName(canon.split("@")[0]),
      median_min: median(delays),
      p90_min: sorted[p90Idx],
      sample_count: delays.length,
    });
  }
  return out.sort((a, b) => a.median_min - b.median_min);
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Initiator vs responder ratio per DM
//    "Start" = message with no prior message in the chat for > GAP_HOURS
// ──────────────────────────────────────────────────────────────────────────

export type InitiatorRow = {
  chat_jid: string;
  name: string;
  my_starts: number;
  their_starts: number;
  my_pct: number;
  total_starts: number;
};

export function initiatorRatioPerChat(gapHours = 6, minSamples = 3): InitiatorRow[] {
  const rows = messagesDb()
    .prepare(
      `WITH gaps AS (
         SELECT chat_jid, is_from_me, timestamp,
           LAG(timestamp) OVER (PARTITION BY chat_jid ORDER BY timestamp) AS prev_ts
         FROM messages WHERE chat_jid NOT LIKE '%@g.us'
       )
       SELECT chat_jid, is_from_me, COUNT(*) AS starts FROM gaps
       WHERE prev_ts IS NULL OR (julianday(timestamp) - julianday(prev_ts)) * 24 > ?
       GROUP BY chat_jid, is_from_me`
    )
    .all(gapHours) as Array<{ chat_jid: string; is_from_me: number; starts: number }>;

  type Agg = { mine: number; theirs: number };
  const byCanon = new Map<string, Agg>();
  for (const r of rows) {
    const aliases = aliasesForChatJid(r.chat_jid);
    const canon = aliases.find((a) => a.endsWith("@s.whatsapp.net")) ?? aliases[0];
    const a = byCanon.get(canon) ?? { mine: 0, theirs: 0 };
    if (r.is_from_me) a.mine += r.starts;
    else a.theirs += r.starts;
    byCanon.set(canon, a);
  }

  const out: InitiatorRow[] = [];
  for (const [canon, a] of byCanon) {
    const total = a.mine + a.theirs;
    if (total < minSamples) continue;
    out.push({
      chat_jid: canon,
      name: resolveName(canon.split("@")[0]),
      my_starts: a.mine,
      their_starts: a.theirs,
      total_starts: total,
      my_pct: a.mine / total,
    });
  }
  return out.sort((a, b) => b.total_starts - a.total_starts);
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Activity calendar — daily message counts for a year
// ──────────────────────────────────────────────────────────────────────────

export type DailyCount = { date: string; count: number };

export function dailyMessageCounts(yearStart: string, yearEnd: string): DailyCount[] {
  return messagesDb()
    .prepare(
      `SELECT date(timestamp, 'localtime') AS date, COUNT(*) AS count
       FROM messages
       WHERE datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
       GROUP BY date ORDER BY date ASC`
    )
    .all(yearStart, yearEnd) as DailyCount[];
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Drifting relationships — current 90d activity vs prior 90d
// ──────────────────────────────────────────────────────────────────────────

export type DriftingRow = {
  chat_jid: string;
  name: string;
  current_count: number;
  prior_count: number;
  drop_pct: number;          // 1.0 = 100% drop (gone)
  last_seen: string | null;
};

export function driftingContacts(windowDays = 90, minPrior = 20): DriftingRow[] {
  const since = `now`;
  // Current window: -90 days .. now. Prior window: -180 days .. -90 days.
  const curr = messagesDb()
    .prepare(
      `SELECT chat_jid, COUNT(*) AS n, MAX(timestamp) AS last_ts
       FROM messages
       WHERE chat_jid NOT LIKE '%@g.us'
         AND datetime(timestamp) > datetime('${since}', '-${windowDays} days')
       GROUP BY chat_jid`
    )
    .all() as Array<{ chat_jid: string; n: number; last_ts: string | null }>;
  const prior = messagesDb()
    .prepare(
      `SELECT chat_jid, COUNT(*) AS n
       FROM messages
       WHERE chat_jid NOT LIKE '%@g.us'
         AND datetime(timestamp) > datetime('${since}', '-${windowDays * 2} days')
         AND datetime(timestamp) <= datetime('${since}', '-${windowDays} days')
       GROUP BY chat_jid`
    )
    .all() as Array<{ chat_jid: string; n: number }>;

  type Agg = { current: number; prior: number; last_ts: string | null };
  const byCanon = new Map<string, Agg>();
  function bump(chat_jid: string, kind: "current" | "prior", n: number, last_ts: string | null = null) {
    const aliases = aliasesForChatJid(chat_jid);
    const canon = aliases.find((a) => a.endsWith("@s.whatsapp.net")) ?? aliases[0];
    const a = byCanon.get(canon) ?? { current: 0, prior: 0, last_ts: null };
    a[kind] += n;
    if (last_ts && (!a.last_ts || last_ts > a.last_ts)) a.last_ts = last_ts;
    byCanon.set(canon, a);
  }
  for (const r of curr) bump(r.chat_jid, "current", r.n, r.last_ts);
  for (const r of prior) bump(r.chat_jid, "prior", r.n);

  const out: DriftingRow[] = [];
  for (const [canon, a] of byCanon) {
    if (a.prior < minPrior) continue;
    const dropPct = 1 - a.current / a.prior;
    if (dropPct < 0.5) continue;
    out.push({
      chat_jid: canon,
      name: resolveName(canon.split("@")[0]),
      current_count: a.current,
      prior_count: a.prior,
      drop_pct: dropPct,
      last_seen: a.last_ts,
    });
  }
  return out.sort((a, b) => b.drop_pct - a.drop_pct);
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Word + emoji frequency per chat
// ──────────────────────────────────────────────────────────────────────────

// Stopwords list — keep small, multilingual-ish. Adds the most common English chat fillers.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "for", "with", "is", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "this", "that", "it", "its",
  "i", "you", "he", "she", "we", "they", "them", "us", "him", "her", "my", "your", "our", "their",
  "me", "im", "ive", "id", "ill", "youre", "youve", "youll", "thats", "its", "dont", "doesnt", "didnt",
  "cant", "couldnt", "wouldnt", "shouldnt", "wont", "isnt", "arent", "wasnt", "werent", "hasnt", "hadnt",
  "havent", "ok", "okay", "yes", "no", "yeah", "yep", "nope", "lol", "haha", "hahaha", "hmm", "oh", "ah",
  "well", "just", "so", "now", "then", "as", "at", "by", "from", "about", "up", "out", "down",
  "what", "when", "where", "who", "why", "how", "which", "u", "ur", "r", "n", "k", "thx", "thanks",
  "got", "get", "go", "going", "went", "come", "coming", "came", "see", "look", "know", "think",
  "good", "great", "nice", "cool", "fine", "bad", "love", "like", "want", "need", "really", "very",
  "too", "also", "still", "even", "only", "much", "more", "most", "less", "least", "all", "some", "any",
  "would", "could", "should", "will", "shall", "may", "might", "must", "can",
  "today", "tomorrow", "yesterday", "tonight", "morning", "afternoon", "evening", "night", "day", "week",
  "month", "year", "time", "thing", "way", "people", "person", "one", "two", "three", "first", "next",
]);

const URL_RE = /https?:\/\/\S+/gi;
const MENTION_RE = /@\d+/g;
const NON_WORD_RE = /[^\p{L}\p{N}']+/u; // splits on anything that isn't a letter/digit/apostrophe
// Emoji extraction — covers most BMP + SMP emoji ranges and ZWJ sequences
const EMOJI_RE = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*/gu;

export type WordCount = { word: string; count: number };
export type EmojiBySource = { emoji: string; by_me: number; by_them: number; total: number };

export function wordFrequencyForChat(chatJid: string, limit = 30): WordCount[] {
  const aliases = aliasesForChatJid(chatJid);
  const placeholders = aliases.map(() => "?").join(",");
  const rows = messagesDb()
    .prepare(
      `SELECT content FROM messages WHERE chat_jid IN (${placeholders}) AND content IS NOT NULL AND content != ''`
    )
    .all(...aliases) as Array<{ content: string }>;

  const counts = new Map<string, number>();
  for (const r of rows) {
    const cleaned = r.content.replace(URL_RE, " ").replace(MENTION_RE, " ").toLowerCase();
    for (const token of cleaned.split(NON_WORD_RE)) {
      const t = token.trim();
      if (!t || t.length < 2) continue;
      if (STOPWORDS.has(t)) continue;
      if (/^\d+$/.test(t)) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function emojiFrequencyForChat(chatJid: string, limit = 30): EmojiBySource[] {
  const aliases = aliasesForChatJid(chatJid);
  const placeholders = aliases.map(() => "?").join(",");
  const rows = messagesDb()
    .prepare(
      `SELECT content, is_from_me FROM messages WHERE chat_jid IN (${placeholders}) AND content IS NOT NULL AND content != ''`
    )
    .all(...aliases) as Array<{ content: string; is_from_me: number }>;

  const counts = new Map<string, { by_me: number; by_them: number }>();
  for (const r of rows) {
    const matches = r.content.match(EMOJI_RE) ?? [];
    for (const e of matches) {
      const c = counts.get(e) ?? { by_me: 0, by_them: 0 };
      if (r.is_from_me) c.by_me++;
      else c.by_them++;
      counts.set(e, c);
    }
  }
  return Array.from(counts.entries())
    .map(([emoji, c]) => ({ emoji, by_me: c.by_me, by_them: c.by_them, total: c.by_me + c.by_them }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Reaction analytics
// ──────────────────────────────────────────────────────────────────────────

export type TopReactedMessage = {
  message_id: string;
  chat_jid: string;
  chat_name: string | null;
  content: string | null;
  timestamp: string;
  reaction_count: number;
};

export function topReactedMessages(limit = 25, mineOnly = true): TopReactedMessage[] {
  const filter = mineOnly ? "AND m.is_from_me = 1" : "";
  return messagesDb()
    .prepare(
      `SELECT m.id AS message_id, m.chat_jid, c.name AS chat_name,
              m.content, m.timestamp, COUNT(r.target_id) AS reaction_count
       FROM messages m
       JOIN reactions r ON r.target_id = m.id
       LEFT JOIN chats c ON c.jid = m.chat_jid
       WHERE 1=1 ${filter}
       GROUP BY m.id, m.chat_jid
       ORDER BY reaction_count DESC, m.timestamp DESC
       LIMIT ?`
    )
    .all(limit) as TopReactedMessage[];
}

export type EmojiTraffic = { emoji: string; given: number; received: number };

export function reactionsGivenVsReceived(): EmojiTraffic[] {
  // Need to know our own reactor ids — pull from whatsmeow_device
  const ownReactorIds = new Set<string>();
  try {
    const device = whatsappDb().prepare("SELECT jid FROM whatsmeow_device LIMIT 1").get() as
      | { jid?: string }
      | undefined;
    if (device?.jid) {
      const userPart = device.jid.split("@")[0].split(":")[0];
      ownReactorIds.add(userPart);
      const r = whatsappDb()
        .prepare("SELECT lid FROM whatsmeow_lid_map WHERE pn = ?")
        .get(userPart) as { lid?: string } | undefined;
      if (r?.lid) ownReactorIds.add(r.lid);
    }
  } catch {
    /* ignore */
  }

  // Given by me: reactions where reactor matches our IDs
  const ownArr = Array.from(ownReactorIds);
  const ownPh = ownArr.length > 0 ? ownArr.map(() => "?").join(",") : "''";
  const given = messagesDb()
    .prepare(
      `SELECT emoji, COUNT(*) AS n FROM reactions WHERE reactor IN (${ownPh}) GROUP BY emoji`
    )
    .all(...ownArr) as Array<{ emoji: string; n: number }>;

  // Received: reactions on messages where is_from_me = 1
  const received = messagesDb()
    .prepare(
      `SELECT r.emoji, COUNT(*) AS n
       FROM reactions r JOIN messages m ON m.id = r.target_id
       WHERE m.is_from_me = 1 GROUP BY r.emoji`
    )
    .all() as Array<{ emoji: string; n: number }>;

  const map = new Map<string, EmojiTraffic>();
  for (const g of given) map.set(g.emoji, { emoji: g.emoji, given: g.n, received: 0 });
  for (const r of received) {
    const e = map.get(r.emoji) ?? { emoji: r.emoji, given: 0, received: 0 };
    e.received = r.n;
    map.set(r.emoji, e);
  }
  return Array.from(map.values()).sort((a, b) => b.given + b.received - (a.given + a.received));
}
