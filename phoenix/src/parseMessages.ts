// Parsers that turn exported/pasted conversations into structured messages.

export interface ParsedMessage {
  date: string;
  /** "HH:MM" when the export carried a time; "" when it genuinely didn't. */
  time?: string;
  sender: string;
  text: string;
}

/** Minimal CSV parser with quoted-field support. */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/**
 * CSV → messages. Detects date/sender/text columns from a header row when
 * present; otherwise assumes the first three columns are date, sender, text.
 */
export function messagesFromCsv(raw: string): ParsedMessage[] {
  const rows = parseCsv(raw);
  if (rows.length === 0) return [];

  let dateIdx = 0;
  let senderIdx = 1;
  let textIdx = 2;
  let start = 0;

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const findCol = (patterns: RegExp[]) =>
    header.findIndex((h) => patterns.some((p) => p.test(h)));
  const d = findCol([/date/, /^time/, /timestamp/, /when/, /sent/]);
  // A NAME first, and only then an ID.
  //
  // This used to be one pattern, /sender/, taking whichever column matched
  // first. A phone export carries "Sender ID" before "Sender Name", so every
  // one of his messages was filed under a phone number instead of his name —
  // and the app asks her to tap his name to mark which messages are his.
  const s = findCol([/sender name/, /^name$/, /^from$/, /author/, /contact/]);
  const sid = findCol([/sender/, /^from/, /number/]);
  // Direction, which is what makes HER messages attributable at all.
  const dir = findCol([/^type$/, /direction/, /in\s*\/?\s*out/]);
  // The message column, and this one was catastrophic.
  //
  // It used to be findCol([/text/, /body/, /message/, /content/]), taking the
  // first header matching any of them. A phone export's first column after the
  // chat name is "Message Date" — which matches /message/. So every import took
  // column 1 as the message body, and her entire archive was stored as 26,399
  // copies of a timestamp. The scan then read a document made of nothing but
  // dates and, correctly, found no abuse in it.
  //
  // Prefer an exact name; fall back to a loose match that refuses anything
  // which is plainly a date or time column.
  const t = (() => {
    const exact = header.findIndex((h) =>
      /^(text|body|message|content|message text|message body|body text)$/.test(h)
    );
    if (exact >= 0) return exact;
    return header.findIndex(
      (h) => /(text|body|message|content)/.test(h) && !/(date|time|stamp)/.test(h)
    );
  })();
  if (d >= 0 || s >= 0 || sid >= 0 || t >= 0) {
    start = 1;
    if (d >= 0) dateIdx = d;
    if (s >= 0) senderIdx = s;
    else if (sid >= 0) senderIdx = sid;
    if (t >= 0) textIdx = t;
  }

  const out: ParsedMessage[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const text = (r[textIdx] || "").trim();
    if (!text) continue;
    // Her own messages carry no sender at all — a phone export only names the
    // other party — so 11,505 of the 24,928 messages in her real archive were
    // filed as "unknown". Nearly half the conversation arrived at the scanner
    // attributed to nobody, while the prompt asks it to catalog her own words
    // and the fear she recorded at the time, and to treat his words as
    // admissions. Neither is possible without knowing who spoke.
    //
    // The direction column is populated on every row of that export, so this
    // is fully recoverable: outgoing is hers, incoming is his.
    const name = (r[senderIdx] || "").trim();
    const direction = dir >= 0 ? (r[dir] || "").trim().toLowerCase() : "";
    const outgoing = /outgoing|^sent$|^me$|^self$/.test(direction);
    const incoming = /incoming|^received$/.test(direction);
    const fallbackId = sid >= 0 ? (r[sid] || "").trim() : "";
    out.push({
      ...parseDateTime((r[dateIdx] || "").trim()),
      sender: name || (outgoing ? "Me" : fallbackId || (incoming ? "Them" : "unknown")),
      text,
    });
  }
  return out;
}

// WhatsApp iOS:      [3/14/24, 9:12:45 PM] Name: text
// WhatsApp Android:  3/14/24, 21:12 - Name: text
// Generic:           2024-03-14 Name: text
const LINE_PATTERNS: RegExp[] = [
  /^\[(?<date>[^\]]+)\]\s*(?<sender>[^:]{1,60}):\s?(?<text>[\s\S]*)$/,
  /^(?<date>\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?)\s*[-–]\s*(?<sender>[^:]{1,60}):\s?(?<text>[\s\S]*)$/i,
  /^(?<date>\d{4}-\d{2}-\d{2})\s+(?<sender>[^:]{1,60}):\s?(?<text>[\s\S]*)$/,
];

/**
 * Plain-text export → messages. Lines that don't start a new message are
 * treated as continuations of the previous one. Falls back to one message
 * per non-empty line with the supplied defaults.
 */
export function messagesFromText(
  raw: string,
  defaults: { date: string; sender: string }
): ParsedMessage[] {
  const lines = raw.split(/\r?\n/);
  const out: ParsedMessage[] = [];
  let current: ParsedMessage | null = null;
  let matchedAny = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    let matched = false;
    for (const pattern of LINE_PATTERNS) {
      const m = line.match(pattern);
      if (m && m.groups) {
        if (current) out.push(current);
        current = {
          ...parseDateTime(m.groups.date.trim()),
          sender: m.groups.sender.trim(),
          text: m.groups.text.trim(),
        };
        matched = true;
        matchedAny = true;
        break;
      }
    }
    if (!matched) {
      if (current) {
        current.text += "\n" + line.trim();
      } else {
        out.push({ date: defaults.date, sender: defaults.sender, text: line.trim() });
      }
    }
  }
  if (current) out.push(current);

  if (!matchedAny && out.length === 0) {
    const text = raw.trim();
    if (text) out.push({ date: defaults.date, sender: defaults.sender, text });
  }
  return out;
}

/** Best-effort normalization to YYYY-MM-DD; keeps original string if unparseable. */
export function normalizeDate(s: string): string {
  if (!s) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const cleaned = s.replace(/[[\]]/g, "").replace(/\s*[-–]\s*$/, "");
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  // M/D/YY or D.M.YY style
  const m = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    let year = parseInt(y, 10);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    const month = parseInt(a, 10) <= 12 ? a : b;
    const day = parseInt(a, 10) <= 12 ? b : a;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return s;
}


/**
 * Pull BOTH the date and the time out of a timestamp.
 *
 * normalizeDate deliberately returns only the day, which is right for a date
 * column but throws away something that matters: when a message arrived.
 * Forty messages between 1am and 4am is a pattern a court recognises, and it
 * is invisible if every row says only "2024-03-14".
 *
 * Returns time as "HH:MM" (24-hour) when the source carried one, and "" when
 * it genuinely didn't — never a guess.
 */
export function parseDateTime(s: string): { date: string; time: string } {
  const date = normalizeDate(s);
  if (!s) return { date, time: "" };
  const cleaned = s.replace(/[[\]]/g, "").trim();

  // 9:12 PM / 9:12:45 pm / 21:12 / 21:12:45, anywhere in the string.
  const m = cleaned.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])?\.?[Mm]?\.?/);
  if (!m) return { date, time: "" };

  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const half = (m[3] || "").toLowerCase();
  if (half === "p" && hour < 12) hour += 12;
  if (half === "a" && hour === 12) hour = 0;
  if (hour > 23 || parseInt(minute, 10) > 59) return { date, time: "" };

  return { date, time: `${String(hour).padStart(2, "0")}:${minute}` };
}
