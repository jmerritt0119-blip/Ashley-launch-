import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '../../../lib/persona';

// Run on the Node.js runtime so the official SDK and process.env work as expected.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.JARVIS_MODEL || 'claude-opus-4-8';
const ADDRESS = process.env.JARVIS_ADDRESS || 'sir';
// Live web search is on by default; set JARVIS_WEB_SEARCH=0 to disable.
const WEB_SEARCH = process.env.JARVIS_WEB_SEARCH !== '0';

// Marker separating the spoken reply from a trailing JSON array of sources.
// Kept identical in components/Jarvis.jsx.
const SOURCE_SENTINEL = '\n␞__SRC__␞';

// Pull {title, url} out of any web_search_tool_result blocks in the final message.
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

export async function POST(req) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      'My apologies — no API key is configured. Add ANTHROPIC_API_KEY to .env.local and restart me.',
      { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
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

  // Normalise to the Messages API shape and drop anything empty.
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

      // Run one streaming attempt. `useTools` toggles the server-side web search tool.
      const attempt = (useTools) =>
        new Promise((resolve, reject) => {
          const run = client.messages.stream({
            model: MODEL,
            max_tokens: useTools ? 2048 : 1500,
            system,
            messages,
            ...(useTools
              ? {
                  tools: [
                    { type: 'web_search_20260209', name: 'web_search', max_uses: 4 },
                  ],
                }
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
          // If web search isn't available to this account, the request may 400
          // before any text streams. Fall back to a plain (no-tool) completion.
          if (WEB_SEARCH && !emitted) {
            finalMsg = await attempt(false);
          } else {
            throw err;
          }
        }
        // Append any web-search sources after the sentinel (not spoken aloud).
        const sources = extractSources(finalMsg);
        if (sources.length) {
          controller.enqueue(
            encoder.encode(SOURCE_SENTINEL + JSON.stringify(sources))
          );
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
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
