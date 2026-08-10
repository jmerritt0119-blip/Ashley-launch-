/**
 * The pass that reads the case as a whole.
 *
 * Deep Scan splits her archive into parts and reads each one on its own. That
 * is the only way to get through 25,000 messages, and it has a blind spot the
 * size of the case: every question worth asking spans parts.
 *
 * A part sees a few weeks. It cannot see that the threats got worse after she
 * filed, that the bad nights cluster around his drinking or around exchanges,
 * that "I work late every Wednesday" in January contradicts the fifty-fifty
 * schedule he asked for in June, or that the same three names keep appearing as
 * people who were in the room. The per-part summaries were being concatenated,
 * which reads like sixteen people each describing a different fortnight and
 * nobody describing the marriage.
 *
 * This runs once, over the FINDINGS rather than the archive — a few hundred
 * catalogued items instead of millions of characters, so it is one cheap
 * request — and produces the analysis a human investigator would write after
 * reading the whole file: what happened over time, what it clusters around,
 * which of the lethality factors are actually present, who the witnesses are,
 * which records exist to be subpoenaed, where he contradicts himself, and what
 * is missing.
 *
 * It invents nothing. Every claim it makes has to point at a finding that is
 * already in her catalog, quoted verbatim, which is what keeps it usable in
 * front of a judge.
 */
import type { ScanResult } from "./scan";

/** A stretch of time where the record thickens, and what it thickens around. */
export interface CaseCluster {
  period: string;
  trigger: string;
  what: string;
}

/** One of the empirically validated homicide predictors, and whether it is here. */
export interface LethalityFactor {
  factor: string;
  present: "yes" | "possible" | "not in this record";
  evidence: string;
  date: string;
}

/** Someone who saw or heard something, or a record that exists independently. */
export interface Corroboration {
  kind: "witness" | "record";
  who: string;
  what: string;
  date: string;
  howToGetIt: string;
}

/** Something he said that will not survive contact with his own case. */
export interface Contradiction {
  hisWords: string;
  date: string;
  contradicts: string;
  whyItMatters: string;
}

export interface CaseAnalysis {
  /** The two or three sentences her attorney should read first. */
  headline: string;
  /** How the abuse changed over the whole period covered by the record. */
  trajectory: string;
  clusters: CaseCluster[];
  /** Whether the tension / incident / reconciliation cycle is present, and how it runs. */
  cycle: string;
  lethality: LethalityFactor[];
  corroboration: Corroboration[];
  contradictions: Contradiction[];
  /** What the record does not contain, and what she could go and get. */
  gaps: string[];
}

export const EMPTY_ANALYSIS: CaseAnalysis = {
  headline: "",
  trajectory: "",
  clusters: [],
  cycle: "",
  lethality: [],
  corroboration: [],
  contradictions: [],
  gaps: [],
};

const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

/**
 * Render the catalog compactly for the analysis request.
 *
 * Dates first and in order, because everything this pass is being asked to see
 * is a function of time.
 */
function renderFindings(r: ScanResult): string {
  const lines: string[] = [];
  if (r.incidents.length) {
    lines.push(`INCIDENTS (${r.incidents.length}), oldest first:`);
    for (const i of r.incidents) {
      lines.push(
        `- ${i.date || "no date"} | severity ${i.severity}/5 | [${i.categories.join(", ")}]` +
          `${i.childrenPresent ? " | CHILD PRESENT" : ""} | ${i.title}: ${clip(i.narrative, 400)}`
      );
    }
  }
  if (r.risks.length) {
    lines.push(`\nSAFETY WARNINGS (${r.risks.length}):`);
    for (const x of r.risks) {
      lines.push(`- ${x.date || "no date"} | ${x.type} | "${clip(x.quote, 300)}" | ${clip(x.why, 200)}`);
    }
  }
  if (r.messages.length) {
    lines.push(`\nFLAGGED MESSAGES (${r.messages.length}):`);
    for (const m of r.messages) {
      lines.push(
        `- ${m.date || "no date"} | ${m.sender}${m.tags.length ? ` [${m.tags.join(", ")}]` : ""}: "${clip(m.text, 300)}"`
      );
    }
  }
  if (r.facts.length) {
    lines.push(`\nCASE FACTS (${r.facts.length}):`);
    for (const f of r.facts) {
      lines.push(`- ${f.date || "no date"} | ${f.type} | "${clip(f.quote, 300)}" | ${clip(f.whyItMatters, 200)}`);
    }
  }
  if (r.implied.length) {
    lines.push(`\nREADINGS BETWEEN THE LINES (${r.implied.length}):`);
    for (const f of r.implied) {
      lines.push(
        `- ${f.date || "no date"} | ${f.type} (${f.confidence}) | "${clip(f.quote, 300)}" | ${clip(f.reading, 200)}`
      );
    }
  }
  if (r.summary.trim()) {
    lines.push(`\nPER-PART NOTES FROM THE SCAN:\n${clip(r.summary, 6000)}`);
  }
  return lines.join("\n");
}

