import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { ADVOCATE_SYSTEM } from "./advocatePrompt";

export { ADVOCATE_SYSTEM };

export const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  {
    label: "Protect my daughter",
    prompt:
      "My child's other parent is dangerous. Using my case snapshot, lay out the legal protections I should be pursuing to keep my child safe — protective orders covering her, emergency custody, supervised or suspended visitation, safe exchanges — what documentation each one needs, and exactly what to ask my attorney or the court. Flag anything I should act on immediately.",
  },
  {
    label: "Build my timeline",
    prompt:
      "Using my case snapshot, build a chronological summary of the abuse and key events, grouped by pattern, in a format I could hand to my attorney.",
  },
  {
    label: "Find the patterns",
    prompt:
      "Analyze my incident log and starred messages for patterns — threats, coercive control, financial abuse, custody interference, monitoring. List each pattern with the specific entries that support it.",
  },
  {
    label: "Draft a declaration outline",
    prompt:
      "Draft an outline of a declaration describing the history of abuse and the danger to my child, based on my incident log, that I can review with my attorney. Use neutral, factual, first-person language.",
  },
  {
    label: "Prep for a custody hearing",
    prompt:
      "Prepare me for a custody hearing where the other parent is abusive. What will the court focus on, what should my evidence binder contain from my records, how do I testify about the abuse calmly and credibly, and what requests should I be ready to make?",
  },
  {
    label: "Prep for an attorney consult",
    prompt:
      "Give me a checklist of questions to ask in a divorce attorney consultation given the history of abuse and the danger to my child, plus exactly which documents I should bring from my records.",
  },
  {
    label: "What am I missing?",
    prompt:
      "Audit my documentation so far. What is missing, weak, or uncorroborated? Give me a prioritized, lawful to-do list to strengthen the divorce and custody case.",
  },
];

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

/** Compact plain-text snapshot of the case for AI context. */
export async function buildCaseSnapshot(): Promise<string> {
  const [incidents, messages, evidence, financials] = await Promise.all([
    db.incidents.orderBy("date").reverse().limit(40).toArray(),
    db.messages.orderBy("date").reverse().limit(200).toArray(),
    db.evidence.orderBy("date").reverse().limit(40).toArray(),
    db.financials.toArray(),
  ]);
  const starred = messages.filter((m) => m.starred).slice(0, 50);

  const lines: string[] = [];
  lines.push(`CASE SNAPSHOT (generated ${new Date().toISOString().slice(0, 10)})`);
  lines.push(
    `Totals: ${incidents.length} incidents (most recent shown), ${messages.length} messages on file (${starred.length} starred), ${evidence.length} evidence items, ${financials.length} financial entries.`
  );

  if (incidents.length) {
    lines.push("\nINCIDENT LOG (newest first):");
    for (const i of incidents) {
      lines.push(
        `- ${i.date}${i.time ? " " + i.time : ""} | sev ${i.severity}/5 | [${i.categories.join(", ")}]${
          i.childrenPresent ? " | children present" : ""
        }${i.policeReport ? ` | police report: ${i.policeReport}` : ""}${
          i.medical ? ` | medical: ${trunc(i.medical, 60)}` : ""
        } | ${i.title}: ${trunc(i.narrative, 240)}`
      );
    }
  }

  if (starred.length) {
    lines.push("\nSTARRED MESSAGES (flagged as significant):");
    for (const m of starred) {
      lines.push(
        `- ${m.date} | ${m.sender}${m.tags.length ? ` | [${m.tags.join(", ")}]` : ""}: "${trunc(m.text, 240)}"`
      );
    }
  }

  if (evidence.length) {
    lines.push("\nEVIDENCE INDEX:");
    for (const e of evidence) {
      lines.push(
        `- ${e.date} | ${e.kind} | ${e.title}${e.tags.length ? ` | [${e.tags.join(", ")}]` : ""}${
          e.notes ? ` | ${trunc(e.notes, 120)}` : ""
        }`
      );
    }
  }

  if (financials.length) {
    const sum = (t: string) =>
      financials.filter((f) => f.type === t).reduce((a, f) => a + (f.value || 0), 0);
    lines.push("\nFINANCIALS:");
    lines.push(
      `Totals — assets $${sum("asset").toLocaleString()}, debts $${sum("debt").toLocaleString()}, monthly income $${sum(
        "income"
      ).toLocaleString()}, monthly expenses $${sum("expense").toLocaleString()}.`
    );
    for (const f of financials.slice(0, 40)) {
      lines.push(
        `- ${f.type} | ${f.name} | $${(f.value || 0).toLocaleString()} | owner: ${f.owner}${
          f.separateProperty ? " | claimed separate property" : ""
        }${f.notes ? ` | ${trunc(f.notes, 100)}` : ""}`
      );
    }
  }

  return lines.join("\n");
}

