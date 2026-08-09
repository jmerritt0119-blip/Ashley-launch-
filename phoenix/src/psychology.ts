import type { CoercionReport } from "./coercion";

/**
 * The psychologist half of the app.
 *
 * She asked the question every survivor asks eventually: what is wrong with
 * him, and will he ever change. She deserves a real answer rather than a
 * shrug — but the answer has to be built so it helps her in a Texas
 * courtroom instead of costing her the case.
 *
 * The line this module holds:
 *
 *   - It names the DRIVERS behind the behaviour, using the terms the research
 *     actually uses, because those names are what let her stop searching for
 *     the thing she did to cause it.
 *   - It does NOT diagnose him. Nobody can diagnose a man they have never
 *     assessed, and a survivor who says "he is a narcissist" on the stand has
 *     handed opposing counsel a free cross-examination and handed him the
 *     "she's the unstable one" story he has been telling for years.
 *   - Every pattern shown is one her own records support, and every one comes
 *     with the observable behaviour underneath it, because the behaviour is
 *     the admissible part.
 *
 * The distinction matters enormously and is easy to miss: understanding him is
 * for her. Describing what he did is for the court. This module gives her both
 * and is explicit about which is which.
 */

export interface BehaviourPattern {
  /** What the research calls the driver. */
  name: string;
  /** The clinical or academic terms, so she can look it up and read further. */
  alsoCalled: string;
  /** What it looks like from inside the relationship. */
  what: string;
  /** Why it isn't a temper problem, a stress problem, or anything she caused. */
  why: string;
  /** The honest prognosis for this specific driver. */
  outlook: string;
  /** Incident categories that indicate it. */
  categories?: string[];
  /** Message tags that indicate it. */
  tags?: string[];
  /** Show even with no matching records — some of these are near-universal. */
  always?: boolean;
}

