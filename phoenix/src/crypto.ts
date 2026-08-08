// PIN hashing and encrypted backup export, using the Web Crypto API only.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomSaltHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return toHex(bytes);
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`${saltHex}:${pin}`));
  return toHex(new Uint8Array(digest));
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 210000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * A high-entropy recovery key — the second door into the vault, so a forgotten
 * passphrase is never the end of her case. Words instead of characters because
 * she may have to read it over the phone or copy it off paper under stress.
 */
const RECOVERY_WORDS =
  "anchor amber arbor beacon birch bramble canyon cedar cinder clover copper cove crane delta dune ember falcon fern flint forge garnet granite harbor haven heron indigo ivory juniper kestrel lantern larch linen lumen marble meadow mesa mica noble onyx opal orchard pebble pewter pine quarry quill raven ridge river saffron sage slate sparrow spruce stone summit tamarack thistle timber topaz umber valley vellum verdant walnut willow winter zephyr".split(
    " "
  );

export function makeRecoveryKey(): string {
  // 12 words from this list is ~72 bits of entropy. Fewer words would be
  // friendlier to type and materially weaker if the ciphertext ever leaked,
  // and her case is not the place to trade security for typing comfort.
  const idx = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(idx, (n) => RECOVERY_WORDS[n % RECOVERY_WORDS.length]).join("-");
}

export interface EncryptedBackup {
  format: "phoenix-encrypted";
  v: 1;
  salt: string;
  iv: string;
  data: string;
}

export async function encryptJson(obj: unknown, passphrase: string): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = enc.encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource
  );
  return {
    format: "phoenix-encrypted",
    v: 1,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson(payload: EncryptedBackup, passphrase: string): Promise<any> {
  const salt = fromB64(payload.salt);
  const iv = fromB64(payload.iv);
  const key = await deriveKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    fromB64(payload.data) as BufferSource
  );
  return JSON.parse(dec.decode(plaintext));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
