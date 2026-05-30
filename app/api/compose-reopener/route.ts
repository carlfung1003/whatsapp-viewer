import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { recentDmMessages } from "@/lib/insights";

const MODEL = "claude-sonnet-4-6";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let body: { chat_jid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const chatJid = body.chat_jid?.trim();
  if (!chatJid) return NextResponse.json({ error: "chat_jid required" }, { status: 400 });

  const recent = recentDmMessages(chatJid, 25);
  if (recent.length === 0) {
    return NextResponse.json({ error: "no messages for this chat" }, { status: 404 });
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
      max_tokens: 250,
      system: [
        {
          type: "text",
          text:
            `You write natural, low-pressure WhatsApp re-openers for relationships that have gone quiet. Reference something concrete from the past conversation (a trip, a topic, a question they left hanging, a milestone). Keep it 1-2 sentences. Match the language they speak with the user — if the prior chat mixes Cantonese/Mandarin/English, match. NO awkward "long time no chat" openers — show you remember something specific instead. Output ONLY the message, no quotation marks, no commentary.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Recent conversation with ${partnerName} (oldest first, then it went quiet):\n\n${transcript}`,
            },
            {
              type: "text",
              text: `Write a natural re-opener message for me to send to ${partnerName}.`,
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
      reopener: text,
      partner_name: partnerName,
      model: MODEL,
      usage: completion.usage,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
