// Cloud vault: her whole case, encrypted on her device, parked somewhere she
// can reach it from any phone or laptop — and share with her attorney.
//
// The server never sees a key or a word of plaintext. Losing the passphrase
// means losing the vault; that is the price of the host being unable to read it.
import { exportAllData, importAllData } from "./db";
import { decryptJson, encryptJson } from "./crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — she may read this aloud

/**
 * 16 characters from a 32-letter alphabet — 80 bits — grouped so it can be
 * copied by hand without errors. (Not 128: each random byte is reduced to one
 * of 32 characters. 80 bits is still ~10^24 guesses, far beyond enumerable.)
 */
export function makeVaultCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

export function normalizeVaultCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 16 ? (clean.match(/.{4}/g) as string[]).join("-") : raw.trim().toUpperCase();
}

export interface VaultStatus {
  savedAt: number | null;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * gzip a string to base64, using the browser's own compressor.
 *
 * Her case is 24,928 messages of English text plus repeated JSON keys — about
 * five megabytes of it, most of which is structure rather than content. The
 * vault upload is one request, and the platform will not carry five megabytes.
 * Compressed it is under two.
 */
async function packJson(value: unknown): Promise<string | null> {
  if (typeof CompressionStream === "undefined") return null;
  const json = JSON.stringify(value);
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  // Chunked so a multi-megabyte archive cannot blow the argument limit on
  // String.fromCharCode, which is exactly the sort of thing that only fails on
  // the largest — and most important — case files.
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** The reverse. */
async function unpackJson(b64: string): Promise<any> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/**
 * Encrypt everything on-device and upload the ciphertext.
 *
 * When a recovery key is supplied we also store a tiny second envelope holding
 * the passphrase, encrypted under that recovery key. It is the second door:
 * forgetting the passphrase costs her the vault otherwise, and for someone in
 * her situation that is not an acceptable way to lose a case. The server still
 * holds nothing but ciphertext — both doors need a key she owns.
 */
export async function pushVault(
  code: string,
  passphrase: string,
  includeFiles: boolean,
  recoveryKey?: string
): Promise<{ savedAt: number; filesDropped: boolean }> {
  const send = async (withFiles: boolean) => {
    const data = await exportAllData(withFiles);
    // Compressed BEFORE encryption — encrypted bytes are noise and do not
    // compress. A browser too old for CompressionStream sends it as it was.
    const packed = await packJson(data);
    const envelope: any = await encryptJson(
      packed === null ? data : { phxGzip: 1, z: packed },
      passphrase
    );
    if (recoveryKey) {
      envelope.escrow = await encryptJson({ passphrase }, recoveryKey);
    }
    return fetch(`/api/vault?code=${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });
  };

  // An oversized upload does not always come back as a status code. Measured
  // against production: bodies up to 5.5MB answer HTTP 200, and at 7MB the
  // platform kills the connection mid-transfer with no response at all — so
  // fetch THROWS, and a handler that only reads res.status never runs. That is
  // how "Save now" spun and produced nothing: a browser without
  // CompressionStream sends the case uncompressed at ~7.5MB, straight into
  // that wall.
  let res: Response | null = null;
  let cut = false;
  try {
    res = await send(includeFiles);
  } catch {
    cut = true;
  }
  let filesDropped = false;

  // Too big, whether the platform said so (413) or just hung up (cut): retry
  // without evidence files. Her words are what she needs on her phone —
  // incidents, messages, findings, journal. Photos are the bulk, and base64
  // adds a third again on top; they stay on the device that holds them.
  if ((cut || res?.status === 413) && includeFiles) {
    cut = false;
    res = null;
    try {
      res = await send(false);
      filesDropped = true;
    } catch {
      cut = true;
    }
  }

  if (cut || !res) {
    throw new Error(
      typeof CompressionStream === "undefined"
        ? "This case is too big to upload from this browser, because the browser is too old to compress it first. " +
          "Two ways forward: update this browser, or use the Backup & restore section below — " +
          '"Export encrypted backup" makes a file with everything in it, with no size limit, ' +
          "that can be moved by email or USB and restored on the other device."
        : "The connection dropped while uploading. Check the internet connection and try again — " +
          "and if it keeps happening, the Backup & restore section below can move the case as a file instead."
    );
  }

  if (!res.ok) throw new Error(await readError(res, "Couldn't save to the vault. Try again."));
  const body = await res.json();
  return { savedAt: body.savedAt as number, filesDropped };
}

/** Download, decrypt on-device, and merge into this device's records. */
export async function pullVault(code: string, passphrase: string): Promise<number> {
  const res = await fetch(`/api/vault?code=${encodeURIComponent(code)}`, { method: "GET" });
  if (!res.ok) throw new Error(await readError(res, "Couldn't reach the vault. Check the code."));
  const envelope = await res.json();
  let data: any;
  try {
    data = await decryptJson(envelope, passphrase);
  } catch {
    throw new Error("That passphrase doesn't open this vault. Check it and try again.");
  }
  // Vaults saved before compression carry the case directly; newer ones carry
  // it packed. Both open.
  if (data && data.phxGzip && typeof data.z === "string") {
    data = await unpackJson(data.z);
  }
  await importAllData(data);
  return (envelope.savedAt as number) || Date.now();
}

/**
 * The second door: recover the forgotten passphrase using the recovery key
 * from her Recovery Kit. Returns the passphrase so she can get back in and
 * then set a new one she'll remember.
 */
export async function recoverPassphrase(code: string, recoveryKey: string): Promise<string> {
  const res = await fetch(`/api/vault?code=${encodeURIComponent(code)}`, { method: "GET" });
  if (!res.ok) throw new Error(await readError(res, "Couldn't reach the vault. Check the code."));
  const envelope = await res.json();
  if (!envelope?.escrow) {
    throw new Error(
      "This vault was saved without a Recovery Kit, so the passphrase can't be recovered. If you still know it, use it — then save again to create a kit."
    );
  }
  // The kit prints "cedar-harbor-mica-…", but she will be typing this off
  // paper, under stress, possibly having it read to her over the phone. Spaces,
  // commas, line breaks and doubled hyphens between the words must all count as
  // the hyphen the kit meant — the words are the key, not the punctuation.
  const normalizedKey = recoveryKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "");
  try {
    const opened = await decryptJson(envelope.escrow, normalizedKey);
    if (!opened?.passphrase) throw new Error("bad escrow");
    return opened.passphrase as string;
  } catch {
    throw new Error("That recovery key doesn't match this vault. Check it against your Recovery Kit.");
  }
}

/**
 * Does this passphrase open what is currently in the vault?
 *
 * Checked BEFORE overwriting. Every save encrypts under whatever passphrase
 * was just typed, so a typo here would not fail — it would succeed, and quietly
 * leave the newest version of her case under a passphrase nobody knows. The
 * next pull from her phone would then be told "wrong passphrase" while holding
 * the right one. Refusing the save is the only honest response to a mismatch.
 *
 * Returns null when nothing is saved under the code yet — a first save has
 * nothing to contradict.
 */
export async function passphraseOpensVault(
  code: string,
  passphrase: string
): Promise<boolean | null> {
  const res = await fetch(`/api/vault?code=${encodeURIComponent(code)}`, { method: "GET" });
  if (!res.ok) return null;
  const envelope = await res.json();
  try {
    await decryptJson(envelope, passphrase);
    return true;
  } catch {
    return false;
  }
}

/** Has anything been saved under this code? Used to warn before overwriting. */
export async function vaultStatus(code: string): Promise<VaultStatus | null> {
  const res = await fetch(`/api/vault?code=${encodeURIComponent(code)}`, { method: "GET" });
  if (!res.ok) return null;
  const body = await res.json();
  return { savedAt: body?.savedAt ?? null };
}
