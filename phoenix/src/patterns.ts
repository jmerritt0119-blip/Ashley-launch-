// What 27,000 messages look like from above.
//
// A single cruel text is an incident. Forty texts between 1am and 4am is a
// pattern — and a pattern is what proves coercive control, harassment, and
// escalation. She is never going to see it by scrolling, and no one should ask
// her to try.
//
// Every number here is counted from her own records in plain code. Nothing is
// estimated, nothing is sent anywhere, and nothing is written back: this only
// reads what is already stored.

import { db, type Msg } from "./db";
import { parseDateTime } from "./parseMessages";

export interface Burst {
  date: string;
  from: string;
  to: string;
  count: number;
  sample: string;
}

export interface MonthPoint {
  month: string; // YYYY-MM
  his: number;
  hers: number;
}

export interface PatternReport {
  /** Messages that carry a time of day, out of the total. */
  timed: number;
  total: number;
  hisTotal: number;
  monthly: MonthPoint[];
  busiestMonth: MonthPoint | null;
  /** Messages from him between 11pm and 5am. */
  nightCount: number;
  nightExamples: Msg[];
  /** Runs of many messages from him in a short window. */
  bursts: Burst[];
  /** Volume in the week after each logged date, against his usual week. */
  aroundDates: { title: string; date: string; after: number; usual: number }[];
  notes: string[];
}

const NIGHT_START = 23;
const NIGHT_END = 5;
/** A burst: this many or more from him inside the window below. */
const BURST_MIN = 10;
const BURST_WINDOW_MIN = 120;

const isHisName = (sender: string, hisNames: string): boolean => {
  const names = hisNames
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!names.length) return false;
  return names.includes(sender.trim().toLowerCase());
};

