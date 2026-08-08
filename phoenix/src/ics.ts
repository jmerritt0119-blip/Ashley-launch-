// Apple Calendar (.ics) export for key dates, with built-in reminders.
import type { KeyDate } from "./db";
import { downloadText } from "./exportCsv";

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function dtstamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function fold(line: string): string {
  // RFC 5545: lines max 75 octets; simple char-based fold is fine for our content.
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

function vevent(d: KeyDate): string[] {
  const uid = `phx-${d.id ?? Math.random().toString(36).slice(2)}-${d.date.replace(/-/g, "")}@phoenix`;
  const lines: string[] = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${dtstamp()}`];
  const ymd = d.date.replace(/-/g, "");
  if (d.time) {
    const hms = d.time.replace(/:/g, "").padEnd(6, "0");
    lines.push(`DTSTART:${ymd}T${hms}`); // floating local time — right for court dates
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd}`);
  }
  lines.push(`SUMMARY:${esc(`${d.title}${d.type !== "other" ? ` (${d.type})` : ""}`)}`);
  if (d.location) lines.push(`LOCATION:${esc(d.location)}`);
  if (d.notes) lines.push(`DESCRIPTION:${esc(d.notes.slice(0, 800))}`);
  // Reminders: one week before and one day before.
  for (const trigger of ["-P7D", "-P1D"]) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:${trigger}`,
      `DESCRIPTION:${esc(`Coming up: ${d.title}`)}`,
      "END:VALARM"
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

export function downloadIcs(dates: KeyDate[], filename: string): void {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Phoenix//Case Builder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...dates.flatMap(vevent),
    "END:VCALENDAR",
  ];
  const body = lines.map(fold).join("\r\n") + "\r\n";
  downloadText(filename, body, "text/calendar;charset=utf-8");
}
