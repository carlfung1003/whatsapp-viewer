/**
 * iLuxury claim ledger helpers.
 *
 * Joins:
 *   - drops detected from messages (image bursts)
 *   - reactions on those messages (→ claimer)
 *   - manual paid/shipped state from viewer-state.db
 */
import { messagesDb, resolveName, detectDrops, type MessageRow } from "./db";
import { getClaimStates, type ClaimState } from "./state-db";

export type LedgerItem = {
  message_id: string;
  chat_jid: string;
  timestamp: string;
  claimer_name: string | null;
  claimer_reactor: string | null;
  claim_state: ClaimState | null;
};

export type LedgerDrop = {
  start: string;
  end: string;
  sender_name: string;
  item_count: number;
  claimed_count: number;
  paid_count: number;
  shipped_count: number;
  items: LedgerItem[];
};

/** Default iLuxury group jid — Carl can pass `chatJid` to override. */
export const ILUXURY_DEFAULT_JID = "120363072670308311@g.us";

export function listLedgerDrops(chatJid: string, days = 30): LedgerDrop[] {
  // Pull all messages for the chat (newest first)
  const raw = messagesDb()
    .prepare(
      `SELECT id, chat_jid, sender, content, timestamp, is_from_me, media_type, filename, quoted_message_id
       FROM messages WHERE chat_jid = ? AND datetime(timestamp) > datetime('now', ?)
       ORDER BY timestamp ASC`
    )
    .all(chatJid, `-${days} days`) as Array<{
      id: string;
      chat_jid: string;
      sender: string;
      content: string | null;
      timestamp: string;
      is_from_me: number;
      media_type: string | null;
      filename: string | null;
      quoted_message_id: string | null;
    }>;

  const msgRows: MessageRow[] = raw.map((r) => ({
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
    reactions: [],
  }));

  const drops = detectDrops(msgRows, 5, 5 * 60_000);

  // Bulk pull reactions for every item id
  const allIds = drops.flatMap((d) => d.message_ids);
  if (allIds.length === 0) return [];
  const ph = allIds.map(() => "?").join(",");
  const rxRows = messagesDb()
    .prepare(
      `SELECT target_id, reactor, emoji, MAX(timestamp) AS last_ts
       FROM reactions WHERE target_id IN (${ph})
       GROUP BY target_id`
    )
    .all(...allIds) as Array<{ target_id: string; reactor: string; emoji: string; last_ts: string }>;
  const rxByTarget = new Map(rxRows.map((r) => [r.target_id, r]));

  const claimStates = getClaimStates(allIds);

  return drops.map<LedgerDrop>((d) => {
    const items: LedgerItem[] = d.message_ids.map((id) => {
      const rx = rxByTarget.get(id);
      const cs = claimStates.get(id) ?? null;
      const claimerReactor = cs?.claimer_override ?? rx?.reactor ?? null;
      const claimerName = claimerReactor ? resolveName(claimerReactor) : null;
      return {
        message_id: id,
        chat_jid: chatJid,
        timestamp: d.start, // approximate; per-item ts requires another lookup
        claimer_name: claimerName,
        claimer_reactor: claimerReactor,
        claim_state: cs,
      };
    });
    return {
      start: d.start,
      end: d.end,
      sender_name: d.sender_name,
      item_count: items.length,
      claimed_count: items.filter((i) => i.claimer_reactor).length,
      paid_count: items.filter((i) => i.claim_state?.paid).length,
      shipped_count: items.filter((i) => i.claim_state?.shipped).length,
      items,
    };
  }).reverse(); // newest drops first
}
