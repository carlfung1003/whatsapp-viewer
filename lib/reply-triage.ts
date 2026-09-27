import { createHash } from "node:crypto";
import { aliasesForChatJid, listChats, messagesDb, ownIdentity, resolveName } from "@/lib/db";
import { ILUXURY_DEFAULT_JID } from "@/lib/iluxury";

// Business/community groups that are never "about me" (claims, drops, chatter).
const EXCLUDED_JIDS = new Set([ILUXURY_DEFAULT_JID]);
const EXCLUDED_NAME = /iluxury/i;

const LOOKBACK_DAYS = 30;
const CONTEXT_MSGS = 12;
const MAX_CANDIDATES = 40;

export type TriageCandidate = {
  id: number;
  chat_jid: string;
  name: string;
  is_group: boolean;
  last_ts: string;
  hours_waiting: number;
  last_preview: string;
  why_candidate: "dm" | "reply-to-me" | "mentioned";
  transcript: string;
  last_msg_id: string;
  context: Array<{ who: string; mine: boolean; text: string; ts: string }>;
};

type Row = {
  id: string;
  sender: string;
  content: string | null;
  media_type: string | null;
  timestamp: string;
  is_from_me: number;
  quoted_message_id: string | null;
};

const MEDIA_WORD: Record<string, string> = {
  image: "[photo]",
  video: "[video]",
  audio: "[voice message]",
  document: "[document]",
  sticker: "[sticker]",
};

function line(r: Row, isGroup: boolean): string {
  const who = r.is_from_me ? "Me" : isGroup ? resolveName(r.sender) : "Them";
  const media = r.media_type ? MEDIA_WORD[r.media_type] ?? "[attachment]" : "";
  const text = (r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const t = new Date(r.timestamp).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
  return `[${t}] ${who}: ${[media, text].filter(Boolean).join(" ")}`;
}

/**
 * Chats that might be waiting on me:
 * - DMs where they sent the last message in the last LOOKBACK_DAYS (30)
 * - Groups where, since my last message, someone quoted me, @-mentioned me, or
 *   used my name. Everything else in groups is not "for me".
 * iLuxury groups are excluded outright.
 */
export function gatherCandidates(): TriageCandidate[] {
  const me = ownIdentity();
  const myName = me.name?.split(/\s+/)[0];
  const nameRe = myName ? new RegExp(`\\b${myName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : null;
  const mentionRe = new RegExp(`@(${[...me.ids].join("|") || "__none__"})\\b`);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const out: TriageCandidate[] = [];
  for (const c of listChats(300, false)) {
    if (EXCLUDED_JIDS.has(c.jid) || EXCLUDED_NAME.test(c.name ?? "")) continue;
    const aliases = aliasesForChatJid(c.jid);
    const ph = aliases.map(() => "?").join(",");
    const recent = messagesDb()
      .prepare(
        `SELECT id, sender, content, media_type, timestamp, is_from_me, quoted_message_id
         FROM messages WHERE chat_jid IN (${ph})
         ORDER BY timestamp DESC LIMIT 40`
      )
      .all(...aliases) as Row[];
    const last = recent[0];
    if (!last || last.is_from_me) continue;
    if (new Date(last.timestamp).toISOString() < since) continue;

    let why: TriageCandidate["why_candidate"] = "dm";
    if (c.is_group) {
      const myIdx = recent.findIndex((r) => r.is_from_me);
      const unseen = myIdx === -1 ? recent.slice(0, 15) : recent.slice(0, myIdx);
      const myMsgIds = new Set(recent.filter((r) => r.is_from_me).map((r) => r.id));
      const quotedMe = unseen.some((r) => r.quoted_message_id && myMsgIds.has(r.quoted_message_id));
      const mentioned = unseen.some((r) => {
        const t = r.content ?? "";
        return mentionRe.test(t) || (nameRe?.test(t) ?? false);
      });
      if (!quotedMe && !mentioned) continue;
      why = quotedMe ? "reply-to-me" : "mentioned";
    }

    const ctx = recent.slice(0, CONTEXT_MSGS).reverse();
    out.push({
      id: out.length,
      chat_jid: c.jid,
      name: c.name ?? c.jid,
      is_group: c.is_group,
      last_ts: last.timestamp,
      hours_waiting: (Date.now() - new Date(last.timestamp).getTime()) / 3_600_000,
      last_preview: (last.content ?? "").trim() || MEDIA_WORD[last.media_type ?? ""] || "",
      why_candidate: why,
      transcript: ctx.map((r) => line(r, c.is_group)).join("\n"),
      last_msg_id: last.id,
      context: ctx.slice(-4).map((r) => ({
        who: r.is_from_me ? "You" : resolveName(r.sender),
        mine: !!r.is_from_me,
        text: [r.media_type ? MEDIA_WORD[r.media_type] ?? "[attachment]" : "", (r.content ?? "").trim()].filter(Boolean).join(" ").slice(0, 280),
        ts: r.timestamp,
      })),
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/** Stable key: changes only when a candidate chat gets a new latest message. */
export function candidatesKey(cands: TriageCandidate[]): string {
  const h = createHash("sha256");
  for (const c of cands) h.update(`${c.chat_jid}:${c.last_msg_id}\n`);
  return "triage-" + h.digest("hex").slice(0, 24);
}