export const PATTERNS: BehaviourPattern[] = [
  {
    name: "He believes he is entitled to it",
    alsoCalled: "entitlement; the core finding of Lundy Bancroft's work on abusive men",
    what:
      "Underneath the incidents is a belief that he is owed something — obedience, service, sex, the last word, the benefit of the doubt — and that you are in the wrong when he does not get it. It is why the punishment always felt disproportionate to whatever set it off.",
    why:
      "This is the single most important thing to understand, because it explains why nothing you tried worked. You were treating it as a communication problem, or an anger problem, or a stress problem, and adjusting yourself accordingly. It was never any of those. It was a belief about who is entitled to what, and no amount of walking on eggshells can argue with a belief.",
    outlook:
      "Entitlement is a value, not a symptom. Anger management does not touch it — a man can complete the whole course and come out calmer and just as certain he is owed. That is why programmes aimed at anger have such poor results with abuse: they are treating the wrong thing.",
    categories: ["coercive control", "verbal / emotional", "sexual abuse"],
  },
  {
    name: "Control was the goal, not the side effect",
    alsoCalled: "coercive control (Evan Stark); instrumental rather than reactive aggression",
    what:
      "Rules, monitoring, permission, money, who you see, what you wear, where you are. Not outbursts he regretted — a system, maintained, with consequences when it slipped.",
    why:
      "If it were a temper problem it would be indiscriminate. It is not: he almost certainly held it together at work, in front of his family, and in front of anyone who could cost him something. Being able to control it in those rooms and not in yours is the whole answer. It was never that he could not stop. It was that with you, he did not have to.",
    outlook:
      "Because control is the objective rather than a symptom, leaving does not end it — it removes some of the tools. What remains is the child, the money and the courts, and that is exactly where it tends to go next. Expecting that is not pessimism; it is what lets you and your attorney be ready instead of blindsided.",
    categories: ["coercive control", "stalking / monitoring", "isolation", "digital abuse"],
    tags: ["control", "monitoring"],
  },
  {
    name: "The two faces — and why nobody believed you",
    alsoCalled: "impression management; the public self",
    what:
      "Charming, funny, generous, reasonable — to everyone else. Friends and family who like him. The version of him you tried to describe to people and could not make sound real.",
    why:
      "The gap between the two is not a coincidence, and it is not evidence that you exaggerated. It is deliberate, and it is protective: the public face is what makes you unbelievable if you ever speak. If you have ever thought 'nobody will believe me', that feeling was manufactured, and it was manufactured on purpose.",
    outlook:
      "From his side, nothing here needs fixing — the public self is working exactly as intended. Expect it in court too: he will present well. Judges have seen it before. It is why the dated, written record in this app matters more than how either of you comes across on the day.",
    always: true,
  },
  {
    name: "When you fought back, he made that the story",
    alsoCalled: "DARVO — Deny, Attack, Reverse Victim and Offender (Jennifer Freyd); reactive abuse",
    what:
      "You finally shouted, swore, threw something, blocked a door, hit back. And that became the incident. Possibly it was recorded, or reported, or repeated to people. Now there is a version where you are the abusive one.",
    why:
      "This is a named, documented tactic, not something unique to you — and it is the most effective one there is, because it recruits your own conscience against you. You know you did the thing. What gets erased is the years of pressure that produced ten seconds of it. Reacting after long-term abuse is not the same as perpetrating abuse, and the difference is the pattern of power over time, not who raised their voice on one day.",
    outlook:
      "Expect this in the divorce, because it works. The counter is not denying you ever lost your temper — that reads as dishonest and is easily disproved. It is the dated record showing the direction the pressure ran, for years, which is precisely what your file is.",
    always: true,
  },
  {
    name: "The hope was engineered",
    alsoCalled: "intermittent reinforcement; trauma bonding",
    what:
      "The apologies, the good weeks, the version of him you fell in love with reappearing right when you were closest to leaving.",
    why:
      "Unpredictable reward is the most powerful conditioning schedule known to behavioural science — stronger than consistent kindness, by a wide margin. It is the mechanism behind slot machines, and it produces the strongest attachment and the hardest habit to break. So when people ask why you stayed, the honest answer is that you were subjected to the most effective attachment mechanism that exists. Staying was not weakness or poor judgement. It was the predicted result.",
    outlook:
      "The good periods are part of the pattern, not interruptions of it. That is why 'but he has been better lately' is not evidence of change — in the records of people in your position, the better period is a phase, and it has usually happened several times already.",
    tags: ["apology-cycle"],
  },
  {
    name: "Empathy that switches off exactly where it would cost him",
    alsoCalled: "selective empathy; antagonistic traits",
    what:
      "He can read a room. He knows precisely which words will land hardest on you, which means he understands your feelings well enough to aim at them.",
    why:
      "That rules out the comforting explanation — that he simply does not understand the effect he has. Someone who cannot read people does not find the one sentence that destroys you. The empathy is present and switched off where it is inconvenient, which is a choice rather than a deficit.",
    outlook:
      "A genuine deficit might improve with insight and effort. A selective one has nothing to improve — it is already doing its job. This is the part that most reliably does not change.",
    categories: ["verbal / emotional", "threats / intimidation"],
  },
  {
    name: "Your daughter as an instrument",
    alsoCalled: "using the children as a weapon; post-separation abuse",
    what:
      "Threats about custody, running you down to her, using her to carry messages or gather information, interfering with school, doctors or handovers.",
    why:
      "This is the clearest evidence that it is about control rather than lost temper, because it requires planning, and it requires being willing to spend her wellbeing to get at you. A man overwhelmed by rage does not do this. A man who wants leverage does.",
    outlook:
      "This is the channel that survives separation, which is why it usually intensifies once the others close. Texas Family Code § 153.004 makes a documented pattern of this directly relevant to conservatorship and access — so every instance recorded here is doing double duty: it explains what is happening to you, and it is admissible.",
    categories: ["children / custody"],
    tags: ["custody / children"],
  },
  {
    name: "He told you what you were",
    alsoCalled: "gaslighting; degradation; identity erosion",
    what:
      "Crazy. Too sensitive. Remembering it wrong. Making it up. A bad mother. Lucky anyone puts up with you.",
    why:
      "Repeated for years by the person closest to you, it stops registering as an opinion and starts registering as information. If you came to believe parts of it, that is what repetition does to any human being — it is a documented effect and it says nothing whatsoever about whether it was true. It also has a purpose: someone who distrusts her own memory does not call a lawyer, and does not call the police, because she is not sure enough of what happened.",
    outlook:
      "This is the injury that outlasts the relationship, and it is the reason this app writes everything down with dates. On the days you doubt yourself, the file does not.",
    categories: ["verbal / emotional"],
  },
];

