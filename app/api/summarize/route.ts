import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { listMessages } from "@/lib/db";

const MODEL = "claude-sonnet-4-6";
const DEFAULT_LIMIT = 200;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY not set. Add it to ~/whatsapp-viewer/.env.local and restart the viewer.",
      },
      { status: 500 }
    );
  }

  let body: { chat_jid?: string; question?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const chatJid = body.chat_jid?.trim();
  if (!chatJid) return NextResponse.json({ error: "chat_jid required" }, { status: 400 });

  const limit = Math.min(500, Math.max(20, body.limit ?? DEFAULT_LIMIT));
  const question =
    body.question?.trim() ||
    "Summarize this conversation in 5–8 bullet points. Surface action items, decisions, and anything urgent that needs a reply. If it's a business/auction group, organize by drop/item.";

  // Pull messages with LID resolution + reactions/quotes already attached
  const messages = listMessages(chatJid, limit);
  if (messages.length === 0) {
    return NextResponse.json({ error: "no messages found for this chat" }, { status: 404 });
  }

  // Render to a plain-text transcript the model can read
  const transcript = messages
    .map((m) => {
      const ts = new Date(m.timestamp).toLocaleString();
      const prefix = `[${ts}] ${m.is_from_me ? "Me" : m.sender_name}`;
      const body = m.content
        ? m.content
        : m.media_type
          ? `<${m.media_type}>`
          : "";
      const quoted = m.quoted_message_id
        ? ` ↪ replying to ${m.quoted_sender_name ?? "?"}: "${(m.quoted_preview ?? "").slice(0, 80)}"`
        : "";
      const reactions = m.reactions.length
        ? ` [reactions: ${m.reactions.map((r) => `${r.emoji}(${r.reactor_name})`).join(", ")}]`
        : "";
      return `${prefix}: ${body}${quoted}${reactions}`;
    })
    .join("\n");

  const client = new Anthropic({ apiKey });

  try {
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text:
            "You analyze WhatsApp chat transcripts. The user is the chat owner; they appear as 'Me'. Other participants are named. Be specific and concrete — quote message snippets when helpful. Use plain Markdown with bullet points. Keep it tight; don't pad.",
          // Cache the system prompt so follow-up summaries (different chats) reuse it
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Chat transcript (most recent ${messages.length} messages, oldest first):\n\n${transcript}`,
              // Cache the transcript so a follow-up Q on the same chat is cheap
              cache_control: { type: "ephemeral" },
            },
            { type: "text", text: question },
          ],
        },
      ],
    });

    const text = completion.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");

    return NextResponse.json({
      summary: text,
      model: MODEL,
      message_count: messages.length,
      usage: completion.usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
