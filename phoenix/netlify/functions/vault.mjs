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

  // Every save is kept as a numbered version and the pointer moved forward.
  // She is told to share the vault code with her attorney, so the code cannot
  // be treated as a write credential: anyone holding it — including an abuser
  // who photographs her Recovery Kit — must not be able to destroy or silently
  // replace her case. Old versions survive any overwrite, and there is no
  // delete route at all.
  const KEEP_VERSIONS = 10;

  if (req.method === 'GET') {
    const wanted = url.searchParams.get('version');
    const head = await store.get(`${code}/head`, { type: 'json' });
    const version = wanted ? parseInt(wanted, 10) : head?.version;
    let record = version ? await store.get(`${code}/v${version}`, { type: 'json' }) : null;
    // Carry forward vaults written before versioning existed — a survivor who
    // already saved her case must never find it missing after an upgrade.
    if (!record && !wanted) {
      const legacy = await store.get(code, { type: 'json' });
      if (legacy) return json({ ...legacy, version: 0, latestVersion: 0, legacy: true });
    }
    if (!record) {
      return json(
        { error: 'No vault found with that code. Check for typos, or make sure it was saved from the other device.' },
        404
      );
    }
    return json({ ...record, version, latestVersion: head?.version ?? version });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Malformed request.' }, 400);
    }
    // Ciphertext only. If this does not look like our encrypted envelope, refuse
    // it — the server must never become a place plaintext can land. The field
    // names here must match what crypto.ts `encryptJson` actually produces:
    // { format, v, salt, iv, data }.
    if (
      !body ||
      body.format !== 'phoenix-encrypted' ||
      typeof body.data !== 'string' ||
      typeof body.salt !== 'string' ||
      typeof body.iv !== 'string'
    ) {
      return json({ error: 'Only encrypted backups can be stored.' }, 400);
    }
    if (body.data.length > MAX_BYTES) {
      return json(
        { error: 'That backup is too large to sync. Turn off "include photos and videos" and try again.' },
        413
      );
    }
    const head = await store.get(`${code}/head`, { type: 'json' });
    // A pre-versioning vault becomes v1's predecessor rather than being lost.
    if (!head) {
      const legacy = await store.get(code, { type: 'json' });
      if (legacy) await store.setJSON(`${code}/v0`, { ...legacy, version: 0 });
    }
    const version = (head?.version ?? 0) + 1;
    const savedAt = Date.now();
    await store.setJSON(`${code}/v${version}`, { ...body, savedAt, version });
    await store.setJSON(`${code}/head`, { version, savedAt });
    // Prune well beyond the retention window so a wipe attempt still leaves
    // every recent good copy intact.
    const stale = version - KEEP_VERSIONS;
    if (stale > 0) await store.delete(`${code}/v${stale}`).catch(() => {});
    return json({ ok: true, savedAt, version });
  }

  return json({ error: 'Method not allowed' }, 405);
};
