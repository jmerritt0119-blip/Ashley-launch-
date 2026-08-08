// Proving the record wasn't tampered with.
//
// The most predictable attack on a survivor's message evidence is not "he
// didn't say that" — it's "she made it up" or "she edited it". A fingerprint
// taken the moment a file enters the record, before there is any dispute about
// it, is a concrete answer: the file produced in discovery either matches the
// fingerprint recorded months earlier, or it doesn't.
//
// This is not a substitute for authenticating evidence in court, and it does
// not prove who wrote a message. What it does prove is that the copy she is
// producing is the same bytes she imported on a stated date — which is exactly
// the point that gets attacked.

import { db } from "./db";

/** SHA-256 of a blob or string, lowercase hex. */
export async function sha256Hex(input: Blob | string): Promise<string> {
  const buf =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(await input.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", buf as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A short, human-readable form for reading aloud or checking by eye. */
export function shortHash(hex: string): string {
  return hex ? `${hex.slice(0, 8)}…${hex.slice(-8)}` : "";
}

/**
 * Record that a file or export entered the case, and what it hashed to. Never
 * throws: an integrity record failing must not stop her importing evidence.
 */
export async function recordImport(entry: {
  kind: string; // "message export" | "evidence file" | "journal" | …
  fileName?: string;
  bytes?: number;
  rows?: number;
  sha256: string;
  note?: string;
}): Promise<void> {
  try {
    await db.imports.add({ ...entry, createdAt: Date.now() });
  } catch {
    /* integrity logging is additive — never block the import itself */
  }
}

/**
 * Re-check a file she still has against what was recorded when it was
 * imported. This is the question an attorney actually asks: is the thing we
 * are producing the same thing you saved?
 */
export async function verifyAgainstRecord(
  file: Blob
): Promise<{ match: boolean; hash: string; recordedAt?: number; fileName?: string }> {
  const hash = await sha256Hex(file);
  const hit = await db.imports.filter((r) => r.sha256 === hash).first();
  return { match: !!hit, hash, recordedAt: hit?.createdAt, fileName: hit?.fileName };
}