export function buildSynthesisPrompt(result: ScanResult, hisNames?: string): string {
  const who = hisNames?.trim()
    ? `Messages whose sender is one of [${hisNames.trim()}] are from HIM, the abusive party. Everything else is from her or a third party.`
    : `The record does not say which sender is him. Where it matters, say which reading you are using.`;

  return `CONTEXT — This is a forensic documentation tool used by a domestic violence survivor in Texas to build the evidentiary record for her own divorce and custody case. What follows is the CATALOG her Deep Scan has already produced from her own message archive: incidents, safety warnings, flagged messages, case facts and readings, each already extracted and quoted from the source.

${who}

TASK — You are the analyst who reads the whole file after the cataloguing is done. The scan read her archive in parts, a few weeks at a time, and no part could see the shape of the whole thing. That is your job, and it is the only job here: find what is only visible across the entire record.

Answer with ONLY valid JSON — no markdown fences, no commentary — in exactly this shape:
{
  "headline": "the 2-4 sentences her attorney should read before anything else: what this record shows, how serious it is, and what it supports",
  "trajectory": "how it changed across the whole period. Did it escalate, in frequency or severity or both? When did it turn? Anchor it to real dates from the catalog. If it did not escalate, say that plainly.",
  "clusters": [
    {
      "period": "e.g. March-May 2024, or a single date",
      "trigger": "what the incidents in this stretch have in common — her leaving or threatening to, filing, a court date, pregnancy, his drinking, job loss, exchanges, holidays",
      "what": "what happens in this stretch, with dates"
    }
  ],
  "cycle": "whether the record shows a repeating cycle — tension, then an incident, then apology or affection, then the same again — and roughly how long a turn of it takes. Quote an example pairing an incident with the apology that followed it. Say so if there is no such pattern.",
  "lethality": [
    {
      "factor": "one of: strangulation or choking, threat to kill, weapon or gun access, forced or coerced sex, violence during pregnancy, threat to harm the child, threat of suicide as leverage, stalking or surveillance, extreme jealousy or control of daily life, escalation after separation, violation of a court order, harm to a pet",
      "present": "yes | possible | not in this record",
      "evidence": "the exact quote or incident from the catalog that establishes it — leave empty when not present",
      "date": "YYYY-MM-DD or empty"
    }
  ],
  "corroboration": [
    {
      "kind": "witness | record",
      "who": "the person's name, or the kind of record (police report, hospital, CPS, school, therapist, employer)",
      "what": "what they saw or what the record would show",
      "date": "YYYY-MM-DD or empty",
      "howToGetIt": "in one line, how her attorney would obtain it"
    }
  ],
  "contradictions": [
    {
      "hisWords": "his exact words from the catalog, verbatim",
      "date": "YYYY-MM-DD or empty",
      "contradicts": "the position this would undercut if he takes it in court",
      "whyItMatters": "one sentence"
    }
  ],
  "gaps": ["what this record does not contain that a case like hers usually needs, and what she could go and get"]
}

HOW TO DO IT
- Go through the lethality list one factor at a time and answer for each. A factor that is genuinely absent is a real and useful answer — say "not in this record" rather than leaving it out. This list is the part that speaks to whether she is safe now, so it is the part to be most careful with.
- For trajectory and clusters, work from the dates. Count incidents per period rather than impressions, and name the months. If the record thickens sharply somewhere, say where and say what else was happening then.
- For contradictions, look for anything he said about his income, his hours, his availability, his drinking, his parenting, or events he may later deny — and say what position it would undercut. In Texas his own statements come in against him, so these are among the most valuable things in the file.
- For corroboration, pull out every person named as present and every reference to police, a report number, an officer, CPS, a hospital, urgent care, a therapist, a counsellor, a doctor or a school. Each one is proof that does not depend on her word against his.
- For gaps, be concretely useful: name what is missing and what would fix it.

RULES
- Invent nothing. Every quote must appear in the catalog below, exactly as written. If you cannot support a claim from the catalog, do not make it.
- Do not re-list the catalog. Findings are already recorded; your output is only what emerges from looking at all of them together.
- Where the catalog is thin, say so rather than filling the space. An honest short analysis is worth more than a padded one, because she will act on this.
- Write it for her attorney, and in language she can follow.

THE CATALOG:
<<<
${renderFindings(result)}
>>>`;
}

