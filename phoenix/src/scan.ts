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

export const SCAN_INPUT_LIMIT = 150_000;

export function buildScanPrompt(text: string): string {
  return `TASK — Deep-scan the document below and catalog every instance of abuse or legally significant event for a divorce and custody case.

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
- If the document contains nothing relevant, return empty arrays and say so in "summary".

DOCUMENT:
<<<
${text}
>>>`;
}

export function parseScanResult(raw: string): ScanResult {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last <= first) throw new Error("The scan reply wasn't in the expected format.");
  const obj = JSON.parse(s.slice(first, last + 1));

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
