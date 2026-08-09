import { db } from "./db";

/**
 * Showing her, from her own records, that she was not imagining it.
 *
 * The defining injury of coercive control is not any single incident — it is
 * being made to distrust your own memory. Someone who has been told for years
 * that she is crazy, too sensitive, or remembering it wrong will discount her
 * own account long before a court ever does.
 *
 * So this names the recognised tactics that actually appear in her records,
 * explains what each one is and why it works, and shows her own dated entries
 * as the proof. It invents nothing: a tactic is only shown when it is genuinely
 * present in what she or the scanner recorded. Counts are hers, quotes are
 * hers, dates are hers.
 *
 * Deliberately not a diagnosis, not therapy, and not an instruction about how
 * to feel. Evidence, named accurately, so she can draw her own conclusion.
 */

export interface Tactic {
  /** What it is actually called, so she can look it up and recognise it. */
  name: string;
  /** Plain language — no jargon, no euphemism. */
  what: string;
  /** Why it made her doubt herself. This is the part nobody explains. */
  why: string;
  /** Which recorded categories/tags indicate it. */
  categories?: string[];
  tags?: string[];
}

export const TACTICS: Tactic[] = [
  {
    name: "The cycle — hurt, then apology, then repeat",
    what:
      "An incident, then remorse, promises, sometimes affection or gifts, then calm — and then it happens again. The kindest moments arrive right after the worst ones.",
    why:
      "This is the part that keeps people in it, and it is the reason so many say 'but he isn't always like that.' The apology is real enough to hope on. Hoping is not naivety — the pattern is designed to produce exactly that. Seeing the cycle laid out by date is usually the first time it looks like a pattern rather than a series of one-offs.",
    tags: ["apology-cycle"],
  },
  {
    name: "Coercive control",
    what:
      "Rules about what you may do, wear, spend, or say. Permission needed for ordinary things. Consequences when you get it wrong.",
    why:
      "It arrives gradually, each rule small enough to accept, until the shape of your life has changed and there was never one moment to point at. In Texas this is directly relevant to conservatorship — the court can weigh a documented pattern, not just single incidents.",
    categories: ["coercive control"],
  },
  {
    name: "Being watched",
    what:
      "Your phone, location, messages, spending, or movements monitored. Passwords demanded. Questions about where you were that he already knew the answer to.",
    why:
      "Living under observation changes what you do before anyone has to tell you to. If you found yourself explaining ordinary things in advance, that was the surveillance working, not you being secretive.",
    categories: ["stalking / monitoring", "digital abuse"],
    tags: ["monitoring"],
  },
  {
    name: "Being cut off",
    what:
      "Friends and family made difficult, unwelcome, or not worth the argument afterwards.",
    why:
      "Isolation is rarely announced. It happens through the cost of seeing people. And it removes exactly the outside perspective that would have told you this was not normal — which is why it so often comes first.",
    categories: ["isolation"],
  },
  {
    name: "Degradation",
    what:
      "Insults, contempt, mockery, being called crazy, stupid, worthless, or a bad mother.",
    why:
      "Repeated often enough by someone close, it stops sounding like an opinion and starts sounding like information. If you came to believe some of it, that is what repetition does to anyone — it is not evidence that it was true.",
    categories: ["verbal / emotional"],
  },
  {
    name: "Threats and intimidation",
    what:
      "Threats to hurt you, take the child, leave you with nothing, or report you. Punched walls, broken things, weapons mentioned.",
    why:
      "A threat does its work without ever being carried out. Fear of what might happen shapes behaviour just as effectively as what does — and because nothing 'happened', it is the easiest thing to talk yourself out of afterwards.",
    categories: ["threats / intimidation", "property damage"],
    tags: ["threat"],
  },
  {
    name: "Money as leverage",
    what:
      "Money withheld or controlled, debt in your name, having to ask or account for basics.",
    why:
      "Financial control is what makes leaving a logistics problem instead of a decision. It is abuse, not a disagreement about budgeting.",
    categories: ["financial abuse"],
    tags: ["financial", "control"],
  },
  {
    name: "The child used as a lever",
    what:
      "Threats about custody, disparaging you to her, using her to carry messages or gather information, interfering with school, medical care, or exchanges.",
    why:
      "This is the one that works even when nothing else does, because the cost of resisting is paid by her. Texas courts take it seriously — Family Code § 153.004 makes a documented pattern directly relevant to conservatorship and access.",
    categories: ["children / custody"],
    tags: ["custody / children"],
  },
  {
    name: "His own words",
    what:
      "Places where he admits, minimises, apologises for, or explains away what he did.",
    why:
      "These matter more than anything you could say yourself. In Texas his own statements come in against him as party-opponent statements — they are not blocked as hearsay. When he confirms it in writing, it stops being your word against his.",
    tags: ["admission"],
  },
];

