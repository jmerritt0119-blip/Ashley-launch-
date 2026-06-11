import { getStore } from '@netlify/blobs';

// Relay between the phone (JARVIS) and the Mac agent. The chat function pushes
// commands into a per-pairing-code queue (Netlify Blobs); the Mac agent polls
// this endpoint to pick them up and (optionally) posts results back.
export const config = { path: '/api/agent' };

const queueKey = (code) => `queue_${code}`;
const resultKey = (code) => `result_${code}`;
const seenKey = (code) => `seen_${code}`;

export default async (req) => {
  const url = new URL(req.url);
  const code = (url.searchParams.get('code') || '').trim();
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });

  if (!code) return json({ commands: [] });

  let store;
  try {
    store = getStore('jarvis-relay');
  } catch {
    return json({ commands: [], online: false });
  }

  if (req.method === 'GET') {
    // Phone asks whether the Mac agent is alive (doesn't touch the queue).
    if (url.searchParams.get('status')) {
      const seen = (await store.get(seenKey(code), { type: 'json' })) || 0;
      return json({ online: Date.now() - Number(seen) < 8000 });
    }
    // Agent poll: record a heartbeat, then hand over + clear pending commands.
    await store.setJSON(seenKey(code), Date.now());
    const pending = (await store.get(queueKey(code), { type: 'json' })) || [];
    if (pending.length) await store.setJSON(queueKey(code), []);
    return json({ commands: pending });
  }

  if (req.method === 'POST') {
    // Agent reports a result (optional; kept small for the phone to read back).
    let body = {};
    try {
      body = await req.json();
    } catch {}
    const log = (await store.get(resultKey(code), { type: 'json' })) || [];
    log.unshift({ at: Date.now(), ...body });
    await store.setJSON(resultKey(code), log.slice(0, 20));
    return json({ ok: true });
  }

  return json({ ok: false }, 405);
};
