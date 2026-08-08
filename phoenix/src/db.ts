import Dexie, { type Table } from "dexie";

export const INCIDENT_CATEGORIES = [
  "physical",
  "verbal / emotional",
  "coercive control",
  "financial abuse",
  "threats / intimidation",
  "stalking / monitoring",
  "sexual abuse",
  "property damage",
  "children / custody",
  "digital abuse",
  "legal / litigation abuse",
  "isolation",
] as const;

export const MESSAGE_TAGS = [
  "threat",
  "control",
  "financial",
  "custody / children",
  "harassment",
  "admission",
  "apology-cycle",
  "monitoring",
] as const;

export interface Incident {
  id?: number;
  date: string; // YYYY-MM-DD
  time?: string;
  title: string;
  narrative: string;
  categories: string[];
  severity: number; // 1-5
  location?: string;
  witnesses?: string;
  policeReport?: string;
  medical?: string;
  childrenPresent: boolean;
  createdAt: number;
}

export interface Msg {
  id?: number;
  date: string; // YYYY-MM-DD or full ISO
  /**
   * "HH:MM" when the export carried a time. Optional because messages
   * imported before times were preserved genuinely do not have one — and a
   * guessed time would be worse than none.
   */
  time?: string;
  sender: string;
  text: string;
  source: string; // paste | csv | manual
  tags: string[];
  starred: boolean;
  createdAt: number;
}

export interface EvidenceItem {
  id?: number;
  title: string;
  date: string;
  kind: string; // photo | screenshot | document | audio | video | other
  notes?: string;
  tags: string[];
  fileName?: string;
  fileType?: string;
  blob?: Blob;
  /** Fingerprint taken when the file entered the record. See integrity.ts. */
  sha256?: string;
  fileSize?: number;
  createdAt: number;
}

export interface FinancialItem {
  id?: number;
  type: "asset" | "debt" | "income" | "expense";
  name: string;
  value: number;
  owner: "mine" | "theirs" | "joint" | "unknown";
  separateProperty: boolean;
  notes?: string;
  createdAt: number;
}

export interface ChatMsg {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export const DATE_TYPES = [
  "hearing",
  "filing deadline",
  "attorney meeting",
  "custody exchange",
  "appointment",
  "other",
] as const;

export interface KeyDate {
  id?: number;
  date: string; // YYYY-MM-DD
  time?: string;
  title: string;
  type: string;
  location?: string;
  notes?: string;
  createdAt: number;
}

export const VIOLATION_TYPES = [
  "missed the exchange entirely",
  "late to exchange",
  "kept the child beyond his time",
  "returned the child early / refused possession",
  "contact with me that the order prohibits",
  "came to a place the order bars him from",
  "third party used to contact me",
  "didn't pay support",
  "unapproved person around the child",
  "alcohol or drugs during possession",
  "school / medical / records violation",
  "disparaging me to the child",
  "other order violation",
] as const;

/** A single breach of a court order — the raw material of an enforcement motion. */
export interface Violation {
  id?: number;
  date: string; // YYYY-MM-DD
  time?: string;
  type: string;
  orderName?: string; // which order was violated
  provision?: string; // the paragraph it breaks, if known
  description: string;
  childPresent: boolean;
  witnesses?: string;
  proof?: string; // where the proof lives (screenshot, camera, doorman)
  reported?: string; // police report #, attorney notified, etc.
  createdAt: number;
}

export interface Doc {
  id?: number;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface KvRow {
  key: string;
  value: any;
}

/**
 * A dated journal entry. Contemporaneous writing is some of the most
 * persuasive evidence there is — a record made at the time, before there was
 * a case to win. Kept dated and separate from Documents for exactly that
 * reason: a judge weighs "written that night" very differently from "written
 * for court".
 */
export interface JournalEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  time?: string;
  title?: string;
  body: string;
  mood?: string;
  tags: string[];
  /** Written at the time, rather than recalled later. */
  contemporaneous: boolean;
  source: string; // typed | imported
  createdAt: number;
  updatedAt: number;
}

/**
 * A note that something entered the case, and what it hashed to at the time.
 * The record is append-only by design — it is worth nothing if it can be
 * quietly rewritten later.
 */
export interface ImportRecord {
  id?: number;
  kind: string;
  fileName?: string;
  bytes?: number;
  rows?: number;
  sha256: string;
  note?: string;
  createdAt: number;
}

/** A rolling on-device restore point. See safety.ts. */
export interface Snapshot {
  id?: number;
  createdAt: number;
  reason: string;
  counts: Record<string, number>;
  bytes: number;
  json: string;
}

// Deliberately neutral database name — it is visible in browser dev tools.
class PhoenixDB extends Dexie {
  incidents!: Table<Incident, number>;
  messages!: Table<Msg, number>;
  evidence!: Table<EvidenceItem, number>;
  financials!: Table<FinancialItem, number>;
  chat!: Table<ChatMsg, number>;
  dates!: Table<KeyDate, number>;
  documents!: Table<Doc, number>;
  violations!: Table<Violation, number>;
  journal!: Table<JournalEntry, number>;
  imports!: Table<ImportRecord, number>;
  snapshots!: Table<Snapshot, number>;
  kv!: Table<KvRow, string>;