export interface MatchedPattern extends BehaviourPattern {
  /** How many of her records support it. 0 for the always-shown ones. */
  count: number;
}

/**
 * Matches her records against the drivers above.
 *
 * A pattern appears only when her file supports it, or when it is marked
 * `always` because it is near-universal in these cases and she needs it named
 * whether or not the scanner happened to tag it.
 */
export function buildProfile(r: CoercionReport): MatchedPattern[] {
  const counts = new Map<string, number>();
  for (const f of r.findings) {
    for (const c of f.tactic.categories || []) counts.set(c, (counts.get(c) || 0) + f.count);
    for (const t of f.tactic.tags || []) counts.set(t, (counts.get(t) || 0) + f.count);
  }

  const out: MatchedPattern[] = [];
  for (const p of PATTERNS) {
    let count = 0;
    for (const c of p.categories || []) count += counts.get(c) || 0;
    for (const t of p.tags || []) count += counts.get(t) || 0;
    if (p.name === "The hope was engineered") count = Math.max(count, r.cycles.length);
    if (count > 0 || p.always) out.push({ ...p, count });
  }
  // Strongest evidence first, but keep the always-shown ones in the mix rather
  // than stranded at the bottom — DARVO in particular is the one she may need
  // most and would never think to scroll for.
  return out.sort((a, b) => (b.count || 1) - (a.count || 1));
}

/**
 * "Will he change?"
 *
 * Written to be true rather than comforting, because false hope here is
 * measured in years of her life, and because she will test anything this app
 * tells her against what she has already lived.
 */
export const CHANGE_ANSWER = {
  headline: "Almost certainly not — and here is what that is based on",
  points: [
    {
      claim: "Programmes for abusive men do not work well, and the courts know it.",
      detail:
        "Batterer intervention programmes have been studied for decades. Reviews of that research repeatedly find small to negligible effects on whether men reoffend. Court-ordered attendance is not treatment — it is attendance, and it is often used afterwards as evidence of effort rather than change.",
    },
    {
      claim: "The best predictor of what he does next is what he did after the last apology.",
      detail:
        "Not what he says, not what he intends, not how sincere he seems. Past behaviour after remorse is the most reliable predictor available, and your own file already contains that answer — you do not have to take anyone's word for it.",
    },
    {
      claim: "Real change looks nothing like what you have been shown.",
      detail:
        "On the rare occasions it happens it involves him accepting full responsibility with no qualifier — no 'but you', no 'we both', no 'I was stressed' — sustained for years, with no expectation of reward, and visible in what he does when there is nothing to gain. It does not arrive in a week, and it never arrives because he is about to lose you.",
    },
    {
      claim: "None of these mean he is changing.",
      detail:
        "Crying. Apologising, however convincingly. Going to church. Starting therapy. Stopping drinking. A new job. A good month. A promise made in front of your family. Losing you and being devastated. Every one of these appears in the histories of men who continued exactly as before — which is why 'he seems different' is not something to make a decision on.",
    },
    {
      claim: "The most dangerous period is the one around leaving.",
      detail:
        "This is consistently found in the research and it is the reason safety planning matters most right now, not later. It is not a reason to stay — staying carries its own risk, and it is cumulative. It is a reason to leave with a plan, a lawyer and people who know.",
    },
  ],
};

/**
 * The line she must not cross in court, and why.
 *
 * This is the attorney half correcting the psychologist half, and it belongs
 * directly under the psychology — because the moment she has language for what
 * he is, the instinct is to use it in a filing, and that instinct will hurt her.
 */
export const COURT_LINE = {
  cannot: [
    "He is a narcissist / sociopath / psychopath / bipolar.",
    "He has a personality disorder.",
    "He is mentally ill.",
  ],
  can: [
    "On 3 March he said he would make sure I never saw her again. Here is the message.",
    "He checked my location eleven times in one day. Here are the records.",
    "The gaps between incidents got shorter over the last year. Here are the dates.",
    "He apologised after each one and it happened again. Here are both.",
  ],
  why:
    "A diagnosis from someone who is not a clinician and has never assessed him is inadmissible, and worse than useless — opposing counsel will ask who made it, the honest answer will not hold, and it feeds the exact story he has been telling about you being the unstable one. Behaviour with dates cannot be attacked that way. If a clinical opinion would genuinely help your case, that is your attorney's call and it comes from an expert they retain, not from you and not from an app.",
};
