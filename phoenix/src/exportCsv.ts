// CSV exports formatted for attorney / paralegal use.
import { db } from "./db";

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
