import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";

const BRIDGE_DIR = path.join(os.homedir(), "whatsapp-mcp", "whatsapp-bridge");
const STORE_DIR = path.join(BRIDGE_DIR, "store");
const MESSAGES_DB = path.join(STORE_DIR, "messages.db");

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

function mimeFor(filename: string | null, mediaType: string | null): string {
  if (filename) {
    const ext = path.extname(filename).toLowerCase();
    if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  }
  if (mediaType === "image") return "image/jpeg";
  if (mediaType === "video") return "video/mp4";
  if (mediaType === "audio") return "audio/ogg";
  return "application/octet-stream";
}

function sanitizedChatDir(chatJid: string): string {
  return path.join(STORE_DIR, chatJid.replaceAll(":", "_"));
}

async function existingPathOnDisk(chatJid: string, filename: string | null): Promise<string | null> {
  if (!filename) return null;
  const candidate = path.join(sanitizedChatDir(chatJid), filename);
  try {
    const s = await stat(candidate);
    if (s.isFile() && s.size > 0) return candidate;
  } catch {
    /* not found */
  }
  return null;
}

type BridgeResult =
  | { kind: "ok"; path: string }
  | { kind: "expired"; message: string }
  | { kind: "error"; message: string };

async function downloadViaBridge(chatJid: string, msgId: string): Promise<BridgeResult> {
  try {
    const res = await fetch("http://localhost:8080/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: msgId, chat_jid: chatJid }),
    });
    const json = (await res.json()) as { success: boolean; path?: string; message?: string };
    if (json.success && json.path) {
      const p = path.isAbsolute(json.path) ? json.path : path.join(BRIDGE_DIR, json.path);
      return { kind: "ok", path: p };
    }
    const message = json.message ?? `bridge HTTP ${res.status}`;
    // WhatsApp's CDN returns 403/404 when encrypted blobs have been purged after
    // their retention window. Distinguish this from transient errors so the UI
    // can show "expired" instead of a generic error.
    if (/status code 40[34]/i.test(message)) {
      return { kind: "expired", message };
    }
    return { kind: "error", message };
  } catch (e) {
    return { kind: "error", message: String(e) };
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ chat_jid: string; msg_id: string }> }
) {
  const { chat_jid: rawChat, msg_id: rawMsg } = await ctx.params;
  const chatJid = decodeURIComponent(rawChat);
  const msgId = decodeURIComponent(rawMsg);

  // Look up the message to get filename + media_type
  const db = new Database(MESSAGES_DB, { readonly: true, fileMustExist: true });
  let row: { filename: string | null; media_type: string | null } | undefined;
  try {
    row = db
      .prepare("SELECT filename, media_type FROM messages WHERE id = ? AND chat_jid = ? LIMIT 1")
      .get(msgId, chatJid) as { filename: string | null; media_type: string | null } | undefined;
  } finally {
    db.close();
  }

  if (!row) return NextResponse.json({ error: "message not found" }, { status: 404 });
  if (!row.media_type)
    return NextResponse.json({ error: "message has no media" }, { status: 400 });

  // Try cached file first
  let filePath = await existingPathOnDisk(chatJid, row.filename);

  // Fall back to triggering a download via the bridge
  if (!filePath) {
    const result = await downloadViaBridge(chatJid, msgId);
    if (result.kind === "expired") {
      return NextResponse.json(
        { error: "expired", message: "WhatsApp purged this media from their CDN. Older media (~30-45 days) is no longer recoverable." },
        { status: 410 } // Gone
      );
    }
    if (result.kind === "error") {
      return NextResponse.json({ error: "download failed", message: result.message }, { status: 502 });
    }
    filePath = result.path;
  }

  try {
    const bytes = await readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mimeFor(path.basename(filePath), row.media_type),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "read failed", detail: String(e) }, { status: 500 });
  }
}
