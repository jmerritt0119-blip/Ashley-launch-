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

// Deliberately neutral database name — it is visible in browser dev tools.
class PhoenixDB extends Dexie {
  incidents!: Table<Incident, number>;
  messages!: Table<Msg, number>;
  evidence!: Table<EvidenceItem, number>;
  financials!: Table<FinancialItem, number>;
  chat!: Table<ChatMsg, number>;
  dates!: Table<KeyDate, number>;

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
  }
}

export const db = new PhoenixDB();

export async function wipeAllData(): Promise<void> {
  await db.delete();
  localStorage.clear();
  sessionStorage.clear();
}

export async function exportAllData() {
  const [incidents, messages, evidence, financials, chat, dates] = await Promise.all([
    db.incidents.toArray(),
    db.messages.toArray(),
    db.evidence.toArray(),
    db.financials.toArray(),
    db.chat.toArray(),
    db.dates.toArray(),
  ]);

  const evidenceSerialized = await Promise.all(
    evidence.map(async (e) => {
      let fileData: string | undefined;
      if (e.blob) {
        fileData = await blobToBase64(e.blob);
      }
      const { blob, ...rest } = e;
      return { ...rest, fileData };
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
    [db.incidents, db.messages, db.evidence, db.financials, db.chat, db.dates],
    async () => {
      if (data.incidents?.length) await db.incidents.bulkAdd(stripIds(data.incidents));
      if (data.messages?.length) await db.messages.bulkAdd(stripIds(data.messages));
      if (evidence.length) await db.evidence.bulkAdd(stripIds(evidence));
      if (data.financials?.length) await db.financials.bulkAdd(stripIds(data.financials));
      if (data.chat?.length) await db.chat.bulkAdd(stripIds(data.chat));
      if (data.dates?.length) await db.dates.bulkAdd(stripIds(data.dates));
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
