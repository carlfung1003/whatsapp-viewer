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

// ──────────────────────────────────────────────────────────────────────────
// 8. Awkwardness detector — moments where a quick-reply rhythm went silent
// ──────────────────────────────────────────────────────────────────────────

export type AwkwardMoment = {
  chat_jid: string;
  name: string;
  message_id: string;
  preceding_sender: string;
  preceding_content: string | null;
  preceding_media: string | null;
  timestamp: string;
  silence_hours: number;
  median_min: number;
  ratio: number; // silence_min / median_min, how unusual it is
};

export function awkwardMoments(minMedianMin = 1, minSilenceHours = 24, limit = 30): AwkwardMoment[] {
  // Pull each DM message with the time to the NEXT message in the chat
  const rows = messagesDb()
    .prepare(
      `WITH dm AS (
         SELECT id, chat_jid, sender, is_from_me, content, media_type, timestamp,
           (julianday(LEAD(timestamp) OVER (PARTITION BY chat_jid ORDER BY timestamp))
            - julianday(timestamp)) * 1440 AS gap_min
         FROM messages WHERE chat_jid NOT LIKE '%@g.us'
       )
       SELECT id, chat_jid, sender, is_from_me, content, media_type, timestamp, gap_min
       FROM dm WHERE gap_min IS NOT NULL`
    )
    .all() as Array<{
      id: string;
      chat_jid: string;
      sender: string;
      is_from_me: number;
      content: string | null;
      media_type: string | null;
      timestamp: string;
      gap_min: number;
    }>;

  // Group by canonical jid; compute median gap per chat from "normal" replies (<6h)
  const byCanon = new Map<string, typeof rows>();
  for (const r of rows) {
    const aliases = aliasesForChatJid(r.chat_jid);
    const canon = aliases.find((a) => a.endsWith("@s.whatsapp.net")) ?? aliases[0];
    const list = byCanon.get(canon) ?? [];
    list.push(r);
    byCanon.set(canon, list);
  }

  const out: AwkwardMoment[] = [];
  for (const [canon, list] of byCanon) {
    const normalGaps = list.filter((r) => r.gap_min > 0 && r.gap_min < 360).map((r) => r.gap_min);
    if (normalGaps.length < 10) continue;
    const med = median(normalGaps);
    if (med < minMedianMin) continue;

    // Look for big jumps after the rhythm
    for (const r of list) {
      const silenceHours = r.gap_min / 60;
      if (silenceHours < minSilenceHours) continue;
      const ratio = r.gap_min / med;
      if (ratio < 5) continue;
      out.push({
        chat_jid: canon,
        name: resolveName(canon.split("@")[0]),
        message_id: r.id,
        preceding_sender: r.is_from_me ? "Me" : resolveName(r.sender),
        preceding_content: r.content,
        preceding_media: r.media_type,
        timestamp: r.timestamp,
        silence_hours: silenceHours,
        median_min: med,
        ratio,
      });
    }
  }

  return out.sort((a, b) => b.ratio - a.ratio).slice(0, limit);
}

// ──────────────────────────────────────────────────────────────────────────
// 9. Snapshot stats — per-contact "wrapped" numbers
// ──────────────────────────────────────────────────────────────────────────

export type ContactSnapshot = {
  chat_jid: string;
  name: string;
  total_messages: number;
  by_me: number;
  by_them: number;
  first_message: string | null;
  last_message: string | null;
  longest_gap_days: number;
  longest_gap_start: string | null;
  peak_hour: number; // 0-23
  peak_dow: number;  // 0=Sun
  top_emoji: string | null;
  top_emoji_count: number;
  reactions_given: number;
  reactions_received: number;
  total_images: number;
};

