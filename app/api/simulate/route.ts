import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { recentDmMessages } from "@/lib/insights";

const MODEL = "claude-sonnet-4-6";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let body: { chat_jid?: string; draft?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const chatJid = body.chat_jid?.trim();
  const draft = body.draft?.trim();
  if (!chatJid || !draft) {
    return NextResponse.json({ error: "chat_jid and draft required" }, { status: 400 });
  }

  const recent = recentDmMessages(chatJid, 40);
  if (recent.length === 0) {
    return NextResponse.json({ error: "no messages found for this chat" }, { status: 404 });
  }

  const partnerName = recent.find((m) => !m.is_from_me)?.sender_name ?? "Them";

  const transcript = recent
    .map((m) => {
      const ts = new Date(m.timestamp).toLocaleString();
      const body = m.content ?? (m.media_type ? `<${m.media_type}>` : "");
      return `[${ts}] ${m.is_from_me ? "Me" : partnerName}: ${body}`;
    })
    .join("\n");

  const client = new Anthropic({ apiKey });
  try {
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [
        {
          type: "text",
          text:
            `You simulate how a specific person ("${partnerName}") would respond in WhatsApp based on their past message patterns: tone, length, emoji usage, language mix, formality. Match their average response length — short people send short replies. If they typically respond in a non-English language with this user, mirror that. Output ONLY the predicted reply, no commentary, no quotation marks. If the draft would land poorly given their personality, predict the actual reaction (silence, terse reply, redirect), don't predict an ideal response.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Recent conversation with ${partnerName} (oldest first):\n\n${transcript}`,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: `If I now sent this message to ${partnerName}, predict their next reply:\n\nMe: ${draft}`,
            },
          ],
        },
      ],
    });
    const text = completion.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
    return NextResponse.json({
      prediction: text,
      partner_name: partnerName,
      model: MODEL,
      usage: completion.usage,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
