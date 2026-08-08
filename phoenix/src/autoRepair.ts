// Repairs that run themselves, so she never has to know they were needed.
//
// She uploaded her export more than once before duplicate protection existed,
// and 29,900 messages became roughly 100,000 — the same texts three and four
// times over. She should not have to diagnose that, find a button, and trust
// it. It should simply be right the next time she opens the app.

import { db, mergeDuplicateMessages } from "./db";
import { takeSnapshot } from "./safety";

const MARK = "autoDedupeAtCount";

/**
 * Progress, broadcast so the app can say what it is doing.
 *
 * Measured at her scale — 119,600 rows down to 29,900 — this takes about 80
 * seconds. Eighty seconds of a message count visibly changing with no
 * explanation is exactly the "it looks broken" feeling this whole app has been
 * fighting. So it announces itself.
 */
export interface RepairProgress {
  running: boolean;
  done: number;
  total: number;
}

const EVT = "phx-repair-progress";

function emit(p: RepairProgress) {
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: p }));
  } catch {
    /* not in a browser (tests) */
  }
}

/** Subscribe to repair progress. Returns an unsubscribe function. */
export function onRepairProgress(cb: (p: RepairProgress) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent).detail as RepairProgress);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

export interface RepairReport {
  removed: number;
  kept: number;
  groups: number;
  at: number;
}

/**
 * Collapse duplicate messages if the archive has changed since the last time
 * this ran. The count check is a cheap index lookup, so on an archive that is
 * already clean this costs almost nothing and reads no rows at all.
 */
export async function autoRepair(
  onProgress?: (done: number, total: number) => void
): Promise<RepairReport | null> {
  try {
    const count = await db.messages.count();
    if (count === 0) return null;

    const mark = await db.kv.get(MARK);
    if (mark?.value === count) return null; // nothing has changed since last time

    emit({ running: true, done: 0, total: 0 });

    // A restore point BEFORE anything is removed. If this repair is ever
    // wrong, every deleted row is still recoverable from here.
    await takeSnapshot("before removing duplicate messages");

    const res = await mergeDuplicateMessages((done, total) => {
      emit({ running: true, done, total });
      onProgress?.(done, total);
    });
    await db.kv.put({ key: MARK, value: await db.messages.count() });
    emit({ running: false, done: 0, total: 0 });

    if (res.removed === 0) return null;

    const report: RepairReport = { ...res, at: Date.now() };
    await db.kv.put({ key: "lastAutoRepair", value: report });
    return report;
  } catch {
    // A repair that fails must never stop her opening her case.
    emit({ running: false, done: 0, total: 0 });
    return null;
  }
}

/** What the last automatic repair did, so the app can tell her plainly. */
export async function lastRepair(): Promise<RepairReport | null> {
  try {
    const row = await db.kv.get("lastAutoRepair");
    return (row?.value as RepairReport) || null;
  } catch {
    return null;
  }
}

export async function dismissRepairNotice(): Promise<void> {
  try {
    await db.kv.delete("lastAutoRepair");
  } catch {
    /* ignore */
  }
}
