import Anthropic from '@anthropic-ai/sdk';
import { ADVOCATE_SYSTEM } from '../../lib/advocate-prompt';

// Streaming endpoint for The Advocate (Phoenix app, served from
// public/phoenix/). The ANTHROPIC_API_KEY lives in the Vercel project's
// environment variables and never reaches the browser.
export const config = {
  api: { responseLimit: false },
  maxDuration: 60,
};

const DEFAULT_MODEL = process.env.PHOENIX_MODEL || 'claude-opus-5';
const ALLOWED_MODELS = new Set([
  'claude-opus-5',
  'claude-fable-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
]);

const REFUSAL_NOTE =
  "I wasn't able to answer that one — the request tripped a safety filter on the model. Rephrase it (or ask me a different way) and I'll keep working. Nothing about your case was lost.";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res
      .status(200)
      .setHeader('content-type', 'text/plain; charset=utf-8')
      .send(
        'No API key is configured for this site. Add ANTHROPIC_API_KEY in the Vercel project environment variables (Settings → Environment Variables), then redeploy.'
      );
    return;
  }

  const body = req.body || {};
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 200000) }))
    .filter((m) => m.content.trim().length > 0);
  if (messages.length === 0) {
    res.status(400).send('There was nothing to respond to.');
    return;
  }

  const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
  const caseContext =
    typeof body.caseContext === 'string' && body.caseContext.trim()
      ? body.caseContext.slice(0, 400000)
      : null;

  const system = [{ type: 'text', text: ADVOCATE_SYSTEM, cache_control: { type: 'ephemeral' } }];
  if (caseContext) {
    system.push({
      type: 'text',
      text: `The survivor has shared her current case file with you:\n\n${caseContext}`,
    });
  }

  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
  });

  const client = new Anthropic();
  let emitted = false;

  const runOnce = (withFallbacks) =>
    new Promise((resolve, reject) => {
      const params = { model, max_tokens: 6000, system, messages };
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
        res.write(text);
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
      res.write('\n\n' + REFUSAL_NOTE);
    }
  } catch (err) {
    const status = err?.status;
    const raw = (err?.error?.error?.message || err?.error?.message || err?.message || '').toString();
    const low = raw.toLowerCase();
    let message;
    if (status === 401 || low.includes('authentication') || low.includes('x-api-key')) {
      message =
        'The Anthropic API key configured for this site was rejected — double-check ANTHROPIC_API_KEY in the Vercel environment variables.';
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
    if (!emitted) res.write(message);
  }
  res.end();
}
