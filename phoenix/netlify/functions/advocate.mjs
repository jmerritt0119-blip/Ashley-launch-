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

const CUT_SHORT =
  "---\n**That answer ran long and stopped before I finished.** Nothing is wrong with your case or your file. Type **continue** and I'll pick up exactly where I left off.";

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

  // Where the caller has marked the boundary between the instructions that
  // never change and the messages that do, cut there and cache the first half.
  //
  // A Deep Scan sends ~29,000 characters of identical instructions in front of
  // every part — 59 times for her archive, at full price each time, for text
  // the model was handed thirty seconds earlier. Cached, those reads cost a
  // tenth as much. The marker itself is a split point and is discarded, so the
  // model sees exactly what it saw before, and a request without one is passed
  // through untouched.
  const CACHE_BREAK = '\n<<<PHOENIX-CACHE-BREAK>>>\n';
  const asContent = (text) => {
    const at = text.indexOf(CACHE_BREAK);
    if (at < 0) return text;
    const stable = text.slice(0, at);
    const rest = text.slice(at + CACHE_BREAK.length);
    return [
      { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: rest },
    ];
  };

  const incoming = Array.isArray(body?.messages) ? body.messages : [];
  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 200000) }))
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: asContent(m.content) }));
  if (messages.length === 0) return new Response('There was nothing to respond to.', { status: 400 });

  const model = ALLOWED_MODELS.has(body?.model) ? body.model : DEFAULT_MODEL;
  const caseContext =
    typeof body?.caseContext === 'string' && body.caseContext.trim()
      ? body.caseContext.slice(0, 900000)
      : null;

  const system = [{ type: 'text', text: ADVOCATE_SYSTEM, cache_control: { type: 'ephemeral' } }];
  if (caseContext) {
    // Cached too: her case file is large and stable within a conversation, so
    // follow-up questions read it at cache rates instead of paying full price.
    system.push({
      type: 'text',
      text: `The survivor has shared her current case file with you:\n\n${caseContext}`,
      cache_control: { type: 'ephemeral' },
    });
  }

  // Talk to Anthropic DIRECTLY — never through a gateway.
  //
  // `new Anthropic()` with no arguments honours ANTHROPIC_BASE_URL from the
  // environment. Netlify's AI Gateway sets that, so without anyone choosing it,
  // every Claude call was being proxied and billed by Netlify as "AI inference"
  // credits — out of the same pool that keeps the site online. That line was
  // 94.5% of the bill (6,415 credits) against 10.8 for all compute, and when it
  // ran dry the whole site went down, not just the AI.
  //
  // Pinning the base URL means the tokens bill to the project's own Anthropic
  // account at Anthropic's rates, and an AI balance can never take her app
  // offline again. Set PHOENIX_ANTHROPIC_BASE_URL only to deliberately choose a
  // gateway.
  const client = new Anthropic({
    baseURL: process.env.PHOENIX_ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  });
  const encoder = new TextEncoder();

  // Deep Scan asks for strict JSON and is chunked; chat is the conversation.
  // Stated explicitly rather than inferred from whether search is on, because
  // search is now off for both and would no longer tell them apart.
  const isChat = body?.mode !== 'scan';

  // Web search is OFF by default, deliberately.
  //
  // It used to run on every chat turn. The cost was a visible stall and a
  // "_Checking current Texas law…_" interruption in the middle of a frightened
  // woman's answer, to re-derive statutes the model already knows cold — the
  // Texas Family Code provisions her case turns on are written into the system
  // prompt with their section numbers. Answering from that is both faster and
  // steadier. Opt in per request when something genuinely current is needed.
  const TOOLS =
    body?.webSearch === true
      ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }]
      : undefined;

  // Marks a clean finish. Without it, a stream that dies mid-answer is
  // indistinguishable from one that ended — which is exactly how she was shown
  // "Good. Now here is the answer." and then nothing at all.
  const DONE = '\u0004';
  // Keeps the response alive while the model is still reading.
  //
  // The platform needs to see a response START soon after the request
  // arrives. A scan part carries ~8,000 tokens of instructions plus her
  // messages, and Opus spends long enough reading that before it emits its
  // first character that the gateway gives up — a 504, which is the failure
  // that has driven part sizes down from 60,000 characters to 16,000 today
  // without ever fixing the cause.
  //
  // One byte, sent the instant the stream opens and repeated every few
  // seconds until real text arrives, means the response is already in
  // progress and the model can take as long as it needs. The client strips
  // these before anything — above all the JSON parser — sees them.
  const BEAT = '\u0006';

  const stream = new ReadableStream({
    async start(controller) {
      let emitted = false;
      let searching = false;
      // Immediately, before a single token has been read.
      controller.enqueue(encoder.encode(BEAT));
      const beat = setInterval(() => {
        if (emitted) return;
        try {
          controller.enqueue(encoder.encode(BEAT));
        } catch {
          /* stream already closed */
        }
      }, 3000);
      const stopBeat = () => clearInterval(beat);

      const runOnce = (withFallbacks, convo) =>
        new Promise((resolve, reject) => {
          // Effort and budget are set PER MODE, and the difference matters.
          //
          // Chat is one answer to one frightened question: xhigh, and 32000
          // tokens because the budget covers thinking AND the answer, and a
          // custody question spends most of it reasoning — 16000 is what cut an
          // answer off at the exact moment it was about to start.
          //
          // Deep Scan is sixty-odd sequential parts over a whole archive. It
          // runs at 'high' because that is what completes. Raising it to xhigh
          // made every part slow enough to die mid-stream, and a real 63-part
          // scan failed 63 times out of 63. It emits JSON, not prose; the extra
          // effort bought nothing and cost her the entire scan.
          //
          // Deep Scan gets NO extended thinking, and that is the difference
          // between a scan that finishes and one that dies.
          //
          // With adaptive thinking the model reasons before it emits anything,
          // so no text streams at all during that phase. On a real archive —
          // 3.7 million characters, 125 parts — the browser sat on the same
          // character count for a minute at a time, which is indistinguishable
          // from the app having frozen, and the function was killed by the
          // platform's execution limit before the JSON ever arrived.
          //
          // Cataloging is extraction, not reasoning: read the messages, emit
          // the JSON. Dropping thinking makes text start immediately, finishes
          // each part in a fraction of the time, and cuts both the token bill
          // and the function runtime Netlify charges for.
          const params = {
            model,
            // Chat and scan do NOT get the same ceiling, and conflating them
            // is what produced 504s on her first real run of the day.
            //
            // Raising a ceiling is only free if nothing is timed. This function
            // is timed: the platform kills it at a fixed wall-clock limit, and
            // #52 established on her own archive that what decides whether a
            // part survives is how much JSON it has to write. A generous
            // ceiling on a dense part is therefore not headroom, it is rope —
            // and the parts dense enough to use it are her worst weeks, the
            // evidence that matters most.
            //
            // Chat keeps 32,000: one answer, and a custody question spends most
            // of its budget thinking. Scan gets 10,000, below the 16,000 that
            // was surviving on Sonnet, because Opus writes the same catalog
            // more slowly and the limit is wall-clock, not tokens.
            max_tokens: isChat ? 32000 : 3000,
            system,
            messages: convo,
            ...(isChat ? { thinking: { type: 'adaptive' } } : {}),
            // effort is set only for chat. Combining it with thinking disabled
            // is the one parameter combination in this request that was never
            // exercised before every single part of a 473-part scan failed, and
            // an unfamiliar combination is the first thing to remove when the
            // failure rate is 100% — that pattern is a rejected request, not a
            // timeout, because a timeout spares the sparse parts.
            ...(isChat ? { output_config: { effort: 'xhigh' } } : {}),
            ...(TOOLS ? { tools: TOOLS } : {}),
          };
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
          // Tell her something is happening while a search round-trips.
          run.on('contentBlock', (block) => {
            if (block?.type === 'server_tool_use' && !searching) {
              searching = true;
              controller.enqueue(encoder.encode('\n_Checking current Texas law…_\n\n'));
            }
          });
          run.finalMessage().then(resolve, reject);
        });

      /**
       * Server-side tools run in a bounded loop; when it hits the limit the
       * turn ends with stop_reason "pause_turn" and must be resumed by
       * re-sending the conversation with the paused assistant turn appended.
       */
      const runWithResume = async (withFallbacks) => {
        let convo = messages;
        let finalMsg;
        for (let i = 0; i < 4; i++) {
          finalMsg = await runOnce(withFallbacks, convo);
          if (finalMsg?.stop_reason !== 'pause_turn') return finalMsg;
          convo = [...convo, { role: 'assistant', content: finalMsg.content }];
        }
        return finalMsg;
      };

      try {
        let finalMsg;
        try {
          finalMsg = await runWithResume(true);
        } catch (err) {
          if (!emitted) finalMsg = await runWithResume(false);
          else throw err;
        }
        if (finalMsg?.stop_reason === 'refusal') {
          controller.enqueue(encoder.encode('\n\n' + REFUSAL_NOTE));
        }
        // An answer that stops early must SAY it stopped early. Silence here is
        // what left her looking at "Good. Now here is the answer." and nothing
        // else — the worst possible failure for someone who asked because she
        // was frightened. Chat only; Deep Scan parses this stream as JSON.
        if (isChat && (finalMsg?.stop_reason === 'max_tokens' || finalMsg?.stop_reason === 'pause_turn')) {
          controller.enqueue(encoder.encode('\n\n' + CUT_SHORT));
        }
        stopBeat();
        controller.enqueue(encoder.encode(DONE));
        controller.close();
      } catch (err) {
        stopBeat();
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
        } else if (low.includes('usage limit') || low.includes('spend limit') || low.includes('regain access')) {
          // Distinct from both rate limiting and running out of credit: a
          // ceiling somebody configured on the account, which does not clear
          // by waiting a moment or by adding money. Kept explicit so whoever
          // runs this site can see the real reason in the deploy check and the
          // function logs. The app never shows this sentence to her — the
          // client treats it as fatal and renders a neutral message instead.
          message = `The account's configured API usage limit has been reached. Raise the limit in the Anthropic console — adding credit alone will not clear it. ${raw.slice(0, 120)}`;
        } else if (status === 429) {
          message = 'Rate limited at the moment — a short pause should clear it.';
        } else if (status === 529 || status === 500) {
          message = 'The service is briefly overloaded. Try again in a moment.';
        } else {
          message = raw ? `Something went wrong: ${raw.slice(0, 150)}` : 'Something went wrong. Try again.';
        }
        try {
          if (!emitted) controller.enqueue(encoder.encode(message));
          // A handled error is still a deliberate ending — mark it clean so the
          // client reports this reason rather than stacking a second warning.
          controller.enqueue(encoder.encode(DONE));
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