  constructor() {
    super("phx_notes");
    this.version(1).stores({
      incidents: "++id, date, severity, createdAt",
      messages: "++id, date, sender, starred, createdAt",
      evidence: "++id, date, kind, createdAt",
      financials: "++id, type, owner, createdAt",
      chat: "++id, createdAt",
    });
    this.version(2).stores({
      dates: "++id, date, createdAt",
    });
    this.version(3).stores({
      documents: "++id, updatedAt, createdAt",
      kv: "&key",
    });
    this.version(4).stores({
      violations: "++id, date, type, createdAt",
    });
    // Purely additive: every earlier table keeps its data untouched.
    this.version(5).stores({
      snapshots: "++id, createdAt",
    });
    this.version(6).stores({
      journal: "++id, date, createdAt",
    });
    this.version(7).stores({
      imports: "++id, createdAt, sha256",
    });
  }
}

export const db = new PhoenixDB();

export async function wipeAllData(): Promise<void> {
  await db.delete();
  localStorage.clear();
  sessionStorage.clear();
}

/**
 * @param includeFiles when false, evidence photos/videos are described but
 *   their bytes are left out — keeps the cloud vault small enough to sync.
 */
export async function exportAllData(includeFiles = true) {
  const [incidents, messages, evidence, financials, chat, dates, documents, violations, journal, imports, kv] =
    await Promise.all([
      db.incidents.toArray(),
      db.messages.toArray(),
      db.evidence.toArray(),
      db.financials.toArray(),
      db.chat.toArray(),
      db.dates.toArray(),
      db.documents.toArray(),
      db.violations.toArray(),
      db.journal.toArray(),
      db.imports.toArray(),
      db.kv.toArray(),
    ]);

  const evidenceSerialized = await Promise.all(
    evidence.map(async (e) => {
      let fileData: string | undefined;
      if (e.blob && includeFiles) {
        fileData = await blobToBase64(e.blob);
      }
      const { blob, ...rest } = e;
      return { ...rest, fileData, fileOmitted: !!e.blob && !includeFiles };
    })
  );

  return {
    format: "phoenix-case-builder",
    version: 1,
    exportedAt: new Date().toISOString(),
    incidents,
    messages,
    evidence: evidenceSerialized,
    financials,
    chat,
    dates,
    documents,
    violations,
    journal,
    imports,
    kv,
  };
}

export async function importAllData(data: any): Promise<void> {
  if (!data || data.format !== "phoenix-case-builder") {
    throw new Error("Not a Phoenix backup file.");
  }
  const evidence: EvidenceItem[] = (data.evidence || []).map((e: any) => {
    const { fileData, ...rest } = e;
    const item: EvidenceItem = { ...rest };
    if (fileData) item.blob = base64ToBlob(fileData, e.fileType || "application/octet-stream");
    return item;
  });
  await db.transaction(
    "rw",
    [
      db.incidents,
      db.messages,
      db.evidence,
      db.financials,
      db.chat,
      db.dates,
      db.documents,
      db.violations,
      db.journal,
      db.imports,
      db.kv,
    ],
    async () => {
      /**
       * Restores MERGE — they never delete. Anything already on this device
       * stays exactly as it is. To make restoring twice (or syncing a device
       * that already holds most of the case) safe, rows that are already
       * present are skipped rather than duplicated: her archive must not
       * double every time she pulls from the vault.
       */
      const addNew = async <T extends object>(
        table: { toArray: () => Promise<T[]>; bulkAdd: (rows: T[]) => Promise<any> },
        incoming: T[],
        signature: (row: T) => string
      ) => {
        if (!incoming?.length) return;
        const existing = new Set((await table.toArray()).map(signature));
        const fresh = stripIds(incoming).filter((row: T) => !existing.has(signature(row)));
        if (fresh.length) await table.bulkAdd(fresh);
      };

      await addNew(db.incidents, data.incidents || [], (i: any) =>
        `${i.date}|${i.time || ""}|${(i.title || "").trim()}|${(i.narrative || "").slice(0, 200)}`
      );
      await addNew(db.messages, data.messages || [], (m: any) =>
        `${m.date}|${m.sender}|${(m.text || "").slice(0, 300)}`
      );
      await addNew(db.evidence, evidence, (e: any) =>
        `${e.date}|${(e.title || "").trim()}|${e.fileName || ""}|${e.notes || ""}`
      );
      await addNew(db.financials, data.financials || [], (f: any) =>
        `${f.type}|${f.name}|${f.value}|${f.owner || ""}`
      );
      await addNew(db.chat, data.chat || [], (c: any) => `${c.createdAt}|${c.role}`);
      await addNew(db.dates, data.dates || [], (d: any) =>
        `${d.date}|${d.time || ""}|${d.title}|${d.type}`
      );
      await addNew(db.documents, data.documents || [], (d: any) =>
        `${d.title}|${(d.content || "").slice(0, 300)}`
      );
      await addNew(db.violations, data.violations || [], (v: any) =>
        `${v.date}|${v.time || ""}|${v.type}|${(v.description || "").slice(0, 200)}`
      );
      await addNew(db.journal, data.journal || [], (j: any) =>
        `${j.date}|${j.time || ""}|${(j.body || "").slice(0, 300)}`
      );
      await addNew(db.imports, data.imports || [], (r: any) => `${r.sha256}|${r.createdAt}`);
      if (data.kv?.length) await db.kv.bulkPut(data.kv);
    }
  );
}

function stripIds<T extends { id?: number }>(rows: T[]): T[] {
  return rows.map(({ id, ...rest }) => rest as T);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.substring(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, type: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}

/**
 * Add messages, skipping any the archive already holds.
 *
 * Re-uploading the same export used to double the archive — 27,000 messages
 * became 54,000, every duplicate costing money to scan again and muddying the
 * record an attorney has to read. Importing the same file twice now adds
 * nothing the second time, so she can re-upload without fear.
 *
 * A message is "already held" when its date, sender and text all match.
 */
export async function addMessagesDeduped(
  rows: Omit<Msg, "id">[]
): Promise<{ added: number; skipped: number }> {
  if (!rows.length) return { added: 0, skipped: 0 };
  const sig = (m: { date: string; sender: string; text: string }) =>
    `${(m.date || "").slice(0, 10)}|${m.sender.trim().toLowerCase()}|${m.text.trim()}`;

  const existing = new Set((await db.messages.toArray()).map(sig));
  const fresh: Omit<Msg, "id">[] = [];
  // Guard against duplicates inside the incoming file too.
  for (const r of rows) {
    const k = sig(r);
    if (existing.has(k)) continue;
    existing.add(k);
    fresh.push(r);
  }
  if (fresh.length) await db.messages.bulkAdd(fresh as Msg[]);
  return { added: fresh.length, skipped: rows.length - fresh.length };
}

/**
 * Find messages the archive holds more than once — the result of importing the
 * same export twice before that was prevented. Returns the ids that could be
 * removed, always keeping the copy that carries her work: a starred or tagged
 * duplicate is kept over a bare one, and the oldest is kept otherwise.
 */
export async function findDuplicateMessages(): Promise<{
  groups: number;
  removable: number[];
  keptExamples: { text: string; copies: number }[];
}> {
  const rows = await db.messages.toArray();
  const byKey = new Map<string, Msg[]>();
  for (const m of rows) {
    if (m.id == null) continue;
    const k = `${(m.date || "").slice(0, 10)}|${m.sender.trim().toLowerCase()}|${m.text.trim()}`;
    const list = byKey.get(k);
    if (list) list.push(m);
    else byKey.set(k, [m]);
  }

  const removable: number[] = [];
  const keptExamples: { text: string; copies: number }[] = [];
  let groups = 0;
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    groups++;
    // Whichever copy carries the most of her work survives.
    const score = (m: Msg) => (m.starred ? 100 : 0) + (m.tags?.length || 0) * 10 + (m.time ? 1 : 0);
    list.sort((a, b) => score(b) - score(a) || (a.id as number) - (b.id as number));
    for (const dup of list.slice(1)) removable.push(dup.id as number);
    if (keptExamples.length < 5) keptExamples.push({ text: list[0].text.slice(0, 120), copies: list.length });
  }
  return { groups, removable, keptExamples };
}