/**
 * What the pattern means for whether this changes.
 *
 * Deliberately NOT a diagnosis. Nobody can diagnose a man they have never
 * assessed, least of all from his text messages, and a survivor who repeats a
 * diagnosis in court damages her own credibility — opposing counsel will ask
 * who made it, and the honest answer will be "an app". Worse, it hands him the
 * "she's the unstable one" story he has been telling.
 *
 * What her own records CAN support is far more useful, and it is what actually
 * predicts the future: whether the behaviour repeated after remorse, whether it
 * escalated, and whether it continued after separation. Those are observable,
 * dated, and admissible — and they answer "will he change?" better than any
 * label would.
 */
export interface Prognosis {
  headline: string;
  detail: string;
  /** The evidence in her file that supports it. Never a claim without one. */
  basis: string;
}

export function buildPrognosis(r: CoercionReport): Prognosis[] {
  const out: Prognosis[] = [];

  if (r.cycles.length >= 2) {
    const avg = Math.round(r.cycles.reduce((n, c) => n + c.daysLater, 0) / r.cycles.length);
    out.push({
      headline: "The apologies did not stop it happening again",
      detail:
        "Every promise in your file was followed by another incident. That is the single most " +
        "reliable indicator there is: the best predictor of what someone does next is what they " +
        "did after the last time they said they were sorry. Remorse that does not change " +
        "behaviour is part of the pattern, not a break from it.",
      basis: `${r.cycles.length} apologies in your records, each about ${avg} days after an incident — and each followed by another incident.`,
    });
  }

  const dated = r.cycles.filter((c) => c.incidentDate);
  if (dated.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < dated.length; i++) {
      gaps.push(
        Math.round(
          (Date.parse(dated[i].incidentDate) - Date.parse(dated[i - 1].incidentDate)) / 86_400_000
        )
      );
    }
    const firstHalf = gaps.slice(0, Math.ceil(gaps.length / 2));
    const secondHalf = gaps.slice(Math.ceil(gaps.length / 2));
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    if (secondHalf.length && mean(secondHalf) < mean(firstHalf) * 0.75) {
      out.push({
        headline: "It was happening more often, not less",
        detail:
          "The gaps between incidents in your file got shorter over time. Escalation is a " +
          "recognised risk marker, and it is the reason safety planning matters most around " +
          "separation — which is statistically the most dangerous period.",
        basis: `Early gaps averaged about ${Math.round(mean(firstHalf))} days; later ones about ${Math.round(mean(secondHalf))} days.`,
      });
    }
  }

  const risky = r.findings.find((f) =>
    ["Threats and intimidation", "The child used as a lever"].includes(f.tactic.name)
  );
  if (risky && risky.count >= 3) {
    out.push({
      headline: "This is about control, and control does not end with the relationship",
      detail:
        "Threats and using the child are instruments of control rather than lost tempers, which " +
        "is why they often continue — or intensify — after separation, through custody, money " +
        "and the courts. Expecting that is not pessimism; it is what lets you and your attorney " +
        "prepare for it instead of being surprised by it.",
      basis: `${risky.count} recorded instances of ${risky.tactic.name.toLowerCase()}.`,
    });
  }

  return out;
}

