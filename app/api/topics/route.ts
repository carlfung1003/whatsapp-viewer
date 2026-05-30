import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { topChatSamples } from "@/lib/insights";
import { getTopicCache, setTopicCache } from "@/lib/state-db";

const MODEL = "claude-sonnet-4-6";

type Topic = {
  topic: string;
  description: string;
  chats: Array<{ chat_jid: string; name: string }>;
};

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  let body: { days?: number; refresh?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const days = Math.max(7, Math.min(180, Number(body.days ?? 30) || 30));
  const cacheKey = `topics-${days}d`;

  if (!body.refresh) {
    const cached = getTopicCache(cacheKey, 24);
    if (cached) {
      return NextResponse.json({ ...(cached as object), cached: true });
    }
  }

  const samples = topChatSamples(days, 20, 1200);
  if (samples.length === 0) {
    return NextResponse.json({ error: "no chat samples for window" }, { status: 404 });
  }

  // Compact JSON-only input for the model
  const inputForModel = samples.map((s, i) => ({
    id: i,
    name: s.name,
    chat_jid: s.chat_jid,
    sample: s.sample,
  }));

  const client = new Anthropic({ apiKey });
  try {
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text:
            `You cluster WhatsApp conversations into 4-8 high-level themes. Each chat can belong to multiple topics. Output JSON ONLY, no commentary, no markdown fences:

{"topics": [{"topic": "short topic label (2-4 words)", "description": "one sentence", "chat_ids": [0, 3, 7]}, ...]}

Topics should be concrete and personally meaningful (e.g. "Wedding planning", "Family logistics", "Side projects", "Travel coordination", "Food + reservations") — NOT generic ("Personal", "Other"). Use the sample text to infer topics. Multilingual samples are fine — keep topic labels in English.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Chat samples (each is a flat join of recent text):\n\n${JSON.stringify(inputForModel)}`,
            },
          ],
        },
      ],
    });
    const text = completion.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
    // Strip ```json fences if the model added any
    const jsonText = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    let parsed: { topics: Array<{ topic: string; description: string; chat_ids: number[] }> };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "model output was not JSON", raw: text }, { status: 502 });
    }

    const result: { generated_at: string; days: number; topics: Topic[] } = {
      generated_at: new Date().toISOString(),
      days,
      topics: parsed.topics.map((t) => ({
        topic: t.topic,
        description: t.description,
        chats: t.chat_ids
          .map((id) => samples[id])
          .filter(Boolean)
          .map((s) => ({ chat_jid: s.chat_jid, name: s.name })),
      })),
    };

    setTopicCache(cacheKey, result);
    return NextResponse.json({ ...result, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
