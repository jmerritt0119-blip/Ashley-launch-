// "What should I do next?"
//
// She is exhausted and the app has sixteen tabs. This computes a short,
// ordered list from her own records — safety first, then the things that are
// hardest to recover if left, then the things that strengthen the case.
//
// Plain code on purpose: it must give the same answer every time, work with no
// network and no API key, and never invent a reason to worry her.

import { db } from "./db";

export interface Step {
  title: string;
  why: string;
  view: string;
  /** 0 = safety, 1 = don't lose it, 2 = strengthen the case, 3 = housekeeping */
  tier: 0 | 1 | 2 | 3;
}

export async function computeNextSteps(opts: {
  vaultOn: boolean;
  persisted: boolean;
  installed: boolean;
  isIos: boolean;
  hisNames: string;
}): Promise<Step[]> {
  const [incidents, msgCount, starred, evidence, violations, journal, dates, docs] =
    await Promise.all([
      db.incidents.count(),
      db.messages.count(),
      db.messages.filter((m) => m.starred).count(),
      db.evidence.count(),
      db.violations.count(),
      db.journal.count(),
      db.dates.toArray(),
      db.documents.count(),
    ]);

  const steps: Step[] = [];
  const hasAnything = incidents + msgCount + evidence + journal > 0;

  // --- tier 0: safety and the clock ---
  const upcoming = dates
    .filter((d) => daysUntil(d.date) >= 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (upcoming) {
    const days = daysUntil(upcoming.date);
    if (days <= 14) {
      steps.push({
        title: `${upcoming.title} ${days <= 0 ? "is today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
        why: "Print the packet and go through it before you walk in. Nothing you need should be on a phone you're holding.",
        view: "packet",
        tier: 0,
      });
    }
  }
  if (incidents > 0) {
    steps.push({
      title: "See what your record supports for a protective order",
      why: "Texas courts have to make two specific findings. This checks your own entries against both — offline, in seconds.",
      view: "protective",
      tier: 0,
    });
  }

  // --- tier 1: things that are hard or impossible to get back ---
  if (hasAnything && !opts.vaultOn) {
    steps.push({
      title: "Turn on the encrypted vault",
      why: "Everything lives on this device. If the phone is lost, broken, or taken, the vault is the only thing that brings your case back.",
      view: "settings",
      tier: 1,
    });
  }
  if (opts.isIos && !opts.installed) {
    steps.push({
      title: "Add this to your Home Screen",
      why: "Safari erases a website's saved data after 7 days of not opening it. Once it's installed, that rule no longer applies to you.",
      view: "dashboard",
      tier: 1,
    });
  } else if (!opts.persisted) {
    steps.push({
      title: "Turn on permanent storage",
      why: "It stops the browser clearing your case to free up space. One tap.",
      view: "dashboard",
      tier: 1,
    });
  }

  // --- tier 2: make the case harder to argue with ---
  if (msgCount > 0 && !opts.hisNames.trim()) {
    steps.push({
      title: "Say which name in the messages is him",
      why: `You have ${msgCount.toLocaleString()} messages. Until the app knows which side is his, it can't tell his words from yours — and his words are the ones that count.`,
      view: "scan",
      tier: 2,
    });
  }
  if (msgCount > 0 && starred === 0) {
    steps.push({
      title: "Run the deep scan over your messages",
      why: "It reads every one and pulls out the threats, the admissions, and the money — so you don't have to find them yourself.",
      view: "scan",
      tier: 2,
    });
  }
  if (incidents === 0 && msgCount > 0) {
    steps.push({
      title: "Write down what actually happened",
      why: "Messages show what he said. Incidents show what he did — and that's what a protective order and a custody decision turn on.",
      view: "incidents",
      tier: 2,
    });
  }
  if (journal === 0) {
    steps.push({
      title: "Bring in your journal",
      why: "What you wrote at the time carries weight a later account can't. If you keep one anywhere, paste it in.",
      view: "journal",
      tier: 2,
    });
  }
  if (incidents > 0 && evidence === 0) {
    steps.push({
      title: "Add the photos and documents",
      why: "Anything that doesn't depend on your word alone — injury photos, damage, medical or police paperwork — is the hardest kind of evidence to argue with.",
      view: "evidence",
      tier: 2,
    });
  }

  // --- tier 3: keeping it usable ---
  if (hasAnything && docs === 0 && violations === 0) {
    steps.push({
      title: "Build the attorney packet",
      why: "One file with everything in it, ready to hand over. Worth doing once now so it's not a scramble later.",
      view: "packet",
      tier: 3,
    });
  }

  if (!hasAnything) {
    return [
      {
        title: "Start with your messages",
        why: "Upload the whole export — every message is saved exactly as it is, then the AI reads them for you.",
        view: "scan",
        tier: 2,
      },
    ];
  }

  steps.sort((a, b) => a.tier - b.tier);
  return steps.slice(0, 4);
}

/**
 * Whole calendar days from today. Counting elapsed hours instead would tell
 * her a hearing three days away is "in 2 days" — not a mistake to make about
 * a court date.
 */
function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00`).getTime();
  if (Number.isNaN(target)) return -1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86400000);
}
