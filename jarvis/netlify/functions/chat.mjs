import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '../../lib/persona.js';

// Standalone Netlify Function (v2) that powers JARVIS. Mapped to /api/chat so
// the front-end calls it exactly as before. Streams Claude's reply.
export const config = { path: '/api/chat' };

const MODEL = process.env.JARVIS_MODEL || 'claude-opus-4-8';
const ADDRESS = process.env.JARVIS_ADDRESS || 'sir';
const WEB_SEARCH = process.env.JARVIS_WEB_SEARCH !== '0';

// Marker separating the spoken reply from a trailing JSON array of sources.
// Kept identical in components/Jarvis.jsx.
const SOURCE_SENTINEL = '\n␞__SRC__␞';

function extractSources(message) {
  const out = [];
  const seen = new Set();
  const blocks = Array.isArray(message?.content) ? message.content : [];
  for (const block of blocks) {
    if (block?.type !== 'web_search_tool_result') continue;
    const results = Array.isArray(block.content) ? block.content : [];
    for (const r of results) {
      if (r?.type === 'web_search_result' && r.url && !seen.has(r.url)) {
        seen.add(r.url);
        out.push({ title: String(r.title || r.url).slice(0, 120), url: String(r.url) });
        if (out.length >= 5) return out;
      }
    }
  }
  return out;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      'My apologies — no API key is configured. Add ANTHROPIC_API_KEY in the site environment variables.',
      { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Malformed request.', { status: 400 });
  }

  const incoming = Array.isArray(body?.messages) ? body.messages : [];
  const ctx = body?.context && typeof body.context === 'object' ? body.context : {};

  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content ?? '') }))
    .filter((m) => m.content.trim().length > 0);

  if (messages.length === 0) {
    return new Response('There was nothing to respond to.', { status: 400 });
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();
  const system = buildSystemPrompt(ADDRESS, {
    time: typeof ctx.time === 'string' ? ctx.time.slice(0, 120) : undefined,
    tz: typeof ctx.tz === 'string' ? ctx.tz.slice(0, 60) : undefined,
    webSearch: WEB_SEARCH,
  });

  const stream = new ReadableStream({
    async start(controller) {
      let emitted = false;

      const attempt = (useTools) =>
        new Promise((resolve, reject) => {
          const run = client.messages.stream({
            model: MODEL,
            max_tokens: useTools ? 2048 : 1500,
            system,
            messages,
            ...(useTools
              ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }] }
              : {}),
          });
          run.on('text', (text) => {
            emitted = true;
            controller.enqueue(encoder.encode(text));
          });
          run.finalMessage().then(resolve, reject);
        });

      try {
        let finalMsg;
        try {
          finalMsg = await attempt(WEB_SEARCH);
        } catch (err) {
          if (WEB_SEARCH && !emitted) {
            finalMsg = await attempt(false);
          } else {
            throw err;
          }
        }
        const sources = extractSources(finalMsg);
        if (sources.length) {
          controller.enqueue(encoder.encode(SOURCE_SENTINEL + JSON.stringify(sources)));
        }
        controller.close();
      } catch (err) {
        const status = err?.status;
        let message;
        if (status === 401) {
          message = 'My credentials were rejected — the API key appears to be invalid.';
        } else if (status === 429) {
          message = 'We are being rate limited at the moment. A short pause should clear it.';
        } else if (status === 529 || status === 500) {
          message = 'The service is briefly overloaded. Do try me again in a moment.';
        } else {
          message = 'I encountered an unexpected fault while thinking that through.';
        }
        try {
          if (!emitted) controller.enqueue(encoder.encode(message));
        } catch {}
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    },
  });
};
