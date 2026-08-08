import { getStore } from '@netlify/blobs';

/**
 * Zero-knowledge vault.
 *
 * The browser encrypts the entire case file with the survivor's passphrase
 * (AES-GCM, PBKDF2) before it ever leaves her device. This endpoint stores
 * and returns those opaque bytes and nothing else — no account, no email, no
 * plaintext, and no key. Anyone who compromised this store would hold
 * unreadable noise, and a subpoena to the host yields the same.
 *
 * The vault code is the only address, and it is 128 bits of randomness — it
 * is a secret she shares deliberately (with a second device, or with her
 * attorney), never a username.
 */
export const config = { path: '/api/vault' };

const CODE_RE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/;
const MAX_BYTES = 40 * 1024 * 1024; // 40MB — keeps phone syncs quick

export default async (req) => {
  const url = new URL(req.url);
  const code = (url.searchParams.get('code') || '').toUpperCase();
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });

  if (!CODE_RE.test(code)) {
    return json({ error: 'That vault code is not in the right format.' }, 400);
  }

  let store;
  try {
    store = getStore({ name: 'phoenix-vault', consistency: 'strong' });
  } catch {
    return json({ error: 'The vault is not configured on this site yet.' }, 503);
  }

  if (req.method === 'GET') {
    const record = await store.get(code, { type: 'json' });
    if (!record) {
      return json(
        { error: 'No vault found with that code. Check for typos, or make sure it was saved from the other device.' },
        404
      );
    }
    return json(record);
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Malformed request.' }, 400);
    }
    // Ciphertext only. If this does not look like our encrypted envelope, refuse
    // it — the server must never become a place plaintext can land.
    if (
      !body ||
      body.format !== 'phoenix-encrypted' ||
      typeof body.ciphertext !== 'string' ||
      typeof body.salt !== 'string' ||
      typeof body.iv !== 'string'
    ) {
      return json({ error: 'Only encrypted backups can be stored.' }, 400);
    }
    if (body.ciphertext.length > MAX_BYTES) {
      return json(
        { error: 'That backup is too large to sync. Turn off "include photos and videos" and try again.' },
        413
      );
    }
    await store.setJSON(code, { ...body, savedAt: Date.now() });
    return json({ ok: true, savedAt: Date.now() });
  }

  if (req.method === 'DELETE') {
    await store.delete(code);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
};
