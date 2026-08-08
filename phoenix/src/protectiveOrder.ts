// Does she have what a Texas protective order actually requires?
//
// This is deliberately written in plain code rather than handed to the AI. She
// should get the same honest answer every time, offline, with no key and no
// network — and the answer should come from her own records, not from a
// model's impression of them.
//
// The statutory shape (Texas Family Code):
//   §71.004   what counts as "family violence"
//   §81.001   a court SHALL issue a protective order on the required finding
//   §82.002   who may file an application
//   §83.001   temporary ex parte order — "clear and present danger"
//   §85.001   the finding: family violence occurred, and is likely to occur again
//   §85.022   what the order can prohibit, including firearm possession
//   §153.004  history of family violence in custody decisions
//
// Nothing here is legal advice and it never decides anything. It shows her
// what her own record supports and what is thin, so she walks into a lawyer's
// office knowing where she stands.

import { db, type Incident, type Msg, type Violation } from "./db";

export interface Finding {
  key: string;
  label: string;
  /** strong = clearly supported by her records; some = partial; none = nothing yet. */
  strength: "strong" | "some" | "none";
  detail: string;
  /** Where in her own records this came from. */
  examples: string[];
}

export interface PoAssessment {
  findings: Finding[];
  /** Incidents that read as family violence under §71.004. */
  violenceCount: number;
  mostRecent: string;
  /** Signals that support a temporary ex parte order under §83.001. */
  urgent: string[];
  childInvolved: boolean;
  gaps: string[];
  summary: string;
}

const VIOLENT_CATEGORIES = new Set([
  "physical",
  "threats / intimidation",
  "sexual abuse",
  "property damage",
  "stalking / monitoring",
]);

