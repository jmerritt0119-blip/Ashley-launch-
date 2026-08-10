import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { ADVOCATE_SYSTEM } from "./advocatePrompt";
import { SCAN_CACHE_BREAK } from "./scan";

export { ADVOCATE_SYSTEM };

export const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  {
    label: "Protect my daughter",
    prompt:
      "My child's other parent is dangerous. Using my case snapshot, lay out the legal protections I should be pursuing to keep my child safe — protective orders covering her, emergency custody, supervised or suspended visitation, safe exchanges — what documentation each one needs, and exactly what to ask my attorney or the court. Flag anything I should act on immediately.",
  },
  {
    label: "Get a Texas protective order",
    prompt:
      "Walk me through getting a protective order in Texas that covers me and my daughter. Tell me: which type I should be seeking (temporary ex parte vs final, and whether a Magistrate's Order for Emergency Protection may already exist from any arrest), what evidence from my case file supports each required finding, exactly where and how to file in my county, whether the district attorney's office or legal aid can file it for me at no cost, what it can order him to do, and what happens if he violates it. Ask me for my county if you need it.",
  },
  {
    label: "What Texas law says about my case",
    prompt:
      "Using my case file, explain where I stand under Texas law specifically. Cover: conservatorship and possession under the Texas Family Code given the family violence in my record, what the community property division could look like and whether the abuse supports a disproportionate share, whether I may qualify for spousal maintenance, and what the 60-day waiting period means for my timeline. Cite the Family Code sections, and mark clearly which points are strong, which need more evidence, and which I must confirm with my attorney.",
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
    label: "Practice cross-examination",
    prompt:
      "Put me through cross-examination practice. You are his attorney and you are trying to make me look unreliable, vindictive, or exaggerating. Using the actual weak points, gaps, and inconsistencies in my case file, ask me ONE hard question at a time and wait for my answer. After each answer, tell me plainly how it would land in a Texas courtroom, what I said that hurt me, and how to say it better — short, factual, no arguing with the lawyer, no speculating. Start with the hardest question you can find in my record.",
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

/**
 * Single control character the server appends when it ends an answer on
 * purpose. If the stream ends without it, the answer was cut off — which used
 * to be invisible.
 */
const DONE_MARK = "\u0004";

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

/** Compact plain-text snapshot of the case for AI context. */
export async function buildCaseSnapshot(county?: string, hisNames?: string): Promise<string> {
  const todayStr = new Date().toISOString().slice(0, 10);
  // Opus 5 has a 1M-token window — give it the whole case, not a sample.
  // Every incident and every flagged message goes in; the full archive is
  // summarized statistically so patterns over years of messages are visible
  // without shipping all of them on every turn.
  const [incidents, starredAll, evidence, financials, upcomingDates, totalMessages] =
    await Promise.all([
      db.incidents.orderBy("date").reverse().limit(400).toArray(),
      db.messages.filter((m) => m.starred).toArray(),
      db.evidence.orderBy("date").reverse().limit(200).toArray(),
      db.financials.toArray(),
      db.dates.where("date").aboveOrEqual(todayStr).sortBy("date"),
      db.messages.count(),
    ]);
  starredAll.sort((a, b) => (a.date < b.date ? 1 : -1));
  const starred = starredAll.slice(0, 600);

  const violations = await db.violations.orderBy("date").reverse().limit(300).toArray();

  const lines: string[] = [];
  lines.push(`CASE SNAPSHOT (generated ${new Date().toISOString().slice(0, 10)})`);
  lines.push(
    county
      ? `Jurisdiction: ${county} County, Texas — use this county's courts, local rules and standing orders; search for them when they matter.`
      : `Jurisdiction: Texas (county not set — ask her which county her case is in when local practice matters).`
  );
  if (hisNames?.trim()) {
    lines.push(
      `WHO IS WHO: messages whose sender is one of [${hisNames}] are from HIM — the abusive party. Everything else is from her or a third party. His own statements are admissible against him as party-opponent statements and are the strongest material in this file; weigh them accordingly and quote them exactly.`
    );
  }
  lines.push(
    `Totals: ${incidents.length} incidents, ${totalMessages.toLocaleString()} messages archived (${starredAll.length} flagged as significant), ${evidence.length} evidence items, ${financials.length} financial entries.`
  );

  // Volume-over-time and tag distribution across the FULL archive — this is
  // how a years-long pattern (escalation, spikes around court dates) shows up
  // without sending every message on every turn.
  if (totalMessages > 0) {
    const byMonth = new Map<string, number>();
    const byTag = new Map<string, number>();
    let first = "9999";
    let last = "0000";
    await db.messages.each((m) => {
      const month = (m.date || "").slice(0, 7);
      if (month) {
        byMonth.set(month, (byMonth.get(month) || 0) + 1);
        if (m.date < first) first = m.date;
        if (m.date > last) last = m.date;
      }
      for (const t of m.tags || []) byTag.set(t, (byTag.get(t) || 0) + 1);
    });
    if (byMonth.size) {
      lines.push(`\nMESSAGE ARCHIVE: ${first} to ${last}. Volume by month (watch for spikes):`);
      lines.push(
        [...byMonth.entries()]
          .sort()
          .map(([m, n]) => `${m}: ${n}`)
          .join(" | ")
      );
    }
    if (byTag.size) {
      lines.push(
        "Flagged message tags: " +
          [...byTag.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => `${t} (${n})`)
            .join(", ")
      );
    }
    lines.push(
      "The full archive is searchable in the app; ask her to search it if you need messages beyond the flagged ones below."
    );
  }

  if (upcomingDates.length) {
    lines.push("\nUPCOMING KEY DATES:");
    for (const d of upcomingDates.slice(0, 15)) {
      lines.push(
        `- ${d.date}${d.time ? " " + d.time : ""} | ${d.type} | ${d.title}${
          d.location ? ` @ ${d.location}` : ""
        }${d.notes ? ` | ${trunc(d.notes, 120)}` : ""}`
      );
    }
  }

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
    lines.push(
      `\nFLAGGED MESSAGES (${starred.length}${
        starredAll.length > starred.length ? ` of ${starredAll.length}, newest first` : ""
      }):`
    );
    for (const m of starred) {
      lines.push(
        `- ${m.date} | ${m.sender}${m.tags.length ? ` | [${m.tags.join(", ")}]` : ""}: "${trunc(m.text, 240)}"`
      );
    }
  }

  if (violations.length) {
    lines.push(
      `\nCOURT ORDER VIOLATIONS (${violations.length} logged — the basis of any enforcement motion):`
    );
    for (const v of violations) {
      lines.push(
        `- ${v.date}${v.time ? " " + v.time : ""} | ${v.type}${
          v.orderName ? ` | order: ${v.orderName}` : ""
        }${v.provision ? ` | provision: ${v.provision}` : ""}${
          v.childPresent ? " | child involved" : ""
        }${v.witnesses ? ` | witness: ${v.witnesses}` : ""}${
          v.proof ? ` | proof: ${v.proof}` : ""
        }${v.reported ? ` | reported: ${v.reported}` : ""}: ${trunc(v.description, 240)}`
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
  /**
   * Live law lookup. OFF by default now — the Texas provisions her case turns
   * on are in the system prompt, and searching every turn stalled the answer
   * mid-sentence to re-derive law the model already knows.
   */
  webSearch?: boolean;
  /** "scan" is the chunked JSON Deep Scan; everything else is conversation. */
  mode?: "chat" | "scan";
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
      mode: opts.mode ?? "chat",
      webSearch: opts.webSearch === true,
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
  let clean = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    let text = decoder.decode(value, { stream: true });
    if (!text) continue;
    // The server marks a deliberate ending with a single control character.
    // Its absence means the connection died mid-answer.
    const cut = text.indexOf(DONE_MARK);
    if (cut >= 0) {
      clean = true;
      text = text.slice(0, cut);
    }
    if (text) {
      full += text;
      opts.onDelta(text);
    }
  }
  if (!clean && opts.mode === "scan") {
    // Deep Scan parses this stream as JSON and retries failed chunks. A cut-off
    // chunk must fail loudly so the retry runs — half a catalog quietly
    // accepted would drop her evidence without anyone noticing. Prose must
    // never be appended here either; it would corrupt the JSON.
    throw new Error("The connection dropped part-way through this section.");
  }
  if (!clean) {
    // She was shown an answer that simply stopped, with nothing to tell her it
    // had stopped. Never again — an interrupted answer says so, and says what
    // to do about it.
    const note =
      (full.trim() ? "\n\n" : "") +
      "---\n**The connection dropped before that answer finished.** This is not your fault and nothing in your case file was affected. Type **continue** and I'll pick up where I left off.";
    full += note;
    opts.onDelta(note);
  }
  return full;
}

/**
 * Cuts a message at the cache marker so the unchanging half is billed at cache
 * rates. Text without the marker is returned exactly as it came in, so chat and
 * every other caller are untouched.
 */
function withCacheBreak(text: string): any {
  const at = text.indexOf(SCAN_CACHE_BREAK);
  if (at < 0) return text;
  return [
    {
      type: "text",
      text: text.slice(0, at),
      cache_control: { type: "ephemeral" },
    },
    { type: "text", text: text.slice(at + SCAN_CACHE_BREAK.length) },
  ];
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
      cache_control: { type: "ephemeral" },
    });
  }

  const isScan = opts.mode === "scan";
  const params: any = {
    model: opts.model,
    // NOT the same ceiling for both, and the difference is the whole reason a
    // scan finishes.
    //
    // Chat is one answer to one question and can afford to run long. A scan
    // part is billed against a serverless function that is killed at a fixed
    // wall-clock limit, and what governs whether a part survives is how much
    // JSON it has to write — proven on her own archive in #52. Opus writes
    // slower than Sonnet, so the ceiling has to sit lower here than it did
    // when Sonnet was doing this job, not higher.
    //
    // 10,000 is a ceiling, not a target. A part that needs more than this is a
    // part that should have been smaller, and it is now split and re-read
    // rather than silently truncated.
    max_tokens: isScan ? 10000 : 32000,
    system,
    // Same cache split the site's function makes, so a scan run on her own key
    // is billed the same way as one run through the site — the instructions in
    // front of every part are read from cache instead of paid for 59 times.
    messages: opts.history.map((t) => ({ role: t.role, content: withCacheBreak(t.content) })),
    // Deep Scan is set up exactly as the server sets it up, so a scan run on
    // her own API key catalogs the same way as one run through the site.
    //
    // It used to differ on both counts here: extended thinking stayed on, and
    // effort was pinned down to "medium" as part of the change that also moved
    // scans off Opus for cost. Thinking off is what makes each part start
    // streaming immediately and finish inside the platform's limit; leaving the
    // effort unpinned lets the model bring its full weight to the judgement
    // calls, which on this document is the whole job.
    ...(isScan ? {} : { thinking: { type: "adaptive" }, output_config: { effort: "xhigh" } }),
    ...(opts.webSearch === true
      ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }] }
      : {}),
    betas: ["server-side-fallback-2026-07-01"],
    // If a safety classifier declines (possible when quoting abusive messages),
    // automatically retry on Anthropic's recommended fallback model.
    fallbacks: "default",
  };

  // Server tools run in a bounded loop; a "pause_turn" means resume by
  // re-sending with the paused assistant turn appended.
  const runWithResume = async (p: any, beta: boolean) => {
    let convo = p.messages;
    let msg: any;
    for (let i = 0; i < 4; i++) {
      const stream: any = beta
        ? client.beta.messages.stream({ ...p, messages: convo }, { signal: opts.signal })
        : client.messages.stream({ ...p, messages: convo }, { signal: opts.signal });
      stream.on("text", (delta: string) => opts.onDelta(delta));
      msg = await stream.finalMessage();
      if (msg.stop_reason !== "pause_turn") return msg;
      convo = [...convo, { role: "assistant", content: msg.content }];
    }
    return msg;
  };

  let final: any;
  try {
    final = await runWithResume(params, true);
  } catch (err: any) {
    // Older accounts/SDK combinations may reject the fallback beta — retry plain.
    if (err?.status === 400 && params.fallbacks) {
      delete params.fallbacks;
      delete params.betas;
      final = await runWithResume(params, false);
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