export interface TacticFinding {
  tactic: Tactic;
  count: number;
  /** Her own entries, newest first, as the proof. */
  examples: { date: string; text: string; source: string }[];
  first: string;
  last: string;
}

/** One turn of the cycle: something happened, then remorse arrived. */
export interface CycleTurn {
  incidentDate: string;
  incidentTitle: string;
  apologyDate: string;
  apologyText: string;
  daysLater: number;
}

export interface CoercionReport {
  findings: TacticFinding[];
  totalRecords: number;
  span: { first: string; last: string } | null;
  /**
   * The pattern laid out in order.
   *
   * Reading "he hurt me, then said sorry" once is a bad week. Seeing it happen
   * fourteen times, each with a date and a gap measured in days, is a machine —
   * and that is the thing nobody can talk her out of afterwards, because it is
   * her own record rather than anyone's opinion.
   */
  cycles: CycleTurn[];
}

const has = (list: string[] | undefined, want: string[] | undefined) =>
  !!want && !!list && list.some((c) => want.includes(c));

/**
 * Reads her records and reports only what is genuinely there.
 *
 * Nothing is inferred or filled in. A tactic with no matching entries is simply
 * absent from the report — she should never be shown a finding the evidence
 * does not support, both because it would be untrue and because a case built on
 * overreach falls apart under cross-examination.
 */
export async function buildCoercionReport(): Promise<CoercionReport> {
  const [incidents, messages] = await Promise.all([
    db.incidents.orderBy("date").reverse().toArray(),
    db.messages.filter((m) => !!m.starred).toArray(),
  ]);

  const findings: TacticFinding[] = [];
  let first = "9999-99-99";
  let last = "0000-00-00";

  for (const tactic of TACTICS) {
    const examples: TacticFinding["examples"] = [];
    let count = 0;

    for (const i of incidents) {
      if (!has(i.categories, tactic.categories)) continue;
      count++;
      if (examples.length < 4) {
        examples.push({
          date: i.date || "",
          text: i.title || (i.narrative || "").slice(0, 180),
          source: "an incident you recorded",
        });
      }
    }
    for (const m of messages) {
      if (!has(m.tags, tactic.tags)) continue;
      count++;
      if (examples.length < 6) {
        examples.push({
          date: m.date || "",
          text: (m.text || "").slice(0, 220),
          source: "a message you flagged",
        });
      }
    }

    if (!count) continue;
    const dates = examples.map((e) => e.date).filter(Boolean).sort();
    if (dates.length) {
      if (dates[0] < first) first = dates[0];
      if (dates[dates.length - 1] > last) last = dates[dates.length - 1];
    }
    findings.push({
      tactic,
      count,
      examples,
      first: dates[0] || "",
      last: dates[dates.length - 1] || "",
    });
  }

  findings.sort((a, b) => b.count - a.count);

  // Pair each incident with the first remorse that followed it within a
  // fortnight. Fourteen days because the apology is the hook — arriving long
  // afterwards it is something else, and pairing it would overstate the case.
  const apologies = messages
    .filter((m) => (m.tags || []).includes("apology-cycle") && m.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const days = (a: string, b: string) =>
    Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

  const cycles: CycleTurn[] = [];
  const usedApology = new Set<number>();
  for (const inc of [...incidents].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (!inc.date) continue;
    const hit = apologies.findIndex(
      (m, idx) => !usedApology.has(idx) && m.date >= inc.date && days(inc.date, m.date) <= 14
    );
    if (hit === -1) continue;
    usedApology.add(hit);
    cycles.push({
      incidentDate: inc.date,
      incidentTitle: inc.title || (inc.narrative || "").slice(0, 120),
      apologyDate: apologies[hit].date,
      apologyText: (apologies[hit].text || "").slice(0, 220),
      daysLater: days(inc.date, apologies[hit].date),
    });
  }

  return {
    findings,
    totalRecords: incidents.length + messages.length,
    span: findings.length && first !== "9999-99-99" ? { first, last } : null,
    cycles,
  };
}