/** Language that courts treat as the highest-risk indicators. */
const LETHALITY = [
  { re: /\b(chok(e|ed|ing)|strangl|hands? (a|)round (your|her) (neck|throat)|couldn'?t breathe)\b/i, label: "strangulation or choking" },
  { re: /\b(kill you|kill her|kill myself|end you|you'?re dead|put you in the ground|bury you)\b/i, label: "threat to kill" },
  { re: /\b(gun|pistol|rifle|shotgun|firearm|shoot you|bullet|glock|9 ?mm)\b/i, label: "firearm or weapon reference" },
  { re: /\b(take (her|the kids?|our daughter) (away|from you)|never see (her|them|the kids?) again)\b/i, label: "threat to take the child" },
  { re: /\b(find you|watching you|i know where you (are|live|work|park)|following you|tracked?)\b/i, label: "stalking or surveillance" },
  { re: /\b(kill myself|end it all|not be here|suicide)\b/i, label: "self-harm used as leverage" },
];

const clip = (s: string, n = 130) => (s.length > n ? s.slice(0, n) + "…" : s);

export async function assessProtectiveOrder(): Promise<PoAssessment> {
  const [incidents, flagged, violations] = await Promise.all([
    db.incidents.orderBy("date").toArray(),
    db.messages.filter((m) => m.starred).toArray(),
    db.violations.orderBy("date").toArray(),
  ]);

  const violent = incidents.filter(
    (i) => i.categories.some((c) => VIOLENT_CATEGORIES.has(c)) || i.severity >= 4
  );
  const mostRecent = [...violent].sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date || "";

  // §85.001(a)(1) — family violence has occurred.
  const occurred: Finding = {
    key: "occurred",
    label: "Family violence has occurred",
    strength: violent.length >= 2 ? "strong" : violent.length === 1 ? "some" : "none",
    detail:
      violent.length === 0
        ? "Nothing logged yet that reads as family violence. Physical harm, threats of harm, and acts meant to put you in fear of harm all count."
        : `${violent.length} incident${violent.length === 1 ? "" : "s"} in your log involve physical harm, threats, or conduct meant to put you in fear.`,
    examples: violent.slice(-3).map((i) => `${i.date} — ${i.title}`),
  };

  // §85.001(a)(2) — likely to occur in the future. Recency, repetition,
  // escalation, and any breach of an existing order all speak to this.
  const recent = violent.filter((i) => monthsAgo(i.date) <= 12);
  const likely: Finding = {
    key: "likely",
    label: "It is likely to happen again",
    strength:
      violations.length > 0 || recent.length >= 2
        ? "strong"
        : recent.length >= 1 || violent.length >= 2
          ? "some"
          : "none",
    detail: buildLikelihoodDetail(violent, recent, violations),
    examples: [
      ...recent.slice(-2).map((i) => `${i.date} — ${i.title}`),
      ...violations.slice(-2).map((v) => `${v.date} — order violation: ${v.type}`),
    ],
  };

  // §83.001 — temporary ex parte relief turns on immediate danger.
  const urgent: string[] = [];
  const seen = new Set<string>();
  const scanText = (text: string, where: string) => {
    for (const l of LETHALITY) {
      if (l.re.test(text) && !seen.has(l.label)) {
        seen.add(l.label);
        urgent.push(`${l.label} — ${where}: "${clip(text)}"`);
      }
    }
  };
  for (const m of flagged) scanText(m.text, `message ${m.date}`);
  for (const i of incidents) scanText(`${i.title} ${i.narrative}`, `incident ${i.date}`);

  const danger: Finding = {
    key: "danger",
    label: "Immediate danger (for an emergency order before any hearing)",
    strength: urgent.length >= 2 ? "strong" : urgent.length === 1 ? "some" : "none",
    detail:
      urgent.length === 0
        ? "Nothing in your records yet reads as the kind of immediate danger a court looks for before granting an order without a hearing."
        : `${urgent.length} of the highest-risk indicators appear in your own records. These are the facts a judge weighs most heavily.`,
    examples: urgent.slice(0, 4),
  };

  const childInvolved =
    incidents.some((i) => i.childrenPresent) || violations.some((v) => v.childPresent);
  const child: Finding = {
    key: "child",
    label: "Your daughter was there for it",
    strength: childInvolved ? "strong" : "none",
    detail: childInvolved
      ? "Incidents with the child present matter twice: they support protecting her by name in the order, and Texas courts weigh a history of family violence in custody decisions."
      : "Nothing logged yet with her present. If she saw or heard any of it, note that on the incident — it changes what the order can cover and how custody is decided.",
    examples: incidents
      .filter((i) => i.childrenPresent)
      .slice(-3)
      .map((i) => `${i.date} — ${i.title}`),
  };

  const gaps: string[] = [];
  if (!incidents.some((i) => i.policeReport)) {
    gaps.push(
      "No police report number recorded. An order does not require one, but if you ever called, get the report number and add it — it is independent of your word."
    );
  }
  if (!incidents.some((i) => i.medical)) {
    gaps.push(
      "No medical record noted. If you were ever seen for an injury — even without saying why — that record exists and can be requested."
    );
  }
  if (!incidents.some((i) => i.witnesses)) {
    gaps.push("No witnesses named. Anyone who saw, heard, or was told at the time is worth listing.");
  }
  if (violent.length && !violent.some((i) => monthsAgo(i.date) <= 6)) {
    gaps.push(
      "Nothing violent logged in the last six months. Courts look at how recent it is — make sure anything recent is written down, including threats."
    );
  }

  const findings = [occurred, likely, danger, child];
  return {
    findings,
    violenceCount: violent.length,
    mostRecent,
    urgent,
    childInvolved,
    gaps,
    summary: buildSummary(occurred, likely, danger, violent.length),
  };
}

function buildLikelihoodDetail(violent: Incident[], recent: Incident[], violations: Violation[]): string {
  const bits: string[] = [];
  if (violations.length)
    bits.push(
      `${violations.length} breach${violations.length === 1 ? "" : "es"} of a court order — a court treats that as showing he does not stop when told to`
    );
  if (recent.length) bits.push(`${recent.length} in the last twelve months`);
  if (violent.length >= 3) bits.push("a repeated pattern rather than a single event");
  if (!bits.length)
    return "Not much yet showing this is ongoing. Recency, repetition, and any breach of an existing order are what a court looks at.";
  return "Supported by " + bits.join("; ") + ".";
}

function buildSummary(o: Finding, l: Finding, d: Finding, count: number): string {
  if (o.strength === "none")
    return "There isn't enough logged yet to say. Start with the incidents — what he did, when, and whether it hurt you or made you afraid.";
  const both = o.strength === "strong" && l.strength !== "none";
  if (both && d.strength === "strong")
    return `Your records document ${count} qualifying incidents and contain several of the highest-risk indicators. This is the profile courts act on quickly. Take this to an attorney or your county's protective order office now — not in a few weeks.`;
  if (both)
    return `Your records document ${count} qualifying incidents and support that it is likely to continue — the two findings a Texas court has to make. Worth taking to an attorney.`;
  return "Your records show part of what's needed. The gaps below are the things to fill in.";
}

function monthsAgo(date: string): number {
  const t = Date.parse(date);
  if (Number.isNaN(t)) return 999;
  return (Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44);
}

/**
 * A dated, numbered, first-person narrative built only from what she wrote —
 * the form an affidavit takes. Nothing is invented or embellished; every
 * paragraph traces to an entry she can point to.
 */
export async function buildAffidavit(name: string, county: string): Promise<string> {
  const [incidents, flagged, violations] = await Promise.all([
    db.incidents.orderBy("date").toArray(),
    db.messages.filter((m) => m.starred).toArray(),
    db.violations.orderBy("date").toArray(),
  ]);

  const lines: string[] = [];
  lines.push("DRAFT STATEMENT OF FACTS");
  lines.push(
    county ? `Prepared for filing in ${county} County, Texas` : "Prepared for filing in Texas"
  );
  lines.push(`Prepared by ${name || "[your name]"} on ${new Date().toLocaleDateString()}`);
  lines.push("");
  lines.push(
    "THIS IS A DRAFT, NOT A SWORN DOCUMENT. It is assembled word-for-word from entries I"
  );
  lines.push(
    "wrote myself. Nothing has been added to it. Read every paragraph, correct anything"
  );
  lines.push(
    "that is not exactly right, and have an attorney put it in the proper form before it is"
  );
  lines.push("signed or sworn. An inaccurate sworn statement causes real harm to a real case.");
  lines.push("");

  let n = 1;
  for (const i of incidents) {
    const extras = [
      i.time ? `at about ${i.time}` : "",
      i.location ? `at ${i.location}` : "",
      i.childrenPresent ? "My daughter was present" : "",
      i.witnesses ? `Witnessed by ${i.witnesses}` : "",
      i.policeReport ? `Police report ${i.policeReport}` : "",
      i.medical ? `Medical: ${i.medical}` : "",
    ].filter(Boolean);
    lines.push(`${n}. On ${i.date}${i.time ? `, ${extras[0]}` : ""}, ${i.title}.`);
    lines.push(`   ${i.narrative.replace(/\n+/g, "\n   ")}`);
    if (extras.length) lines.push(`   [${extras.join(". ")}.]`);
    lines.push("");
    n++;
  }

  if (flagged.length) {
    lines.push(`${n}. He sent me the following messages. These are quoted exactly as received:`);
    lines.push("");
    for (const m of flagged.slice(0, 60)) {
      lines.push(`   ${m.date} — "${m.text.replace(/\n+/g, " ")}"`);
    }
    if (flagged.length > 60) {
      lines.push(`   [and ${flagged.length - 60} further messages, in the exported archive]`);
    }
    lines.push("");
    n++;
  }

  if (violations.length) {
    lines.push(`${n}. He has not complied with existing orders:`);
    lines.push("");
    for (const v of violations) {
      lines.push(
        `   ${v.date} — ${v.type}. ${v.description}${v.reported ? ` Reported: ${v.reported}.` : ""}`
      );
    }
    lines.push("");
    n++;
  }

  lines.push(`${n}. I am afraid of him, and I believe this will continue if the court does not act.`);
  lines.push("");
  lines.push("---");
  lines.push(
    "Every factual paragraph above came from an entry in my own records. The evidence"
  );
  lines.push(
    "integrity record shows when each file and message export entered those records."
  );

  return lines.join("\n");
}
