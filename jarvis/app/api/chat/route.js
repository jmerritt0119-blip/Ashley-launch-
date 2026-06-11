import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '../../../lib/persona';

// Run on the Node.js runtime so the official SDK and process.env work as expected.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.JARVIS_MODEL || 'claude-opus-4-8';
const ADDRESS = process.env.JARVIS_ADDRESS || 'sir';

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

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const run = client.messages.stream({
          model: MODEL,
          max_tokens: 1500,
          system: buildSystemPrompt(ADDRESS),
          messages,
        });

        run.on('text', (text) => {
          controller.enqueue(encoder.encode(text));
        });

        await run.finalMessage();
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
          controller.enqueue(encoder.encode(message));
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
