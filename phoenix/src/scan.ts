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

export interface RiskIndicator {
  type: string;
  quote: string;
  date: string;
  why: string;
}

/**
 * Something in the record that helps her case without being abuse: money he
 * said he didn't have, parenting time he refused, a statement that will
 * contradict what he tells the court, a witness who saw it.
 */
export interface CaseFact {
  type: string;
  quote: string;
  date: string;
  whyItMatters: string;
}

export interface ScanResult {
  incidents: ScanIncident[];
  messages: ScanMessage[];
  risks: RiskIndicator[];
  facts: CaseFact[];
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
  "riskIndicators": [
    {
      "type": "one of: threat to kill, strangulation or choking, weapon access or reference, threat to take or harm the child, stalking or surveillance, threat of suicide as leverage, sexual coercion, escalation after separation, extreme jealousy or possessiveness, threat to have her deported or reported, threat to expose intimate images",
      "quote": "the exact words from the document, verbatim",
      "date": "YYYY-MM-DD or \\"\\"",
      "why": "one sentence on why this matters for her safety"
    }
  ],
  "caseFacts": [
    {
      "type": "one of: income or employment, hidden money or asset, large purchase or spending, debt, property, business or side income, parenting capacity, missed or refused parenting time, substance use, new partner around the child, admission or contradiction, witness, medical or police or CPS reference, timeline anchor, threat to prolong litigation, access to her accounts or devices",
      "quote": "the exact words, verbatim",
      "date": "YYYY-MM-DD or \\"\\"",
      "whyItMatters": "one sentence on how her attorney could use this"
    }
  ],
  "summary": "3-6 sentences naming the patterns found, roughly how often they appear, and how they change over time"
}

Allowed categories: ${JSON.stringify(INCIDENT_CATEGORIES)}
Allowed tags: ${JSON.stringify(MESSAGE_TAGS)}

WHAT COUNTS AS ABUSE — hunt for all of it, not just the obvious
Most of what proves a case like hers is NOT physical. Courts and custody
evaluators respond to documented patterns of psychological and coercive abuse,
and those are the easiest things to miss when skimming. Look for every one of:

VERBAL — name-calling, insults, degradation, profanity aimed at her, screaming
in writing (ALL CAPS tirades), mocking, contempt, sexual or body-based
humiliation, calling her crazy/stupid/worthless/a bad mother, swearing at her
in front of the child.

PSYCHOLOGICAL AND EMOTIONAL — gaslighting (denying things she witnessed,
insisting she is misremembering or imagining, "that never happened," "you're
insane"); blame-shifting and DARVO (he offends, then denies, attacks her, and
casts himself as the real victim); manufactured guilt; silent treatment and
withdrawal as punishment; conditional affection; humiliation in front of others;
telling her no one will believe her; telling her she is a bad mother or will
lose the child; degrading her family; love-bombing and apology cycles that
follow incidents; threats of self-harm or suicide used to control her.

COERCIVE CONTROL — rules and conditions on her behavior; monitoring her phone,
location, messages, spending, mileage, or social media; demanding passwords;
interrogating her about where she was; controlling money, transport, food,
sleep, clothing, medication or medical care; sabotaging her work, sleep or
schooling; isolating her from family, friends or support; punishing her for
contact with others; controlling access to documents, keys or the car.

