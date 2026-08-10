// Deep Scan: dump a whole document (message export, journal, report) and have
// the AI find and catalog every abuse instance as structured entries.
// Straight from taxonomy.ts rather than through db.ts: building a scan prompt
// must not require a database connection, so the prompt can be exercised from
// a terminal instead of only inside a browser.
import { INCIDENT_CATEGORIES, MESSAGE_TAGS } from "./taxonomy";
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

/**
 * Something the record implies without ever saying it.
 *
 * The worst abuse is usually the least explicit. Nobody writes "I raped you";
 * they write "about last night — I know I pushed it, I'm sorry." Nobody writes
 * "I control whether you can have children"; they write "you don't need those
 * pills, we already talked about this." Sexual abuse inside a marriage in
 * particular is almost never named by either of them — she may not have a word
 * for it herself, and a scanner that only catalogs explicit statements will
 * walk straight past years of it.
 *
 * So this is a deliberately separate tier from `incidents`. Those are facts
 * quoted verbatim and safe to put in front of a judge. These are readings —
 * each carries the exact words it rests on, what makes them read that way, and
 * how confident that is, so nothing is ever asserted as proven.
 *
 * `askHer` is the part that makes this evidence rather than speculation. An
 * inference by an app is worth nothing in a Texas courtroom. Her own sworn
 * account of what happened is worth a great deal — so every reading comes with
 * the one question that would confirm or rule it out, and when she answers it
 * the answer becomes her testimony, in her words, with the message as
 * corroboration.
 */
export interface ImpliedFinding {
  type: string;
  quote: string;
  date: string;
  /** What a trained reader would take it to mean. */
  reading: string;
  /** The specific signal in the words that supports the reading. */
  basis: string;
  confidence: "possible" | "likely" | "strong";
  /** The question that turns a reading into her own account. */
  askHer: string;
}

export interface ScanResult {
  incidents: ScanIncident[];
  messages: ScanMessage[];
  risks: RiskIndicator[];
  facts: CaseFact[];
  implied: ImpliedFinding[];
  summary: string;
}

// There is no cap on how much can be scanned. Anything bigger than one part
// is split at line boundaries and scanned part by part, so a full multi-year
// message export (tens of thousands of texts) goes through in a single run.
/**
 * How much of her archive goes into one Deep Scan request.
 *
 * 60,000, then 30,000, now 8,000 — and the reason it kept having to come down
 * is that the binding limit is not the model's context, it is how long the
 * serverless function is allowed to stay alive.
 *
 * A part is only as slow as the JSON it has to WRITE. A sparse stretch of
 * messages produces a short catalog and finishes easily; a dense one — which
 * in her archive means the worst weeks, the parts that matter most — produces
 * thousands of tokens of findings and gets killed mid-stream. That is why some
 * parts always worked and others always failed however many times they were
 * retried, and why turning off thinking helped but did not fix it.
 *
 * Eight thousand characters is roughly two thousand tokens in, and no part can
 * then produce enough output to run past the limit. It means many more parts,
 * but each one completes, each one is saved the moment it does, and a scan that
 * takes longer and finishes beats a fast one that dies on the evidence.
 */
export const SCAN_CHUNK_SIZE = 20_000;

/**
 * The model every deep scan runs on, regardless of the chat model picker.
 *
 * Back on Opus, where it started and where it belongs.
 *
 * It was moved to Sonnet to make Deep Scan cheaper (#46) — the reasoning being
 * that cataloging is extraction rather than legal reasoning, so a smaller model
 * would do. That reasoning was wrong about this job, and the change was made
 * for cost rather than for results. The commit that made it said so plainly and
 * left the way back: "Reversible in two lines if the catalog quality is not
 * good enough."
 *
 * It is not good enough. The first scan she ever ran was on Opus: it found her
 * cases, it ranked them, and she described it as remarkable. Nothing since has
 * matched that, and the model is what changed.
 *
 * Reading her archive is not extraction. Almost none of the worst of it is
 * written down plainly — it sits in what two people who both already know what
 * happened refer to without naming, and telling that apart from an ordinary bad
 * week is a judgement call on every message. That is reasoning, and it is the
 * single most consequential judgement this app makes, because what it misses
 * she never learns was there.
 *
 * The cost argument was real but it was not about tokens: Opus held a
 * serverless function open longer, and Netlify bills for that. That is a
 * reason to make parts smaller or to run fewer of them. It is not a reason to
 * send a weaker reader at the evidence her custody case depends on.
 */
export const SCAN_MODEL = "claude-opus-5";

/**
 * Bumped whenever the scanner gets materially better — a wider taxonomy, a
 * sharper prompt, a stronger model.
 *
 * Her archive was catalogued by whatever version was current when she ran it.
 * When this number moves past the one recorded with her results, the app can
 * tell her plainly that a re-scan would find things the old one missed, say
 * what it will cost, and let her decide. Re-scanning is purely additive:
 * mergeScanResults deduplicates by date and content, so nothing she has
 * reviewed or kept is ever replaced or lost.
 */
