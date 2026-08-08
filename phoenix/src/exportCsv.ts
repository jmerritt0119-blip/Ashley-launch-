// CSV exports formatted for attorney / paralegal use.
import { db } from "./db";
import { buildZip, type ZipEntry } from "./zip";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows: (string | number | boolean | undefined | null)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob(["﻿" + text], { type: mime }); // BOM so Excel opens UTF-8 cleanly
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportIncidentsCsv(): Promise<void> {
  const incidents = await db.incidents.orderBy("date").toArray();
  const rows: any[][] = [
    [
      "Entry #",
      "Date",
      "Time",
      "Title",
      "Narrative",
      "Categories",
      "Severity (1-5)",
      "Children present",
      "Location",
      "Witnesses",
      "Police report #",
      "Medical",
      "Logged on",
    ],
  ];
  incidents.forEach((i, idx) => {
    rows.push([
      `INC-${String(idx + 1).padStart(3, "0")}`,
      i.date,
      i.time || "",
      i.title,
      i.narrative,
      i.categories.join("; "),
      i.severity,
      i.childrenPresent ? "yes" : "no",
      i.location || "",
      i.witnesses || "",
      i.policeReport || "",
      i.medical || "",
      new Date(i.createdAt).toISOString(),
    ]);
  });
  downloadText(`incident-log-${stamp()}.csv`, toCsv(rows));
}

export async function exportMessagesCsv(): Promise<void> {
  const messages = await db.messages.orderBy("date").toArray();
  const rows: any[][] = [
    ["Entry #", "Date", "Sender", "Message text", "Flagged (starred)", "Tags", "Source", "Logged on"],
  ];
  messages.forEach((m, idx) => {
    rows.push([
      `MSG-${String(idx + 1).padStart(4, "0")}`,
      m.date,
      m.sender,
      m.text,
      m.starred ? "yes" : "no",
      m.tags.join("; "),
      m.source,
      new Date(m.createdAt).toISOString(),
    ]);
  });
  downloadText(`message-archive-${stamp()}.csv`, toCsv(rows));
}