/** Minutes since midnight, or null when the message carries no time. */
function minutesOf(m: Msg): number | null {
  const t = m.time || parseDateTime(m.date).time;
  if (!t) return null;
  const [h, min] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

const hhmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

export async function analyzePatterns(hisNames: string): Promise<PatternReport> {
  const all = await db.messages.toArray();
  const notes: string[] = [];

  const knowsWhoHeIs = hisNames.trim().length > 0;
  if (!knowsWhoHeIs) {
    notes.push(
      "You haven't said which name in the thread is his yet, so this counts every message together. Set that on the Upload & scan page and these numbers split into his and yours."
    );
  }

  const his = knowsWhoHeIs ? all.filter((m) => isHisName(m.sender, hisNames)) : all;
  const hers = knowsWhoHeIs ? all.filter((m) => !isHisName(m.sender, hisNames)) : [];

  const timed = all.filter((m) => minutesOf(m) !== null).length;
  if (timed === 0 && all.length > 0) {
    notes.push(
      "None of your messages carry a time of day — the export they came from only recorded dates. Re-import the same file from the Messages page and choose \"Fill in missing times\": it adds times to the messages you already have without duplicating or changing anything."
    );
  } else if (timed < all.length * 0.5 && all.length > 0) {
    notes.push(
      `Only ${timed.toLocaleString()} of ${all.length.toLocaleString()} messages carry a time of day, so the night-time and burst counts below cover just those.`
    );
  }

  // Monthly volume.
  const byMonth = new Map<string, MonthPoint>();
  const bump = (m: Msg, which: "his" | "hers") => {
    const key = (m.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    const point = byMonth.get(key) || { month: key, his: 0, hers: 0 };
    point[which]++;
    byMonth.set(key, point);
  };
  for (const m of his) bump(m, "his");
  for (const m of hers) bump(m, "hers");
  const monthly = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  const busiestMonth = monthly.reduce<MonthPoint | null>(
    (best, p) => (!best || p.his > best.his ? p : best),
    null
  );

  // Night-time contact.
  const night = his.filter((m) => {
    const mins = minutesOf(m);
    if (mins === null) return false;
    const hour = Math.floor(mins / 60);
    return hour >= NIGHT_START || hour < NIGHT_END;
  });

  /**
   * Bursts: runs of messages from him with no reply from her in between.
   *
   * Counting his messages alone would flag an ordinary back-and-forth — twenty
   * messages each way over an afternoon is a conversation, not harassment.
   * What a court recognises is one-sided contact: he kept sending and she
   * never answered. So a run ends the moment she says anything.
   */
  const bursts: Burst[] = [];
  const byDay = new Map<string, Msg[]>();
  for (const m of all) {
    if (minutesOf(m) === null) continue;
    const day = (m.date || "").slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(m);
    else byDay.set(day, [m]);
  }
  for (const [day, msgs] of byDay) {
    msgs.sort((a, b) => (minutesOf(a) as number) - (minutesOf(b) as number));
    let run: Msg[] = [];
    const flush = () => {
      if (run.length >= BURST_MIN) {
        const start = minutesOf(run[0]) as number;
        const end = minutesOf(run[run.length - 1]) as number;
        if (end - start <= BURST_WINDOW_MIN) {
          bursts.push({
            date: day,
            from: hhmm(start),
            to: hhmm(end),
            count: run.length,
            sample: run[0].text.slice(0, 140),
          });
        }
      }
      run = [];
    };
    for (const m of msgs) {
      const fromHim = knowsWhoHeIs ? isHisName(m.sender, hisNames) : true;
      if (fromHim) run.push(m);
      else flush(); // she replied — the run is broken
    }
    flush();
  }
  bursts.sort((a, b) => b.count - a.count);

  // Volume around dates she logged, against his ordinary week.
  const dates = await db.dates.toArray();
  const spanDays = spanOf(his);
  const usualWeek = spanDays > 0 ? Math.round((his.length / spanDays) * 7) : 0;
  const aroundDates = dates
    .map((d) => {
      const start = Date.parse(`${d.date}T00:00:00`);
      if (Number.isNaN(start)) return null;
      const after = his.filter((m) => {
        const t = Date.parse(`${(m.date || "").slice(0, 10)}T00:00:00`);
        return !Number.isNaN(t) && t >= start && t < start + 7 * 86400000;
      }).length;
      return { title: d.title, date: d.date, after, usual: usualWeek };
    })
    .filter((x): x is { title: string; date: string; after: number; usual: number } => !!x)
    .filter((x) => usualWeek > 0 && x.after > usualWeek * 1.5)
    .sort((a, b) => b.after - a.after)
    .slice(0, 6);

  return {
    timed,
    total: all.length,
    hisTotal: his.length,
    monthly,
    busiestMonth,
    nightCount: night.length,
    nightExamples: night.slice(0, 5),
    bursts: bursts.slice(0, 8),
    aroundDates,
    notes,
  };
}

function spanOf(msgs: Msg[]): number {
  let min = Infinity;
  let max = -Infinity;
  for (const m of msgs) {
    const t = Date.parse(`${(m.date || "").slice(0, 10)}T00:00:00`);
    if (Number.isNaN(t)) continue;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (!isFinite(min) || !isFinite(max) || max <= min) return 0;
  return Math.max(1, Math.round((max - min) / 86400000));
}

/**
 * Fill in times on messages already imported, by matching them against the
 * original export.
 *
 * This is the one operation in the app that touches existing rows, so it is
 * deliberately narrow: it only ever writes the `time` field, only on rows
 * where it is currently missing, and only when the date, sender and text match
 * exactly. It never adds a row, never deletes one, and never touches text,
 * tags, stars or anything else she has done.
 */
export async function fillMissingTimes(
  parsed: { date: string; time?: string; sender: string; text: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<{ filled: number; alreadyHad: number; noTimeInFile: number; unmatched: number }> {
  const withTimes = parsed.filter((p) => p.time);
  const noTimeInFile = parsed.length - withTimes.length;
  if (!withTimes.length) return { filled: 0, alreadyHad: 0, noTimeInFile, unmatched: 0 };

  const key = (date: string, sender: string, text: string) =>
    `${date}|${sender.trim().toLowerCase()}|${text.trim().slice(0, 200)}`;

  const lookup = new Map<string, string>();
  for (const p of withTimes) lookup.set(key(p.date, p.sender, p.text), p.time as string);

  const rows = await db.messages.toArray();
  let filled = 0;
  let alreadyHad = 0;
  let unmatched = 0;
  const updates: { id: number; time: string }[] = [];

  for (const r of rows) {
    if (r.id == null) continue;
    const hit = lookup.get(key((r.date || "").slice(0, 10), r.sender, r.text));
    if (!hit) {
      unmatched++;
      continue;
    }
    if (r.time) {
      alreadyHad++;
      continue;
    }
    updates.push({ id: r.id, time: hit });
  }

  for (let i = 0; i < updates.length; i++) {
    onProgress?.(i, updates.length);
    await db.messages.update(updates[i].id, { time: updates[i].time });
    filled++;
  }
  return { filled, alreadyHad, noTimeInFile, unmatched };
}
