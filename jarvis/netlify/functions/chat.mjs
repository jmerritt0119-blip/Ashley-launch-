import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { buildSystemPrompt } from '../../lib/persona.js';

// Standalone Netlify Function (v2) that powers JARVIS. Mapped to /api/chat so
// the front-end calls it exactly as before. Streams Claude's reply, can search
// the web, and — when paired — dispatch actions to the user's Mac.
export const config = { path: '/api/chat' };

const MODEL = process.env.JARVIS_MODEL || 'claude-opus-4-8';
const ADDRESS = process.env.JARVIS_ADDRESS || 'sir';
const WEB_SEARCH = process.env.JARVIS_WEB_SEARCH !== '0';

// Marker separating the spoken reply from a trailing JSON array of sources.
// Kept identical in components/Jarvis.jsx.
const SOURCE_SENTINEL = '\n␞__SRC__␞';

const CONTROL_TOOL = {
  name: 'control_computer',
  description:
    "Perform an action on the user's Mac (a local agent is running). Use ONLY when the " +
    'user asks you to do something on their computer: open an app, open a website, speak ' +
    'aloud on the Mac, show a notification, report system info, or run a command. After ' +
    'calling it, confirm briefly in your spoken reply.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['open_app', 'open_url', 'say', 'notify', 'system_info', 'applescript', 'shell'],
        description: 'What to do on the Mac.',
      },
      target: { type: 'string', description: 'App name (open_app) or URL (open_url).' },
      text: { type: 'string', description: 'Text to speak (say) or show (notify).' },
      command: { type: 'string', description: 'AppleScript or shell command, if applicable.' },
    },
    required: ['action'],
  },
};

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

async function dispatchToMac(code, input) {
  const store = getStore('jarvis-relay');
  const key = `queue_${code}`;
  const cur = (await store.get(key, { type: 'json' })) || [];
  cur.push({ id: crypto.randomUUID(), at: Date.now(), ...input });
  await store.setJSON(key, cur.slice(-25));
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
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
  const pairCode = typeof body?.pairCode === 'string' ? body.pairCode.trim().slice(0, 64) : '';

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
    computer: !!pairCode,
  });

  const stream = new ReadableStream({
    async start(controller) {
      let emitted = false;

      const tools = [];
      if (WEB_SEARCH) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 4 });
      if (pairCode) tools.push(CONTROL_TOOL);

      const runOnce = (convo, useTools, useThinking) =>
        new Promise((resolve, reject) => {
          const run = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system,
            ...(useThinking ? { thinking: { type: 'adaptive' } } : {}),
            messages: convo,
            ...(useTools && tools.length ? { tools } : {}),
          });
          run.on('text', (text) => {
            emitted = true;
            controller.enqueue(encoder.encode(text));
          });
          run.finalMessage().then(resolve, reject);
        });

      try {
        const convo = messages.slice();
        let finalMsg;
        try {
          // Agentic loop: stream, and if Claude calls control_computer, dispatch
          // it to the Mac and continue until he produces a final spoken reply.
          for (let i = 0; i < 5; i++) {
            finalMsg = await runOnce(convo, true, true);
            if (finalMsg.stop_reason !== 'tool_use') break;
            const calls = (finalMsg.content || []).filter(
              (b) => b.type === 'tool_use' && b.name === 'control_computer'
            );
            if (!calls.length) break;
            const results = [];
            for (const call of calls) {
              let note = 'Dispatched to your Mac.';
              try {
                if (pairCode) await dispatchToMac(pairCode, call.input || {});
                else note = 'No Mac is paired right now.';
              } catch {
                note = 'I could not reach the relay just now.';
              }
              results.push({ type: 'tool_result', tool_use_id: call.id, content: note });
            }
            convo.push({ role: 'assistant', content: finalMsg.content });
            convo.push({ role: 'user', content: results });
          }
        } catch (err) {
          // Anything failed before output → plain, guaranteed-compatible reply.
          if (!emitted) {
            finalMsg = await runOnce(messages.slice(), false, false);
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
        const raw = (
          err?.error?.error?.message ||
          err?.error?.message ||
          err?.message ||
          ''
        ).toString();
        const low = raw.toLowerCase();
        let message;
        if (status === 401 || low.includes('authentication') || low.includes('x-api-key')) {
          message =
            'My credentials were rejected, sir. The Anthropic API key appears to be invalid — please double-check it in the site settings.';
        } else if (status === 402 || low.includes('credit') || low.includes('balance') || low.includes('billing')) {
          message =
            'My core is starved for power, sir: the Anthropic account is out of credit. Add a little billing credit in the Anthropic console, then try me again.';
        } else if (status === 404 || (low.includes('model') && (low.includes('not') || low.includes('found')))) {
          message = `That model is not available on this account. ${raw.slice(0, 120)}`;
        } else if (status === 403) {
          message = `Access was denied. ${raw.slice(0, 120)}`;
        } else if (status === 429) {
          message = 'We are being rate limited at the moment, sir. A short pause should clear it.';
        } else if (status === 529 || status === 500) {
          message = 'The service is briefly overloaded. Do try me again in a moment.';
        } else {
          message = raw
            ? `I hit a fault, sir: ${raw.slice(0, 150)}`
            : 'I encountered an unexpected fault.';
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