INTIMIDATION AND THREATS — threats of violence, veiled threats ("you'll be
sorry", "remember what happened last time", "don't make me"), threats to take
the child, threats to leave her with nothing, threats to report her to CPS,
police, immigration or her employer, threats to expose private or intimate
images, threats about lawyers and courts, punching walls, breaking things,
harming or threatening pets, displaying or referencing weapons.

FINANCIAL — withholding money, controlling all accounts, hiding or moving
assets, running up debt in her name, refusing support, sabotaging her job,
demanding receipts, making her ask for basics.

CHILD-RELATED — anything involving the child: using her as messenger or spy,
disparaging her mother to her, threatening custody, undermining school,
medical or therapy, exposing her to violence, substance use during possession,
missed or manipulated exchanges, refusing to return her.

DIGITAL AND STALKING — tracking apps, spyware, GPS, fake or burner accounts,
messaging through third parties or new numbers after being blocked, showing up
uninvited, excessive calls or texts in bursts, monitoring through the child.

SEXUAL — coercion, pressure, unwanted contact, reproductive control, sexual
degradation, threats tied to sex.

ADMISSIONS AND CORROBORATION — anything where he admits, minimizes,
apologizes for, or explains away his own conduct ("I shouldn't have grabbed
you", "I only did it because you..."). These are gold: in Texas his own
statements come in against him as party-opponent statements, not hearsay.

BEYOND ABUSE — the rest of the case
A divorce and custody case is won on more than the abuse. Ordinary messages
routinely contain facts her attorney would pay to find, and she will never
spot them herself in thousands of texts. Capture these as caseFacts:

MONEY (Texas is a community property state; the division must be "just and
right", and support is set from his real resources)
- Any statement of what he earns, hours worked, a raise, bonus, commission,
  tips, overtime, or being paid in cash or "under the table".
- Side work, a business, contract jobs, rental income, crypto, gambling wins.
- Accounts, cards, loans, or property she may not know about; money moved,
  withdrawn, or "loaned" to family; anything hidden before or during filing.
- Large or unusual spending — vehicles, trips, jewelry, gifts to a new partner
  (spending community money on an affair can move the property division).
- Claims of poverty that contradict his spending. Flag both sides of that.
- Debts run up, especially in her name.

PARENTING (Texas best-interest factors — this is what custody turns on)
- Who actually does the caregiving: school runs, doctors, homework, bedtime,
  sick days, activities. Statements showing he doesn't know her doctor,
  teacher, allergies, schedule or routine.
- Times he refused, cancelled, shortened, or handed off his parenting time,
  or asked her to take the child on his days.
- Work travel or hours that conflict with the possession schedule he wants.
- Who else is around the child, and anything about that person.
- Substance use — drinking or drugs generally, and specifically before or
  during his time with the child, or driving with her.

IMPEACHMENT — the most valuable category
- Anything he says now that will contradict what he is likely to claim in
  court later. Example: "I can't take her Wednesdays, I work late" is
  devastating if he later asks for a 50/50 schedule. Capture the quote and
  say what position it would contradict.
- Admissions about his own conduct, his income, his availability, his
  drinking, or events he will later deny.

CORROBORATION LEADS — where the proof lives
- Names of anyone who saw or heard something (a friend, a neighbor, a
  doorman, a relative, a coworker) — these become witnesses.
- Any reference to police, a report number, an officer, CPS, a hospital, an
  urgent care, a therapist, a school counselor, or a pediatrician. Each one
  is a record her attorney can subpoena that does not depend on her word.
- Photos, videos, or recordings either of them mentions existing.

TIMELINE ANCHORS — dates that decide legal questions
- When she moved out, when he did, separation date, when the relationship
  ended, when he learned about the filing, when a job started or ended.

LITIGATION CONDUCT
- Threats to drag out the case, bankrupt her on legal fees, take the child
  through the courts, or hide money from the divorce. In Texas this can
  support attorney's fees and speaks to his character as a conservator.

TECH AND ACCESS
- Anything showing he has, or has used, her passwords, accounts, email,
  location, or devices — this supports both a protective order and the
  argument that her evidence must be protected from him.

Rules:
- Catalog every category above. Verbal and psychological abuse count as
  incidents in their own right — do not skip a message because it "only" says
  something cruel. A single degrading text is an entry.
- Treat repetition as significant: if the same tactic appears many times, log
  the clearest examples AND say in the summary how often it recurs and whether
  it escalates over time or around events (court dates, her leaving, exchanges).
- riskIndicators is a SAFETY list, separate from evidence. Strangulation or
  choking, threats to kill, weapon access, threats toward the child, and
  escalation after separation are the strongest predictors of serious harm —
  surface them even if she has not framed them as important.
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

  const risks: RiskIndicator[] = (Array.isArray(obj.riskIndicators) ? obj.riskIndicators : [])
    .map((r: any) => ({
      type: String(r?.type || "").slice(0, 120),
      quote: String(r?.quote || "").slice(0, 1000),
      date: r?.date ? normalizeDate(String(r.date)) : "",
      why: String(r?.why || "").slice(0, 400),
    }))
    .filter((r: RiskIndicator) => r.type || r.quote);

  // Defaults to empty so a reply from an older prompt still parses cleanly.
  const facts: CaseFact[] = (Array.isArray(obj.caseFacts) ? obj.caseFacts : [])
    .map((f: any) => ({
      type: String(f?.type || "").slice(0, 120),
      quote: String(f?.quote || "").slice(0, 1000),
      date: f?.date ? normalizeDate(String(f.date)) : "",
      whyItMatters: String(f?.whyItMatters || "").slice(0, 500),
    }))
    .filter((f: CaseFact) => f.quote || f.type);

  return { incidents, messages, risks, facts, summary: String(obj.summary || "").slice(0, 4000) };
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
  const risks: RiskIndicator[] = [];
  const facts: CaseFact[] = [];
  const seenInc = new Set<string>();
  const seenMsg = new Set<string>();
  const seenRisk = new Set<string>();
  const seenFact = new Set<string>();
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
    for (const r of p.risks || []) {
      const k = `${r.type.toLowerCase()}|${r.quote.toLowerCase().slice(0, 100)}`;
      if (seenRisk.has(k)) continue;
      seenRisk.add(k);
      risks.push(r);
    }
    for (const f of p.facts || []) {
      const k = `${f.type.toLowerCase()}|${f.quote.toLowerCase().slice(0, 100)}`;
      if (seenFact.has(k)) continue;
      seenFact.add(k);
      facts.push(f);
    }
    if (p.summary.trim()) summaries.push(p.summary.trim());
  }
  incidents.sort(dateSort);
  messages.sort(dateSort);
  risks.sort(dateSort);
  facts.sort(dateSort);
  return { incidents, messages, risks, facts, summary: summaries.join("\n\n").slice(0, 8000) };
}