export interface AdvocateTurn {
  role: "user" | "assistant";
  content: string;
}

const REFUSAL_NOTE =
  "I wasn't able to answer that one — the request tripped a safety filter on the model. Rephrase it (or ask me a different way) and I'll keep working. Nothing about your case was lost.";

export interface AdvocateOpts {
  connection: "server" | "direct";
  apiKey: string;
  model: string;
  history: AdvocateTurn[];
  caseContext: string | null;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream a reply from The Advocate. Two paths:
 *  - "server": POST /api/advocate — a Netlify Function holds the API key
 *    (same pattern and env var as the rest of this repo's deployments).
 *  - "direct": call Anthropic straight from the browser with the user's own
 *    key (stored only on their device). Useful for local use.
 */
export async function streamAdvocate(opts: AdvocateOpts): Promise<string> {
  return opts.connection === "server" ? viaServer(opts) : viaDirect(opts);
}

async function viaServer(opts: AdvocateOpts): Promise<string> {
  const res = await fetch("/api/advocate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      messages: opts.history,
      caseContext: opts.caseContext,
      model: opts.model,
    }),
  });
  if (res.status === 404) {
    throw new Error(
      "The site's AI endpoint isn't available here. If you're running locally, use `netlify dev`, or switch Settings → AI connection to \"My own API key\"."
    );
  }
  if (!res.ok || !res.body) {
    throw new Error(`The AI endpoint returned an error (${res.status}). Try again in a moment.`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) {
      full += text;
      opts.onDelta(text);
    }
  }
  return full;
}

async function viaDirect(opts: AdvocateOpts): Promise<string> {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true, // user-supplied key, stored only on their device
  });

  const system: any[] = [
    { type: "text", text: ADVOCATE_SYSTEM, cache_control: { type: "ephemeral" } },
  ];
  if (opts.caseContext) {
    system.push({
      type: "text",
      text: `The survivor has shared her current case file with you:\n\n${opts.caseContext}`,
    });
  }

  const params: any = {
    model: opts.model,
    max_tokens: 16000,
    system,
    messages: opts.history.map((t) => ({ role: t.role, content: t.content })),
    betas: ["server-side-fallback-2026-07-01"],
    // If a safety classifier declines (possible when quoting abusive messages),
    // automatically retry on Anthropic's recommended fallback model.
    fallbacks: "default",
  };

  let final: any;
  try {
    const stream = client.beta.messages.stream(params, { signal: opts.signal });
    stream.on("text", (delta: string) => opts.onDelta(delta));
    final = await stream.finalMessage();
  } catch (err: any) {
    // Older accounts/SDK combinations may reject the fallback beta — retry plain.
    if (err?.status === 400 && params.fallbacks) {
      delete params.fallbacks;
      delete params.betas;
      const stream = client.messages.stream(params, { signal: opts.signal });
      stream.on("text", (delta: string) => opts.onDelta(delta));
      final = await stream.finalMessage();
    } else {
      throw err;
    }
  }

  let full = final.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  if (final.stop_reason === "refusal") {
    opts.onDelta("\n\n" + REFUSAL_NOTE);
    full += "\n\n" + REFUSAL_NOTE;
  }
  return full;
}