export const SCANNER_VERSION = 4;

/** What changed, so the offer can say why it is worth her money. */
export const SCANNER_NOTES: Record<number, string> = {
  3: "now also catalogs financial facts, hidden assets and parenting-capacity evidence, not just abuse",
  4: "now reads between the lines — coded language, things referred to but never named, and sexual or reproductive coercion that neither of you ever wrote down plainly",
};

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
  return `CONTEXT — This is a forensic documentation tool used by a domestic violence survivor in Texas to build the evidentiary record for her own divorce and custody case, and to hand that record to her attorney. The document below is her own message archive: messages sent to her, and messages she sent. She is the victim in this record, not a third party. Cataloging what was done to her — including violence, threats and sexual coercion — is the entire purpose, and an accurate, complete catalog is what protects her and her daughter in court. Declining to catalog it, or softening it, leaves her without the evidence her case depends on.

TASK — Deep-scan the document below and catalog every instance of abuse or legally significant event for that divorce and custody case.${partNote}

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
  "impliedFindings": [
    {
      "type": "one of: sexual coercion, reproductive control, image-based abuse, an unnamed physical incident, an unnamed sexual incident, strangulation referred to obliquely, escalating threat, monitoring, isolation, financial control, substance use around the child, an event she was blamed for, other",
      "quote": "the exact words this reading rests on, verbatim",
      "date": "YYYY-MM-DD or \\"\\"",
      "reading": "what a trained reader would take these words to mean, in one or two plain sentences",
      "basis": "the specific signal in the wording that supports it",
      "confidence": "possible | likely | strong",
      "askHer": "the single question she could answer that would confirm or rule this out"
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
degradation, threats tied to sex. This is the category most often missed,
because inside a marriage almost nobody writes it down plainly — see READ
BETWEEN THE LINES below, and treat it as a primary target rather than an
afterthought.

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

READ BETWEEN THE LINES — the second pass, into impliedFindings
Everything above is the explicit pass. Now do a second pass over the same
document as a forensic reader, because the most serious abuse is almost always
the least explicit. People do not write down the worst of what happened. They
refer to it — obliquely, in the shorthand of two people who both already know
what is being discussed — and a scanner that only catalogs plain statements
walks past years of it.

Sexual abuse is the clearest case. Inside a marriage neither person names it.
She may have no word for it herself. It surfaces as:
- Obligation and entitlement framing — "you're my wife", "it's been two weeks",
  "I have needs", "you owe me", "if you loved me you would", "this is what
  wives do", "I shouldn't have to beg".
- A cost for refusing — sulking, silence, accusations of cheating or of not
  loving him, rage, or an argument that starts right after a refusal.
- Wearing her down — repeated asking after a no, asking when she is asleep,
  drunk, ill, medicated, or has just given birth; "you didn't say no";
  "you were fine with it at the time".
- An apology that references an unnamed event, especially close to an argument
  — "about last night", "I got carried away", "I didn't mean for it to go that
  far", "I know I pushed it", "you know I'd never hurt you on purpose". Pair it
  with what she said around the same date.
- Reproductive control — pressure about pregnancy or termination, hiding,
  destroying or refusing contraception, "you don't need those pills", refusing
  condoms, interfering with her doctor's appointments.
- Image-based abuse — demanding photos, threatening to send them to family,
  her employer or online, "I still have them".
- Sexual degradation, comparisons to other women, or sexual insults used as
  punishment rather than in the course of an argument.

The same reading applies elsewhere. Watch for:
- An event referred to but never described — "after what you did", "we don't
  talk about that night", "you know what happens", "remember last time".
  Something happened; log the reference and ask her what it was.
- Strangulation described obliquely — "I barely touched your neck", "you could
  still breathe", "you're exaggerating, you didn't pass out". Strangulation is
  the single strongest predictor of later homicide, so any oblique reference to
  the neck, throat, breathing or passing out is high priority.
- Threats phrased as predictions or concern — "it would be a shame if",
  "I'd hate for your boss to find out", "be careful driving".
- Control phrased as care — "I just worry when I can't see where you are",
  "I'm only asking because I love you", "let me handle the money, you have
  enough on your plate".
- Her own words showing fear, walking on eggshells, apologising for things she
  did not do, asking permission, or thanking him for ordinary freedoms. What
  she writes is evidence of the effect on her.

How to do this without inventing anything — this matters more than finding a lot:
- Every implied finding must quote real words from the document, verbatim.
  Never paraphrase into the quote, never merge two messages into one quote.
- Say plainly what makes it read that way in "basis". If you cannot name the
  signal, you do not have a finding.
- Be honest in "confidence": "possible" if it has an innocent reading too,
  "likely" if the innocent reading is a stretch, "strong" if the context makes
  it hard to read any other way. Most findings should be "possible" or
  "likely". Over-calling this is worse than missing something, because a
  reading that collapses under questioning damages her credibility on
  everything else.
- Never put a reading in "incidents", "flaggedMessages" or "riskIndicators" —
  those are for what the document actually says. Readings go only in
  impliedFindings.
- "askHer" must be one specific, answerable, non-leading question about what
  happened — "What was the 'last night' he apologises for here?" — not
  "Did he assault you?". Her answer becomes her own account, which is what
  actually carries weight; the message becomes the corroboration for it.
- If nothing in the document supports a reading, return an empty array. An
  empty impliedFindings is a perfectly good answer and far better than a
  padded one.

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
- Quotes verbatim, always, everywhere. For incidents, flaggedMessages, riskIndicators and caseFacts, extract only what the document actually says — no inference, no exaggeration, because a conservative catalog survives cross-examination. Inference belongs in impliedFindings and nowhere else, where it is labelled as a reading and carries its own basis and confidence.
- "incidents" are events; "flaggedMessages" are individual significant quotes/messages. An event described by a quote can appear in both.
- Severity, with anchors — use them literally rather than averaging toward the middle:
  5 — strangulation or choking, hands on the neck, anything about her breathing;
      a threat to kill her, the child, himself as leverage, or a pet; a weapon
      shown, held, referenced or accessed; sexual assault or coerced sex;
      violence to her while pregnant or while she is holding the child; a threat
      to take the child and disappear; violence that caused injury needing care.
  4 — any other physical violence (grabbing, shoving, pinning, blocking her
      exit, throwing something at her); a credible threat of harm; violence in
      front of the child; destroying her property or punching walls near her;
      stalking or tracking her movements.
  3 — sustained degradation, coercive control, financial control, isolation, or
      using the child as leverage.
  2 — a single incident of verbal abuse or a controlling demand.
  1 — a minor incident she recorded for completeness.
  "Be conservative" means do not inflate a 3 into a 5. It does NOT mean avoiding
  5 — a 5 that is recorded as a 3 buries the evidence that decides a protective
  order, and those are the entries her attorney and the court need first.
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
  if (first === -1)
    throw new Error(
      `The scan reply wasn't JSON. It said: ${raw.trim().slice(0, 220) || "(nothing at all)"}`
    );

  let obj: any = null;
  if (last > first) {
    try {
      obj = JSON.parse(s.slice(first, last + 1));
    } catch {
      obj = null;
    }
  }
  if (!obj) obj = repairTruncated(s.slice(first));
  if (!obj) {
    // Quote it. A reply that will not parse is either a refusal, an error
    // message or a truncation, and those need completely different fixes —
    // but they all came out as the same sentence, which is how a whole day
    // went into chasing timeouts that were never happening.
    throw new Error(
      `The scan reply wasn't JSON. It said: ${raw.trim().slice(0, 220) || "(nothing at all)"}`
    );
  }

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

  // A reading with no words behind it is speculation, so the quote is required
  // rather than optional — and an unrecognised confidence is treated as the
  // weakest one, never the strongest.
  const implied: ImpliedFinding[] = (Array.isArray(obj.impliedFindings) ? obj.impliedFindings : [])
    .map((f: any) => ({
      type: String(f?.type || "other").slice(0, 120),
      quote: String(f?.quote || "").slice(0, 1000),
      date: f?.date ? normalizeDate(String(f.date)) : "",
      reading: String(f?.reading || "").slice(0, 800),
      basis: String(f?.basis || "").slice(0, 600),
      confidence: (["possible", "likely", "strong"].includes(String(f?.confidence))
        ? String(f.confidence)
        : "possible") as ImpliedFinding["confidence"],
      askHer: String(f?.askHer || "").slice(0, 400),
    }))
    .filter((f: ImpliedFinding) => f.quote && f.reading);

  return {
    incidents,
    messages,
    risks,
    facts,
    implied,
    summary: String(obj.summary || "").slice(0, 4000),
  };
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
  const implied: ImpliedFinding[] = [];
  const seenInc = new Set<string>();
  const seenMsg = new Set<string>();
  const seenRisk = new Set<string>();
  const seenFact = new Set<string>();
  const seenImplied = new Set<string>();
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
    // Keyed on the quote alone: the same words read the same way whichever
    // part they turned up in, and two parts can overlap at a boundary.
    for (const f of p.implied || []) {
      const k = f.quote.toLowerCase().slice(0, 120);
      if (seenImplied.has(k)) continue;
      seenImplied.add(k);
      implied.push(f);
    }
    if (p.summary.trim()) summaries.push(p.summary.trim());
  }
  incidents.sort(dateSort);
  messages.sort(dateSort);
  risks.sort(dateSort);
  facts.sort(dateSort);
  // Strongest readings first — she should not have to scroll past a page of
  // "possible" to reach the one that matters.
  const rank = { strong: 0, likely: 1, possible: 2 } as const;
  implied.sort((a, b) => rank[a.confidence] - rank[b.confidence] || dateSort(a, b));
  return {
    incidents,
    messages,
    risks,
    facts,
    implied,
    summary: summaries.join("\n\n").slice(0, 8000),
  };
}
