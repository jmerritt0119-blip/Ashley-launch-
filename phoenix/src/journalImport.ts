// Turning a pasted journal into dated entries.
//
// Journals come out of Apple Journal, Day One, Notes, Google Docs and paper in
// wildly different shapes. The one thing they reliably contain is dates, so
// splitting on date headings recovers the structure without asking her to
// reformat years of writing by hand. Anything that can't be dated is still
// kept — it is never dropped.

export interface ParsedEntry {
  date: string; // YYYY-MM-DD, or "" when the text carried no date
  time?: string;
  title?: string;
  body: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Four-digit year, two-digit year, or a bare year-less date. */
function iso(y: number, m: number, d: number): string {
  if (y < 100) y += y > 60 ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Does this line announce a date? Returns the date plus any time and any
 * trailing title on the same line.
 */
export function readDateLine(raw: string): { date: string; time?: string; title?: string } | null {
  const line = raw.trim();
  if (!line || line.length > 120) return null;

  // "Wednesday, July 8, 2025" / "July 8, 2025" / "Jul 8 2025" / "8 July 2025"
  let m = line.match(
    /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i
  );
  if (!m) m = line.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const year = m[3] ? Number(m[3]) : new Date().getFullYear();
    const date = iso(year, MONTHS[m[1].toLowerCase()], Number(m[2]));
    if (date) return { date, ...trailing(line, m[0]) };
  }

  // "8 July 2025"
  m = line.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s*(\d{4})?/i);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const year = m[3] ? Number(m[3]) : new Date().getFullYear();
    const date = iso(year, MONTHS[m[2].toLowerCase()], Number(m[1]));
    if (date) return { date, ...trailing(line, m[0]) };
  }

  // "2025-07-08" / "2025/07/08"
  m = line.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const date = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (date) return { date, ...trailing(line, m[0]) };
  }

  // "7/8/25" / "07-08-2025" — US month-first, which is what her exports use.
  m = line.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    const date = iso(Number(m[3]), Number(m[1]), Number(m[2]));
    if (date) return { date, ...trailing(line, m[0]) };
  }

  return null;
}

/** Pull a time and any leftover words off the end of a date heading. */
function trailing(line: string, matched: string): { time?: string; title?: string } {
  const rest = line.slice(matched.length).replace(/^[\s,·—–-]+/, "").trim();
  if (!rest) return {};
  const t = rest.match(/^(?:at\s+)?(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
  if (t) {
    let h = Number(t[1]);
    const ampm = (t[3] || "").toLowerCase();
    if (ampm.startsWith("p") && h < 12) h += 12;
    if (ampm.startsWith("a") && h === 12) h = 0;
    const time = `${pad(h)}:${t[2]}`;
    const title = rest.slice(t[0].length).replace(/^[\s,·—–-]+/, "").trim();
    return { time, title: title || undefined };
  }
  return { title: rest };
}

/**
 * Split pasted journal text into dated entries. Text before the first date
 * heading becomes an undated entry rather than being thrown away.
 */
export function parseJournal(text: string): ParsedEntry[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const entries: ParsedEntry[] = [];
  let current: ParsedEntry | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    buffer = [];
    if (current) {
      current.body = body;
      if (current.body || current.title) entries.push(current);
    } else if (body) {
      entries.push({ date: "", body });
    }
  };

  for (const line of lines) {
    const head = readDateLine(line);
    if (head) {
      flush();
      current = { date: head.date, time: head.time, title: head.title, body: "" };
    } else {
      buffer.push(line);
    }
  }
  flush();

  return entries.filter((e) => e.body.trim() || (e.title || "").trim());
}
