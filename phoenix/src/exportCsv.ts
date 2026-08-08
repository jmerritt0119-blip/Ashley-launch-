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
