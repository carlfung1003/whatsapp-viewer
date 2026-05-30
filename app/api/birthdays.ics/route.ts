import { detectBirthdays } from "@/lib/insights";

export const dynamic = "force-dynamic";

function ics(birthdays: ReturnType<typeof detectBirthdays>): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//whatsapp-viewer//birthdays//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const year = new Date().getFullYear();
  for (const b of birthdays) {
    const mm = String(b.month).padStart(2, "0");
    const dd = String(b.day).padStart(2, "0");
    const uid = `${b.chat_jid}-${mm}-${dd}@whatsapp-viewer`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${year}${mm}${dd}`,
      `DTEND;VALUE=DATE:${year}${mm}${dd}`,
      "RRULE:FREQ=YEARLY",
      `SUMMARY:🎂 ${b.name}'s birthday`,
      `DESCRIPTION:Inferred from WhatsApp messages (last wished ${b.last_wish_year}, ${b.evidence_count}× evidence)`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export async function GET() {
  const birthdays = detectBirthdays();
  const body = ics(birthdays);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="whatsapp-birthdays.ics"',
    },
  });
}