export async function exportEvidenceCsv(): Promise<void> {
  const evidence = await db.evidence.orderBy("date").toArray();
  const rows: any[][] = [
    ["Exhibit #", "Date", "Title", "Type", "File name", "Notes / location of original", "Tags", "Logged on"],
  ];
  evidence.forEach((e, idx) => {
    rows.push([
      `E-${String(idx + 1).padStart(3, "0")}`,
      e.date,
      e.title,
      e.kind,
      e.fileName || "",
      e.notes || "",
      e.tags.join("; "),
      new Date(e.createdAt).toISOString(),
    ]);
  });
  downloadText(`evidence-index-${stamp()}.csv`, toCsv(rows));
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/quicktime": "mov",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

function safeName(s: string): string {
  return (
    s
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "item"
  );
}

function extFor(fileName?: string, fileType?: string): string {
  const fromName = fileName?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  return EXT_BY_TYPE[(fileType || "").toLowerCase()] || "dat";
}

/**
 * Package every stored evidence file into one .zip, named with the same
 * exhibit numbers the printed packet and the evidence CSV use, plus a
 * manifest so the attorney's office can see what's inside without opening
 * each file.
 */
export async function exportEvidenceFilesZip(
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  // Same ordering as the packet, so E-001 here is E-001 there. Items without
  // a stored file still consume their exhibit number.
  const all = await db.evidence.orderBy("date").toArray();
  const withFiles = all
    .map((e, idx) => ({ item: e, ref: `E-${String(idx + 1).padStart(3, "0")}` }))
    .filter((r) => r.item.blob);

  if (withFiles.length === 0) return 0;

  const manifest: any[][] = [
    ["Exhibit #", "File in this zip", "Date", "Title", "Type", "Notes / location of original", "Tags"],
  ];
  const entries: ZipEntry[] = withFiles.map(({ item, ref }) => {
    const name = `${ref}_${item.date}_${safeName(item.title)}.${extFor(item.fileName, item.fileType)}`;
    manifest.push([
      ref,
      name,
      item.date,
      item.title,
      item.kind,
      item.notes || "",
      item.tags.join("; "),
    ]);
    return { name, blob: item.blob as Blob, date: new Date(item.createdAt) };
  });

  entries.unshift({
    name: "00_EXHIBIT-INDEX.csv",
    blob: new Blob(["﻿" + toCsv(manifest)], { type: "text/csv;charset=utf-8" }),
    date: new Date(),
  });

  const zip = await buildZip(entries, onProgress);
  const url = URL.createObjectURL(zip);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evidence-files-${stamp()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
  return withFiles.length;
}

export async function exportViolationsCsv(): Promise<void> {
  const violations = await db.violations.orderBy("date").toArray();
  const rows: any[][] = [
    [
      "Entry #",
      "Date",
      "Time",
      "Violation",
      "Order violated",
      "Provision",
      "What happened",
      "Child involved",
      "Witnesses",
      "Proof / where original is",
      "Reported to",
      "Logged on",
    ],
  ];
  violations.forEach((v, idx) => {
    rows.push([
      `V-${String(idx + 1).padStart(3, "0")}`,
      v.date,
      v.time || "",
      v.type,
      v.orderName || "",
      v.provision || "",
      v.description,
      v.childPresent ? "yes" : "no",
      v.witnesses || "",
      v.proof || "",
      v.reported || "",
      new Date(v.createdAt).toISOString(),
    ]);
  });
  downloadText(`order-violations-${stamp()}.csv`, toCsv(rows));
}

export async function exportDatesCsv(): Promise<void> {
  const dates = await db.dates.orderBy("date").toArray();
  const rows: any[][] = [["Date", "Time", "Event", "Type", "Location", "Notes"]];
  dates.forEach((d) => {
    rows.push([d.date, d.time || "", d.title, d.type, d.location || "", d.notes || ""]);
  });
  downloadText(`key-dates-${stamp()}.csv`, toCsv(rows));
}

export async function exportFinancialsCsv(): Promise<void> {
  const financials = await db.financials.toArray();
  const rows: any[][] = [
    ["Type", "Item", "Value (USD)", "Whose", "Claimed separate property", "Notes", "Logged on"],
  ];
  financials.forEach((f) => {
    rows.push([
      f.type,
      f.name,
      f.value || 0,
      f.owner,
      f.separateProperty ? "yes" : "no",
      f.notes || "",
      new Date(f.createdAt).toISOString(),
    ]);
  });
  downloadText(`financial-disclosure-prep-${stamp()}.csv`, toCsv(rows));
}

export async function exportJournalCsv(): Promise<void> {
  const entries = await db.journal.orderBy("date").toArray();
  const rows: any[][] = [
    ["Entry #", "Date", "Time", "Title", "Written at the time", "Source", "Entry"],
  ];
  entries.forEach((e, i) => {
    rows.push([
      `J-${String(i + 1).padStart(3, "0")}`,
      e.date,
      e.time || "",
      e.title || "",
      e.contemporaneous ? "yes" : "recalled later",
      e.source,
      e.body,
    ]);
  });
  downloadText(`journal-${stamp()}.csv`, "﻿" + toCsv(rows));
}

/**
 * One file with the entire case in it: every record as a spreadsheet, every
 * document and journal entry as readable text, every photo, video and audio
 * file, and an index explaining what each one is.
 *
 * This is the thing to hand an attorney, and the thing to keep somewhere safe.
 * It is assembled entirely on this device — nothing is uploaded to build it.
 */
export async function exportEverythingZip(
  onProgress?: (done: number, total: number) => void
): Promise<{ files: number; bytes: number }> {
  const [incidents, messages, evidence, financials, dates, documents, violations, journal] =
    await Promise.all([
      db.incidents.orderBy("date").toArray(),
      db.messages.orderBy("date").toArray(),
      db.evidence.orderBy("date").toArray(),
      db.financials.toArray(),
      db.dates.orderBy("date").toArray(),
      db.documents.orderBy("updatedAt").toArray(),
      db.violations.orderBy("date").toArray(),
      db.journal.orderBy("date").toArray(),
    ]);

  const now = new Date();
  const entries: ZipEntry[] = [];
  const text = (name: string, body: string, mime = "text/plain;charset=utf-8") =>
    entries.push({ name, blob: new Blob(["﻿" + body], { type: mime }), date: now });
  const csv = (name: string, rows: any[][]) => text(name, toCsv(rows), "text/csv;charset=utf-8");

  csv("records/incidents.csv", [
    ["Date", "Time", "Title", "Severity", "Categories", "Children present", "Location", "Witnesses", "Police report", "Medical", "Narrative"],
    ...incidents.map((i) => [i.date, i.time || "", i.title, i.severity, i.categories.join("; "),
      i.childrenPresent ? "yes" : "no", i.location || "", i.witnesses || "", i.policeReport || "",
      i.medical || "", i.narrative]),
  ]);

  csv("records/messages.csv", [
    ["Date", "From", "Flagged", "Tags", "Source", "Message"],
    ...messages.map((m) => [m.date, m.sender, m.starred ? "yes" : "", (m.tags || []).join("; "), m.source, m.text]),
  ]);

  csv("records/journal.csv", [
    ["Date", "Time", "Title", "Written at the time", "Source", "Entry"],
    ...journal.map((j) => [j.date, j.time || "", j.title || "",
      j.contemporaneous ? "yes" : "recalled later", j.source, j.body]),
  ]);

  csv("records/violations.csv", [
    ["Date", "Time", "Type", "Order", "Provision", "Child present", "Witnesses", "Proof", "Reported", "Description"],
    ...violations.map((v) => [v.date, v.time || "", v.type, v.orderName || "", v.provision || "",
      v.childPresent ? "yes" : "no", v.witnesses || "", v.proof || "", v.reported || "", v.description]),
  ]);

  csv("records/financials.csv", [
    ["Type", "Name", "Value", "Owner", "Separate property", "Notes"],
    ...financials.map((f) => [f.type, f.name, f.value, f.owner, f.separateProperty ? "yes" : "no", f.notes || ""]),
  ]);

  csv("records/key-dates.csv", [
    ["Date", "Time", "Title", "Type", "Location", "Notes"],
    ...dates.map((d) => [d.date, d.time || "", d.title, d.type, d.location || "", d.notes || ""]),
  ]);

  // Journal and documents also go in as plain readable text — a spreadsheet
  // cell is not how anyone actually reads a journal entry.
  if (journal.length) {
    text(
      "journal/journal-full.txt",
      journal
        .map((j) => `${j.date}${j.time ? " " + j.time : ""}${j.title ? " — " + j.title : ""}` +
          `${j.contemporaneous ? "" : "  [recalled later]"}\n\n${j.body}`)
        .join("\n\n" + "=".repeat(60) + "\n\n")
    );
  }
  for (const d of documents) {
    text(`documents/${safeName(d.title || "untitled")}.txt`, `${d.title}\n\n${d.content}`);
  }

  // Files, numbered to match the exhibit index used everywhere else.
  const numbered = evidence.map((item, idx) => ({ item, ref: `E-${String(idx + 1).padStart(3, "0")}` }));
  const manifest: any[][] = [
    ["Exhibit #", "File in this zip", "Date", "Title", "Type", "Notes / location of original", "Tags"],
  ];
  for (const { item, ref } of numbered) {
    const name = item.blob
      ? `files/${ref}_${item.date}_${safeName(item.title)}.${extFor(item.fileName, item.fileType)}`
      : "(no file stored — original is elsewhere)";
    manifest.push([ref, name, item.date, item.title, item.kind, item.notes || "", item.tags.join("; ")]);
    if (item.blob) entries.push({ name, blob: item.blob, date: new Date(item.createdAt) });
  }
  csv("records/EXHIBIT-INDEX.csv", manifest);

  const files = numbered.filter((n) => n.item.blob).length;
  text(
    "README.txt",
    [
      `PHOENIX CASE FILE — exported ${now.toLocaleString()}`,
      "",
      "WHAT IS IN HERE",
      `  records/            every record as a spreadsheet (opens in Excel, Numbers, Google Sheets)`,
      `  records/EXHIBIT-INDEX.csv   what each numbered file is`,
      `  journal/            journal entries as readable text`,
      `  documents/          written documents`,
      `  files/              photos, screenshots, video and audio, numbered E-001, E-002, …`,
      "",
      "WHAT IT CONTAINS",
      `  ${incidents.length} incidents`,
      `  ${messages.length} messages (${messages.filter((m) => m.starred).length} flagged as significant)`,
      `  ${journal.length} journal entries`,
      `  ${violations.length} court-order violations`,
      `  ${evidence.length} evidence items, ${files} with a file attached`,
      `  ${financials.length} financial entries`,
      `  ${documents.length} documents`,
      `  ${dates.length} key dates`,
      "",
      "A NOTE ON THE ORIGINALS",
      "  This export is a working copy. Keep the originals — the messages on the",
      "  phone, the photos in the camera roll, medical and police records — exactly",
      "  where they are. Those are the proof; this is the index that makes sense of",
      "  them.",
      "",
      "  Journal entries marked 'written at the time' were recorded",
      "  contemporaneously, which is why they carry weight.",
    ].join("\n")
  );

  const zip = await buildZip(entries, onProgress);
  const url = URL.createObjectURL(zip);
  const a = document.createElement("a");
  a.href = url;
  a.download = `phoenix-complete-case-${stamp()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
  return { files: entries.length, bytes: zip.size };
}
