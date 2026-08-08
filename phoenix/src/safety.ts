// Keeping her case alive. Everything here exists to make losing data
// impossible in practice, at four separate layers:
//
//   1. Persistent storage — ask the browser never to evict this database.
//   2. Installation — on an iPhone, a site that is not on the Home Screen has
//      its storage wiped after seven days of not being opened. Installing is
//      not a convenience feature here; it is what stops the operating system
//      from deleting her evidence.
//   3. Rolling local snapshots — an undo for accidents, kept on the device.
//   4. The encrypted cloud vault — the only layer that survives a lost,
//      stolen, broken, or taken-away phone.
//
// No layer here ever deletes a record. Snapshots only ever restore by adding.

import { db, exportAllData, importAllData } from "./db";

export interface StorageReport {
  /** The browser has promised not to evict this data to reclaim space. */
  persisted: boolean;
  /** Running as an installed app rather than a browser tab. */
  installed: boolean;
  /** True on iPhone/iPad, where not installing means a 7-day storage limit. */
  isIos: boolean;
  usedMb: number | null;
  quotaMb: number | null;
}

export async function storageReport(): Promise<StorageReport> {
  const installed =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
  const ua = navigator.userAgent || "";
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);

  let persisted = false;
  let usedMb: number | null = null;
  let quotaMb: number | null = null;
  try {
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (est.usage != null) usedMb = Math.round((est.usage / 1_048_576) * 10) / 10;
      if (est.quota != null) quotaMb = Math.round(est.quota / 1_048_576);
    }
  } catch {
    /* older browser — the report is best-effort, the data is not */
  }
  return { persisted, installed, isIos, usedMb, quotaMb };
}

/** Ask the browser to make this data non-evictable. Safe to call repeatedly. */
export async function ensurePersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- install

let deferredPrompt: any = null;
let installReadyCb: (() => void) | null = null;

export function watchInstallability(onReady: () => void): () => void {
  installReadyCb = onReady;
  const onBip = (e: Event) => {
    e.preventDefault();
    deferredPrompt = e;
    installReadyCb?.();
  };
  window.addEventListener("beforeinstallprompt", onBip);
  return () => window.removeEventListener("beforeinstallprompt", onBip);
}

export function canPromptInstall(): boolean {
  return !!deferredPrompt;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const p = deferredPrompt;
  deferredPrompt = null;
  try {
    p.prompt();
    const { outcome } = await p.userChoice;
    return outcome === "accepted";
  } catch {
    return false;
  }
}

// --------------------------------------------------------------- snapshots

/** How many rolling restore points are kept on the device. */
const KEEP_SNAPSHOTS = 8;
/** Don't take another automatic snapshot until this long has passed. */
const SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface SnapshotMeta {
  id?: number;
  createdAt: number;
  reason: string;
  counts: Record<string, number>;
  bytes: number;
}

function countsOf(data: any): Record<string, number> {
  const keys = [
    "incidents",
    "messages",
    "evidence",
    "financials",
    "dates",
    "documents",
    "violations",
  ];
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = Array.isArray(data[k]) ? data[k].length : 0;
  return out;
}

export function totalRows(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/**
 * Take a restore point. Photo and video bytes are left out so snapshots stay
 * small enough to keep several of — the files themselves are only ever removed
 * by her, and the downloadable backup and the vault both carry them.
 */
export async function takeSnapshot(reason: string): Promise<SnapshotMeta | null> {
  const data = await exportAllData(false);
  const counts = countsOf(data);
  if (totalRows(counts) === 0) return null; // nothing to protect yet
  const json = JSON.stringify(data);
  const row: SnapshotMeta & { json: string } = {
    createdAt: Date.now(),
    reason,
    counts,
    bytes: json.length,
    json,
  };
  const id = (await db.snapshots.add(row as any)) as number;

  const old = await db.snapshots.orderBy("createdAt").reverse().offset(KEEP_SNAPSHOTS).toArray();
  if (old.length) await db.snapshots.bulkDelete(old.map((s: any) => s.id));
  return { ...row, id, json: undefined } as any;
}

/** Take one if enough time has passed. Called on startup and when hiding. */
export async function autoSnapshot(): Promise<void> {
  try {
    const last = await db.snapshots.orderBy("createdAt").last();
    if (last && Date.now() - last.createdAt < SNAPSHOT_INTERVAL_MS) return;
    await takeSnapshot(last ? "automatic" : "first run");
  } catch {
    /* a failed snapshot must never interrupt her work */
  }
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const rows = await db.snapshots.orderBy("createdAt").reverse().toArray();
  return rows.map(({ json, ...meta }: any) => meta);
}

/**
 * Put a restore point back. Like every restore in this app it only ever adds:
 * anything currently on the device stays exactly where it is, and rows that
 * are already present are not duplicated.
 */
export async function restoreSnapshot(id: number): Promise<void> {
  const row = await db.snapshots.get(id);
  if (!row) throw new Error("That restore point is no longer on this device.");
  await takeSnapshot("before restoring a snapshot");
  await importAllData(JSON.parse((row as any).json));
}