export function contactSnapshot(chatJid: string): ContactSnapshot | null {
  const aliases = aliasesForChatJid(chatJid);
  const ph = aliases.map(() => "?").join(",");

  const totals = messagesDb()
    .prepare(
      `SELECT COUNT(*) AS n,
              SUM(CASE WHEN is_from_me=1 THEN 1 ELSE 0 END) AS me,
              SUM(CASE WHEN is_from_me=0 THEN 1 ELSE 0 END) AS them,
              MIN(timestamp) AS first_ts,
              MAX(timestamp) AS last_ts,
              SUM(CASE WHEN media_type='image' THEN 1 ELSE 0 END) AS images
       FROM messages WHERE chat_jid IN (${ph})`
    )
    .get(...aliases) as { n: number; me: number; them: number; first_ts: string | null; last_ts: string | null; images: number };

  if (!totals || totals.n === 0) return null;

  const hourRows = messagesDb()
    .prepare(
      `SELECT CAST(strftime('%H', timestamp, 'localtime') AS INT) AS h, COUNT(*) AS n
       FROM messages WHERE chat_jid IN (${ph}) GROUP BY h ORDER BY n DESC LIMIT 1`
    )
    .get(...aliases) as { h: number; n: number } | undefined;

  const dowRows = messagesDb()
    .prepare(
      `SELECT CAST(strftime('%w', timestamp, 'localtime') AS INT) AS d, COUNT(*) AS n
       FROM messages WHERE chat_jid IN (${ph}) GROUP BY d ORDER BY n DESC LIMIT 1`
    )
    .get(...aliases) as { d: number; n: number } | undefined;

  // Longest gap: scan all messages sorted by ts, find biggest consecutive diff
  const allTs = messagesDb()
    .prepare(`SELECT timestamp FROM messages WHERE chat_jid IN (${ph}) ORDER BY timestamp ASC`)
    .all(...aliases) as Array<{ timestamp: string }>;
  let longestGapDays = 0;
  let longestGapStart: string | null = null;
  for (let i = 1; i < allTs.length; i++) {
    const diff = (new Date(allTs[i].timestamp).getTime() - new Date(allTs[i - 1].timestamp).getTime()) / 86_400_000;
    if (diff > longestGapDays) {
      longestGapDays = diff;
      longestGapStart = allTs[i - 1].timestamp;
    }
  }

  // Top emoji used in content
  const emojiRows = messagesDb()
    .prepare(`SELECT content FROM messages WHERE chat_jid IN (${ph}) AND content IS NOT NULL`)
    .all(...aliases) as Array<{ content: string }>;
  const emojiCounts = new Map<string, number>();
  for (const r of emojiRows) {
    const matches = r.content.match(EMOJI_RE) ?? [];
    for (const e of matches) emojiCounts.set(e, (emojiCounts.get(e) ?? 0) + 1);
  }
  const sorted = Array.from(emojiCounts.entries()).sort((a, b) => b[1] - a[1]);
  const topEmoji = sorted[0]?.[0] ?? null;
  const topEmojiCount = sorted[0]?.[1] ?? 0;

  // Reactions traffic in this chat
  const ids = messagesDb()
    .prepare(`SELECT id, is_from_me FROM messages WHERE chat_jid IN (${ph})`)
    .all(...aliases) as Array<{ id: string; is_from_me: number }>;
  const mineIds = ids.filter((i) => i.is_from_me === 1).map((i) => i.id);
  const theirIds = ids.filter((i) => i.is_from_me === 0).map((i) => i.id);
  function countReactions(idList: string[]): number {
    if (idList.length === 0) return 0;
    const ph2 = idList.map(() => "?").join(",");
    const r = messagesDb()
      .prepare(`SELECT COUNT(*) AS n FROM reactions WHERE target_id IN (${ph2})`)
      .get(...idList) as { n: number };
    return r.n;
  }

  return {
    chat_jid: chatJid,
    name: resolveName(chatJid.split("@")[0]),
    total_messages: totals.n,
    by_me: totals.me,
    by_them: totals.them,
    first_message: totals.first_ts,
    last_message: totals.last_ts,
    longest_gap_days: longestGapDays,
    longest_gap_start: longestGapStart,
    peak_hour: hourRows?.h ?? 0,
    peak_dow: dowRows?.d ?? 0,
    top_emoji: topEmoji,
    top_emoji_count: topEmojiCount,
    reactions_received: countReactions(mineIds),
    reactions_given: countReactions(theirIds),
    total_images: totals.images,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 10. Recent messages for a DM — used by simulator + reopener prompt
// ──────────────────────────────────────────────────────────────────────────

export type SimpleMessage = { is_from_me: number; sender: string; sender_name: string; content: string | null; media_type: string | null; timestamp: string };

export function recentDmMessages(chatJid: string, limit = 40): SimpleMessage[] {
  const aliases = aliasesForChatJid(chatJid);
  const ph = aliases.map(() => "?").join(",");
  const rows = messagesDb()
    .prepare(
      `SELECT is_from_me, sender, content, media_type, timestamp
       FROM messages WHERE chat_jid IN (${ph}) AND (content IS NOT NULL OR media_type IS NOT NULL)
       ORDER BY timestamp DESC LIMIT ?`
    )
    .all(...aliases, limit) as Array<{ is_from_me: number; sender: string; content: string | null; media_type: string | null; timestamp: string }>;
  return rows
    .map((r) => ({
      ...r,
      sender_name: r.is_from_me ? "Me" : resolveName(r.sender),
    }))
    .reverse(); // chronological
}

// ──────────────────────────────────────────────────────────────────────────
// 11. Birthday detector — scan messages for "happy birthday" wishes
// ──────────────────────────────────────────────────────────────────────────

export type Birthday = {
  chat_jid: string;
  source: "dm" | "group";
  group_name: string | null;    // populated for group birthdays
  name: string;                  // birthday person's display name (or "(unknown)")
  recipient_jid: string | null;  // identified via @mention in group wishes; null if not identified
  month: number;                 // 1-12
  day: number;                   // 1-31
  evidence_count: number;        // total wishes on this MM-DD
  distinct_wishers: number;      // distinct senders who wished on this MM-DD
  last_wish_year: number;
};

const BIRTHDAY_RE = /\b(happy\s+(?:belated\s+)?(?:birthday|bday|bdy))\b|🎂|🎉.{0,20}🎂|生日快樂|生日快乐|生日|HBD/i;

export function detectBirthdays(): Birthday[] {
  // Pull every message that matches our birthday-wish regex. Include groups,
  // because Carl tends to send 🎂 stickers (no text) in DMs, but in groups
  // multiple OTHER people text "happy birthday" — much stronger signal.
  //
  // CRITICAL: dates come from SQLite's strftime with 'localtime' modifier, not
  // `new Date(r.timestamp).getDate()`. Some bridge rows lack a TZ offset in the
  // stored string; V8 then treats them as local PT instead of UTC, shifting
  // the date forward by 1. SQLite's 'localtime' modifier assumes UTC input
  // and converts to server-local correctly. Aligns with messagesPerDay /
  // dailyMessageCounts / activityHeatmap which already do this.
  const rows = messagesDb()
    .prepare(
      `SELECT chat_jid, sender, is_from_me, content,
              CAST(strftime('%m', timestamp, 'localtime') AS INT) AS month,
              CAST(strftime('%d', timestamp, 'localtime') AS INT) AS day,
              CAST(strftime('%Y', timestamp, 'localtime') AS INT) AS year
       FROM messages WHERE content IS NOT NULL AND content != ''`
    )
    .all() as Array<{ chat_jid: string; sender: string; is_from_me: number; content: string; month: number; day: number; year: number }>;

  // ── PASS 1: DM birthdays ──
  // For a DM, the partner is unambiguous. Carl wishing them = their birthday.
  // Skip wishes they sent to Carl (that's HIS birthday, he knows).
  type DmAgg = { chat_jid: string; month: number; day: number; year: number; count: number };
  const dmHits = new Map<string, DmAgg>();
  for (const r of rows) {
    if (r.chat_jid.endsWith("@g.us")) continue;
    if (!r.is_from_me) continue;
    if (!BIRTHDAY_RE.test(r.content)) continue;
    const aliases = aliasesForChatJid(r.chat_jid);
    const canon = aliases.find((a) => a.endsWith("@s.whatsapp.net")) ?? aliases[0];
    const k = `${canon}|${r.month}-${r.day}`;
    const existing = dmHits.get(k);
    if (!existing) {
      dmHits.set(k, { chat_jid: canon, month: r.month, day: r.day, year: r.year, count: 1 });
    } else {
      existing.count++;
      if (r.year > existing.year) existing.year = r.year;
    }
  }
  // Pick best (MM-DD) per DM (the most-evidenced date)
  const byDmChat = new Map<string, DmAgg[]>();
  for (const agg of dmHits.values()) {
    const list = byDmChat.get(agg.chat_jid) ?? [];
    list.push(agg);
    byDmChat.set(agg.chat_jid, list);
  }
  const out: Birthday[] = [];
  for (const [chat_jid, list] of byDmChat) {
    list.sort((a, b) => b.count - a.count || b.year - a.year);
    const best = list[0];
    out.push({
      chat_jid,
      source: "dm",
      group_name: null,
      name: resolveName(chat_jid.split("@")[0]),
      recipient_jid: chat_jid.split("@")[0],
      month: best.month,
      day: best.day,
      evidence_count: best.count,
      distinct_wishers: 1,
      last_wish_year: best.year,
    });
  }

  // ── PASS 2: Group birthdays ──
  // In a group, a date is a birthday if ≥2 distinct people wished or ≥3 wishes total.
  // Recipient: most-@mentioned phone across the day's wish messages.
  type GroupEvent = {
    chat_jid: string;
    month: number;
    day: number;
    years: Set<number>;
    wishers: Set<string>;
    wish_count: number;
    mentions: Map<string, number>;
  };
  const groupEvents = new Map<string, GroupEvent>();
  const MENTION_PHONE_RE = /@(\d{6,})/g;
  for (const r of rows) {
    if (!r.chat_jid.endsWith("@g.us")) continue;
    if (!BIRTHDAY_RE.test(r.content)) continue;
    const k = `${r.chat_jid}|${r.month}-${r.day}`;
    let evt = groupEvents.get(k);
    if (!evt) {
      evt = {
        chat_jid: r.chat_jid,
        month: r.month,
        day: r.day,
        years: new Set(),
        wishers: new Set(),
        wish_count: 0,
        mentions: new Map(),
      };
      groupEvents.set(k, evt);
    }
    evt.years.add(r.year);
    evt.wishers.add(r.sender);
    evt.wish_count++;
    const matches = r.content.matchAll(MENTION_PHONE_RE);
    for (const m of matches) {
      const phone = m[1];
      evt.mentions.set(phone, (evt.mentions.get(phone) ?? 0) + 1);
    }
  }
  // Group names lookup
  const groupNameRows = messagesDb()
    .prepare("SELECT jid, name FROM chats WHERE jid LIKE '%@g.us'")
    .all() as Array<{ jid: string; name: string | null }>;
  const groupNames = new Map(groupNameRows.map((r) => [r.jid, r.name] as const));

  // Aggregate group events per (group, recipient_or_date) so a recurring birthday
  // wished N years in a row counts as ONE entry, not N.
  type GroupAgg = {
    chat_jid: string;
    month: number;
    day: number;
    wish_count: number;
    wisher_set: Set<string>;
    years: Set<number>;
    mention_phone: string | null;
    mention_count: number;
  };
  const groupAggKey = (chat_jid: string, m: number, d: number, mentionPhone: string | null) =>
    `${chat_jid}|${m}-${d}|${mentionPhone ?? "?"}`;
  const groupAggs = new Map<string, GroupAgg>();
  for (const evt of groupEvents.values()) {
    if (evt.wishers.size < 2 && evt.wish_count < 3) continue; // too thin to be a birthday
    const topMention = Array.from(evt.mentions.entries()).sort((a, b) => b[1] - a[1])[0];
    const mentionPhone = topMention?.[0] ?? null;
    const k = groupAggKey(evt.chat_jid, evt.month, evt.day, mentionPhone);
    const existing = groupAggs.get(k);
    if (!existing) {
      groupAggs.set(k, {
        chat_jid: evt.chat_jid,
        month: evt.month,
        day: evt.day,
        wish_count: evt.wish_count,
        wisher_set: new Set(evt.wishers),
        years: new Set(evt.years),
        mention_phone: mentionPhone,
        mention_count: topMention?.[1] ?? 0,
      });
    } else {
      existing.wish_count += evt.wish_count;
      evt.wishers.forEach((s) => existing.wisher_set.add(s));
      evt.years.forEach((y) => existing.years.add(y));
      existing.mention_count += topMention?.[1] ?? 0;
    }
  }
  // ── Merge adjacent-day events for the same (chat, recipient) ──
  // After TZ normalization most birthdays land on one date, but late-night
  // wishes legitimately straddle midnight. Cluster ±1 day, sum the wishes,
  // and pick the day with the most votes (ties broken by earliest date).
  type Cluster = typeof groupAggs extends Map<string, infer V> ? V : never;
  const byRecipient = new Map<string, Cluster[]>();
  for (const a of groupAggs.values()) {
    const k = `${a.chat_jid}|${a.mention_phone ?? "?"}`;
    const list = byRecipient.get(k) ?? [];
    list.push(a);
    byRecipient.set(k, list);
  }
  const dateMs = (m: number, d: number) => new Date(2000, m - 1, d).getTime(); // 2000 is leap year
  const mergedAggs: Cluster[] = [];
  for (const list of byRecipient.values()) {
    list.sort((x, y) => dateMs(x.month, x.day) - dateMs(y.month, y.day));
    let cluster: Cluster[] = [];
    const flush = () => {
      if (cluster.length === 0) return;
      // Pick canonical date: max wishes, then earliest
      cluster.sort((x, y) => y.wish_count - x.wish_count || dateMs(x.month, x.day) - dateMs(y.month, y.day));
      const peak = cluster[0];
      const merged: Cluster = {
        chat_jid: peak.chat_jid,
        month: peak.month,
        day: peak.day,
        wish_count: cluster.reduce((s, c) => s + c.wish_count, 0),
        wisher_set: new Set<string>(),
        years: new Set<number>(),
        mention_phone: peak.mention_phone,
        mention_count: cluster.reduce((s, c) => s + c.mention_count, 0),
      };
      for (const c of cluster) {
        c.wisher_set.forEach((w) => merged.wisher_set.add(w));
        c.years.forEach((y) => merged.years.add(y));
      }
      mergedAggs.push(merged);
      cluster = [];
    };
    let prev: Cluster | null = null;
    for (const a of list) {
      if (prev && Math.abs(dateMs(a.month, a.day) - dateMs(prev.month, prev.day)) <= 86_400_000) {
        cluster.push(a);
      } else {
        flush();
        cluster.push(a);
      }
      prev = a;
    }
    flush();
  }

  for (const a of mergedAggs) {
    const groupName = groupNames.get(a.chat_jid) ?? a.chat_jid;
    let name = "(someone)";
    let recipient_jid: string | null = null;
    if (a.mention_phone) {
      name = resolveName(a.mention_phone);
      recipient_jid = a.mention_phone;
    }
    out.push({
      chat_jid: a.chat_jid,
      source: "group",
      group_name: groupName,
      name,
      recipient_jid,
      month: a.month,
      day: a.day,
      evidence_count: a.wish_count,
      distinct_wishers: a.wisher_set.size,
      last_wish_year: Math.max(...a.years),
    });
  }

  // ── Sort by upcoming ──
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  function daysUntil(b: Birthday): number {
    const target = new Date(today.getFullYear(), b.month - 1, b.day);
    if (target.getTime() < startOfToday) target.setFullYear(today.getFullYear() + 1);
    return Math.floor((target.getTime() - startOfToday) / 86_400_000);
  }
  return out.sort((a, b) => daysUntil(a) - daysUntil(b));
}

// ──────────────────────────────────────────────────────────────────────────
// 12. Topic graph — recent DM message bundles for AI clustering
// ──────────────────────────────────────────────────────────────────────────

export type ChatSample = {
  chat_jid: string;
  name: string;
  message_count: number;
  sample: string; // joined sample text
};

/**
 * For each top-active DM in the last `days`, build a short text sample (joined
 * recent messages, truncated) suitable for sending to an LLM for clustering.
 */
export function topChatSamples(days = 30, topN = 25, sampleChars = 1500): ChatSample[] {
  const top = messagesDb()
    .prepare(
      `SELECT chat_jid, COUNT(*) AS n FROM messages
       WHERE chat_jid NOT LIKE '%@g.us' AND datetime(timestamp) > datetime('now', ?)
         AND content IS NOT NULL AND content != ''
       GROUP BY chat_jid ORDER BY n DESC LIMIT ?`
    )
    .all(`-${days} days`, topN * 2) as Array<{ chat_jid: string; n: number }>;

  type Agg = { msg_count: number; texts: string[] };
  const byCanon = new Map<string, Agg>();
  for (const t of top) {
    const aliases = aliasesForChatJid(t.chat_jid);
    const canon = aliases.find((a) => a.endsWith("@s.whatsapp.net")) ?? aliases[0];
    const ph = aliases.map(() => "?").join(",");
    const txts = messagesDb()
      .prepare(
        `SELECT content FROM messages
         WHERE chat_jid IN (${ph}) AND content IS NOT NULL AND content != ''
           AND datetime(timestamp) > datetime('now', ?)
         ORDER BY timestamp DESC LIMIT 80`
      )
      .all(...aliases, `-${days} days`) as Array<{ content: string }>;
    const a = byCanon.get(canon) ?? { msg_count: 0, texts: [] };
    a.msg_count += t.n;
    a.texts.push(...txts.map((x) => x.content));
    byCanon.set(canon, a);
  }

  const out: ChatSample[] = [];
  for (const [canon, a] of byCanon) {
    const joined = a.texts.join(" • ").replace(/\s+/g, " ").slice(0, sampleChars);
    out.push({
      chat_jid: canon,
      name: resolveName(canon.split("@")[0]),
      message_count: a.msg_count,
      sample: joined,
    });
  }

  return out.sort((a, b) => b.message_count - a.message_count).slice(0, topN);
}

// ──────────────────────────────────────────────────────────────────────────
// 13. Replay — all messages for a chat in a time window (newest at end)
// ──────────────────────────────────────────────────────────────────────────

export type ReplayMessage = {
  id: string;
  sender_name: string;
  is_from_me: number;
  content: string | null;
  media_type: string | null;
  timestamp: string;
  reactions: Array<{ reactor_name: string; emoji: string; timestamp: string }>;
};

export function replayMessages(chatJid: string, limit = 500): ReplayMessage[] {
  const aliases = aliasesForChatJid(chatJid);
  const ph = aliases.map(() => "?").join(",");
  const rows = messagesDb()
    .prepare(
      `SELECT id, sender, is_from_me, content, media_type, timestamp
       FROM messages WHERE chat_jid IN (${ph})
       ORDER BY timestamp DESC LIMIT ?`
    )
    .all(...aliases, limit) as Array<{ id: string; sender: string; is_from_me: number; content: string | null; media_type: string | null; timestamp: string }>;

  // Bulk reactions
  const ids = rows.map((r) => r.id);
  const rxByTarget = new Map<string, Array<{ reactor_name: string; emoji: string; timestamp: string }>>();
  if (ids.length > 0) {
    const ph2 = ids.map(() => "?").join(",");
    const rxRows = messagesDb()
      .prepare(`SELECT target_id, reactor, emoji, timestamp FROM reactions WHERE target_id IN (${ph2})`)
      .all(...ids) as Array<{ target_id: string; reactor: string; emoji: string; timestamp: string }>;
    for (const rx of rxRows) {
      const list = rxByTarget.get(rx.target_id) ?? [];
      list.push({ reactor_name: resolveName(rx.reactor), emoji: rx.emoji, timestamp: rx.timestamp });
      rxByTarget.set(rx.target_id, list);
    }
  }

  return rows
    .map<ReplayMessage>((r) => ({
      id: r.id,
      sender_name: r.is_from_me ? "Me" : resolveName(r.sender),
      is_from_me: r.is_from_me,
      content: r.content,
      media_type: r.media_type,
      timestamp: r.timestamp,
      reactions: rxByTarget.get(r.id) ?? [],
    }))
    .reverse(); // chronological
}
