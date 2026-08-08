// Deep Scan: dump a whole document (message export, journal, report) and have
// the AI find and catalog every abuse instance as structured entries.
import { INCIDENT_CATEGORIES, MESSAGE_TAGS } from "./db";
import { normalizeDate } from "./parseMessages";

export interface ScanIncident {
  date: string;
  title: string;
  narrative: string;
  categories: string[];
  severity: number;
  childrenPresent: boolean;
}

export interface ScanMessage {
  date: string;
  sender: string;
  text: string;
  tags: string[];
}

export interface ScanResult {
  incidents: ScanIncident[];
  messages: ScanMessage[];
  summary: string;
}

// There is no cap on how much can be scanned. Anything bigger than one part
// is split at line boundaries and scanned part by part, so a full multi-year
// message export (tens of thousands of texts) goes through in a single run.
export const SCAN_CHUNK_SIZE = 60_000;

/** The model every deep scan runs on, regardless of the chat model picker. */
export const SCAN_MODEL = "claude-opus-5";

export function chunkScanInput(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= SCAN_CHUNK_SIZE) return [t];
  const chunks: string[] = [];
  let cur = "";
  for (let line of t.split("\n")) {
    while (line.length > SCAN_CHUNK_SIZE) {
      if (cur.trim()) chunks.push(cur);
      cur = "";
      chunks.push(line.slice(0, SCAN_CHUNK_SIZE));
      line = line.slice(SCAN_CHUNK_SIZE);
    }
    if (cur && cur.length + line.length + 1 > SCAN_CHUNK_SIZE) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? cur + "\n" + line : line;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

export function buildScanPrompt(text: string, part?: { index: number; total: number }): string {
  const partNote =
    part && part.total > 1
      ? `\n(This is part ${part.index} of ${part.total} of a longer document. Catalog only what appears in this part — the other parts are scanned separately.)`
      : "";
  return `TASK — Deep-scan the document below and catalog every instance of abuse or legally significant event for a divorce and custody case.${partNote}

Respond with ONLY valid JSON — no markdown fences, no commentary before or after — in exactly this shape:
{
  "incidents": [
    {
      "date": "YYYY-MM-DD, or \\"\\" if the document doesn't say",
      "title": "short factual title",
      "narrative": "concise factual account; include key quotes verbatim; if the date was relative ('last Tuesday'), say so here",
      "categories": ["one or more from the category list"],
      "severity": 1,
      "childrenPresent": false
    }
  ],
  "flaggedMessages": [
    {
      "date": "YYYY-MM-DD or \\"\\"",
      "sender": "who said or wrote it",
      "text": "the exact quote, verbatim",
      "tags": ["one or more from the tag list"]
    }
  ],
  "summary": "2-4 sentences naming the patterns found and roughly how often they appear"
}

Allowed categories: ${JSON.stringify(INCIDENT_CATEGORIES)}
Allowed tags: ${JSON.stringify(MESSAGE_TAGS)}

Rules:
- Catalog: physical violence, threats and intimidation, coercive control, verbal/emotional abuse, financial abuse, stalking or monitoring, isolation, property damage, anything endangering or involving children, order violations, admissions of wrongdoing, and apology-after-abuse cycles.
- Extract only what is actually in the document. Quotes verbatim. No inference beyond what is written, no exaggeration — a conservative catalog survives cross-examination.
- "incidents" are events; "flaggedMessages" are individual significant quotes/messages. An event described by a quote can appear in both.
- Severity: 1 minor … 5 extreme/dangerous. Be conservative.
- Stay within limits: if this part holds an overwhelming number of similar quotes, keep the ~60 most legally significant flaggedMessages (favor threats, violence, admissions, and anything involving children) and note in "summary" that more of the same pattern exists.
- If the document contains nothing relevant, return empty arrays and say so in "summary".

DOCUMENT:
<<<
${text}
>>>`;
}

/** Best-effort recovery when the model's JSON was cut off mid-list. */
function repairTruncated(s: string): any | null {
  const suffixes = ["]}", '],"flaggedMessages":[],"summary":""}'];
  let attempts = 0;
  for (const suffix of suffixes) {
    for (let cut = s.lastIndexOf("}"); cut > 0 && attempts < 40; cut = s.lastIndexOf("}", cut - 1)) {
      attempts++;
      try {
        return JSON.parse(s.slice(0, cut + 1) + suffix);
      } catch {
        /* keep walking back */
      }
    }
  }
  return null;
}

export function parseScanResult(raw: string): ScanResult {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1) throw new Error("The scan reply wasn't in the expected format.");

  let obj: any = null;
  if (last > first) {
    try {
      obj = JSON.parse(s.slice(first, last + 1));
    } catch {
      obj = null;
    }
  }
  if (!obj) obj = repairTruncated(s.slice(first));
  if (!obj) throw new Error("The scan reply wasn't in the expected format.");

  const cats = new Set<string>(INCIDENT_CATEGORIES);
  const tags = new Set<string>(MESSAGE_TAGS);

  const incidents: ScanIncident[] = (Array.isArray(obj.incidents) ? obj.incidents : [])
    .map((i: any) => ({
      date: i?.date ? normalizeDate(String(i.date)) : "",
      title: String(i?.title || "").slice(0, 200),
      narrative: String(i?.narrative || "").slice(0, 4000),
      categories: (Array.isArray(i?.categories) ? i.categories : [])
        .map((c: any) => String(c))
        .filter((c: string) => cats.has(c)),
      severity: Math.min(5, Math.max(1, Math.round(Number(i?.severity) || 3))),
      childrenPresent: !!i?.childrenPresent,
    }))
    .filter((i: ScanIncident) => i.title || i.narrative);

  const messages: ScanMessage[] = (Array.isArray(obj.flaggedMessages) ? obj.flaggedMessages : [])
    .map((m: any) => ({
      date: m?.date ? normalizeDate(String(m.date)) : "",
      sender: String(m?.sender || "unknown").slice(0, 100),
      text: String(m?.text || "").slice(0, 4000),
      tags: (Array.isArray(m?.tags) ? m.tags : [])
        .map((t: any) => String(t))
        .filter((t: string) => tags.has(t)),
    }))
    .filter((m: ScanMessage) => m.text);

  return { incidents, messages, summary: String(obj.summary || "").slice(0, 2000) };
}

const dateSort = <T extends { date: string }>(a: T, b: T) => {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
};

/** Combine per-part results into one catalog, deduplicating across parts. */
export function mergeScanResults(parts: ScanResult[]): ScanResult {
  const incidents: ScanIncident[] = [];
  const messages: ScanMessage[] = [];
  const seenInc = new Set<string>();
  const seenMsg = new Set<string>();
  const summaries: string[] = [];
  for (const p of parts) {
    for (const i of p.incidents) {
      const k = `${i.date}|${i.title.toLowerCase().slice(0, 80)}`;
      if (seenInc.has(k)) continue;
      seenInc.add(k);
      incidents.push(i);
    }
    for (const m of p.messages) {
      const k = `${m.date}|${m.text.toLowerCase().slice(0, 120)}`;
      if (seenMsg.has(k)) continue;
      seenMsg.add(k);
      messages.push(m);
    }
    if (p.summary.trim()) summaries.push(p.summary.trim());
  }
  incidents.sort(dateSort);
  messages.sort(dateSort);
  return { incidents, messages, summary: summaries.join("\n\n").slice(0, 8000) };
}
