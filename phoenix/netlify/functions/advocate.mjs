import Anthropic from '@anthropic-ai/sdk';
import { ADVOCATE_SYSTEM } from '../../src/advocatePrompt.ts';

// Streaming Netlify Function (v2) that powers The Advocate. Same architecture
// as the other apps in this repo: the ANTHROPIC_API_KEY lives in the site's
// environment variables and never reaches the browser.
export const config = { path: '/api/advocate' };

const DEFAULT_MODEL = process.env.PHOENIX_MODEL || 'claude-opus-5';
const ALLOWED_MODELS = new Set([
  'claude-opus-5',
  'claude-fable-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
]);

const REFUSAL_NOTE =
  "I wasn't able to answer that one — the request tripped a safety filter on the model. Rephrase it (or ask me a different way) and I'll keep working. Nothing about your case was lost.";

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      'No API key is configured for this site. Add ANTHROPIC_API_KEY in the Netlify environment variables.',
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
  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 200000) }))
    .filter((m) => m.content.trim().length > 0);
  if (messages.length === 0) return new Response('There was nothing to respond to.', { status: 400 });

  const model = ALLOWED_MODELS.has(body?.model) ? body.model : DEFAULT_MODEL;
  const caseContext =
    typeof body?.caseContext === 'string' && body.caseContext.trim()
      ? body.caseContext.slice(0, 400000)
      : null;

  const system = [{ type: 'text', text: ADVOCATE_SYSTEM, cache_control: { type: 'ephemeral' } }];
  if (caseContext) {
    system.push({
      type: 'text',
      text: `The survivor has shared her current case file with you:\n\n${caseContext}`,
    });
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let emitted = false;

      const runOnce = (withFallbacks) =>
        new Promise((resolve, reject) => {
          const params = { model, max_tokens: 8000, system, messages };
          let run;
          if (withFallbacks) {
            // Retry safety-classifier declines on Anthropic's recommended
            // fallback model automatically (server-side fallback beta).
            run = client.beta.messages.stream({
              ...params,
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
            });
          } else {
            run = client.messages.stream(params);
          }
          run.on('text', (text) => {
            emitted = true;
            controller.enqueue(encoder.encode(text));
          });
          run.finalMessage().then(resolve, reject);
        });

      try {
        let finalMsg;
        try {
          finalMsg = await runOnce(true);
        } catch (err) {
          if (!emitted) finalMsg = await runOnce(false);
          else throw err;
        }
        if (finalMsg?.stop_reason === 'refusal') {
          controller.enqueue(encoder.encode('\n\n' + REFUSAL_NOTE));
        }
        controller.close();
      } catch (err) {
        const status = err?.status;
        const raw = (err?.error?.error?.message || err?.error?.message || err?.message || '').toString();
        const low = raw.toLowerCase();
        let message;
        if (status === 401 || low.includes('authentication') || low.includes('x-api-key')) {
          message = 'The Anthropic API key configured for this site was rejected — double-check it in the Netlify environment variables.';
        } else if (status === 402 || low.includes('credit') || low.includes('balance') || low.includes('billing')) {
          message = 'The Anthropic account is out of credit. Add billing credit in the Anthropic console, then try again.';
        } else if (status === 404 || (low.includes('model') && (low.includes('not') || low.includes('found')))) {
          message = `That model is not available on this account. Try switching models in Settings. ${raw.slice(0, 120)}`;
        } else if (status === 429) {
          message = 'Rate limited at the moment — a short pause should clear it.';
        } else if (status === 529 || status === 500) {
          message = 'The service is briefly overloaded. Try again in a moment.';
        } else {
          message = raw ? `Something went wrong: ${raw.slice(0, 150)}` : 'Something went wrong. Try again.';
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