export function parseCaseAnalysis(raw: string): CaseAnalysis {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last <= first) {
    throw new Error(
      `The analysis reply wasn't JSON. It said: ${raw.trim().slice(0, 220) || "(nothing at all)"}`
    );
  }
  let obj: any;
  try {
    obj = JSON.parse(s.slice(first, last + 1));
  } catch {
    throw new Error(
      `The analysis reply wasn't JSON. It said: ${raw.trim().slice(0, 220) || "(nothing at all)"}`
    );
  }

  const arr = (v: any) => (Array.isArray(v) ? v : []);
  const presence = (v: any): LethalityFactor["present"] =>
    v === "yes" || v === "possible" ? v : "not in this record";

  return {
    headline: clip(obj.headline, 2000),
    trajectory: clip(obj.trajectory, 4000),
    clusters: arr(obj.clusters)
      .map((c: any) => ({
        period: clip(c?.period, 120),
        trigger: clip(c?.trigger, 300),
        what: clip(c?.what, 1200),
      }))
      .filter((c: CaseCluster) => c.period || c.what),
    cycle: clip(obj.cycle, 3000),
    lethality: arr(obj.lethality)
      .map((l: any) => ({
        factor: clip(l?.factor, 120),
        present: presence(l?.present),
        evidence: clip(l?.evidence, 800),
        date: clip(l?.date, 20),
      }))
      .filter((l: LethalityFactor) => l.factor),
    corroboration: arr(obj.corroboration)
      .map((c: any) => ({
        kind: c?.kind === "record" ? ("record" as const) : ("witness" as const),
        who: clip(c?.who, 200),
        what: clip(c?.what, 800),
        date: clip(c?.date, 20),
        howToGetIt: clip(c?.howToGetIt, 400),
      }))
      .filter((c: Corroboration) => c.who || c.what),
    contradictions: arr(obj.contradictions)
      .map((c: any) => ({
        hisWords: clip(c?.hisWords, 800),
        date: clip(c?.date, 20),
        contradicts: clip(c?.contradicts, 500),
        whyItMatters: clip(c?.whyItMatters, 500),
      }))
      .filter((c: Contradiction) => c.hisWords),
    gaps: arr(obj.gaps).map((g: any) => clip(g, 500)).filter(Boolean),
  };
}

/** How many of the lethality factors came back present — the number that matters most. */
export const lethalityCount = (a: CaseAnalysis) =>
  a.lethality.filter((l) => l.present === "yes").length;

/** A plain-text version for her attorney packet and for Documents. */
export function analysisAsText(a: CaseAnalysis): string {
  const out: string[] = [];
  if (a.headline) out.push(a.headline, "");
  if (a.trajectory) out.push("HOW IT CHANGED OVER TIME", a.trajectory, "");
  if (a.clusters.length) {
    out.push("WHEN IT GOT WORSE, AND WHAT WAS HAPPENING");
    for (const c of a.clusters) out.push(`- ${c.period} — ${c.trigger}\n  ${c.what}`);
    out.push("");
  }
  if (a.cycle) out.push("THE PATTERN IT REPEATS", a.cycle, "");
  const present = a.lethality.filter((l) => l.present !== "not in this record");
  if (present.length) {
    out.push("DANGER INDICATORS FOUND IN THIS RECORD");
    for (const l of present) {
      out.push(
        `- ${l.factor} (${l.present})${l.date ? ` — ${l.date}` : ""}${l.evidence ? `\n  "${l.evidence}"` : ""}`
      );
    }
    out.push("");
  }
  if (a.contradictions.length) {
    out.push("HIS OWN WORDS THAT UNDERCUT HIM");
    for (const c of a.contradictions) {
      out.push(`- ${c.date || "date not stated"} — "${c.hisWords}"\n  Contradicts: ${c.contradicts}\n  ${c.whyItMatters}`);
    }
    out.push("");
  }
  if (a.corroboration.length) {
    out.push("PROOF THAT DOES NOT DEPEND ON HER WORD");
    for (const c of a.corroboration) {
      out.push(`- [${c.kind}] ${c.who}${c.date ? ` (${c.date})` : ""} — ${c.what}\n  ${c.howToGetIt}`);
    }
    out.push("");
  }
  if (a.gaps.length) {
    out.push("WHAT IS MISSING");
    for (const g of a.gaps) out.push(`- ${g}`);
  }
  return out.join("\n");
}
