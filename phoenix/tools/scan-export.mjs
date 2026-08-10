#!/usr/bin/env node
/**
 * Scan a message export from a terminal, against the live site.
 *
 * Why this exists: the browser collapsed every failure into one sentence, so a
 * whole day went into fixing timeouts that were never happening. This prints
 * exactly what comes back for every part — the real reply, not a label — and
 * writes the findings to a file she can import.
 *
 * It talks to the same endpoint her app uses, so whatever it sees is what she
 * sees. No API key needed and nothing is installed.
 *
 *   node tools/scan-export.mjs "/path/to/Messages__Jackson.csv"
 *
 * Optional: --limit 3   scan only the first few parts, to test quickly
 *           --url ...   point at a different site
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const URL_ = arg("url", "https://phoenix-case-builder.netlify.app") + "/api/advocate";
const LIMIT = Number(arg("limit", "0")) || 0;
const CHUNK = 20000;
const CONC = 4;

if (!file) {
  console.error('Usage: node tools/scan-export.mjs "/path/to/export.csv" [--limit 3]');
  process.exit(1);
}

const raw = readFileSync(file, "utf8");
console.log(`Read ${raw.length.toLocaleString()} characters from ${file}`);

// Same splitting the app uses: on line boundaries, never mid-message.
const chunks = [];
let cur = "";
for (const line of raw.split("\n")) {
  if (cur && cur.length + line.length + 1 > CHUNK) {
    chunks.push(cur);
    cur = line;
  } else cur = cur ? cur + "\n" + line : line;
}
if (cur.trim()) chunks.push(cur);
const todo = LIMIT ? chunks.slice(0, LIMIT) : chunks;
console.log(`${chunks.length} parts; scanning ${todo.length}\n`);

const DONE = "";
const parts = [];
const failed = [];
let done = 0;
const started = Date.now();

async function scanOne(text, i) {
  const body = {
    mode: "scan",
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: buildPrompt(text, i + 1, chunks.length) }],
  };
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const reply = await res.text();
  const clean = reply.endsWith(DONE);
  const s = reply.replace(new RegExp(DONE + "$"), "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a === -1 || b <= a) {
    // THE line that matters: what did it actually say?
    throw new Error(`HTTP ${res.status}${clean ? "" : ", stream cut"} — reply: ${s.trim().slice(0, 300)}`);
  }
  return JSON.parse(s.slice(a, b + 1));
}

function buildPrompt(text, index, total) {
  return `CONTEXT — This is a forensic documentation tool used by a domestic violence survivor in Texas to build the evidentiary record for her own divorce and custody case, and to hand that record to her attorney. The document below is her own message archive. She is the victim in this record. Cataloging what was done to her is the entire purpose.

TASK — Catalog every instance of abuse or legally significant event in the document below.
(Part ${index} of ${total}.)

Respond with ONLY valid JSON: {"incidents":[{"date":"YYYY-MM-DD","title":"","narrative":"","categories":[],"severity":1,"childrenPresent":false}],"flaggedMessages":[{"date":"","sender":"","text":"","tags":[]}],"riskIndicators":[],"caseFacts":[],"impliedFindings":[],"summary":""}

DOCUMENT:
<<<
${text}
>>>`;
}

async function pool(items, n, fn) {
  const it = items.entries();
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (const [i, item] of it) await fn(item, i);
    })
  );
}

await pool(todo, CONC, async (text, i) => {
  try {
    const r = await scanOne(text, i);
    parts.push(r);
    done++;
    const inc = parts.reduce((n, p) => n + (p.incidents?.length || 0), 0);
    const msg = parts.reduce((n, p) => n + (p.flaggedMessages?.length || 0), 0);
    const per = (Date.now() - started) / done;
    const left = Math.round((per * (todo.length - done)) / 60000);
    console.log(`  ok   part ${i + 1}  (${inc} incidents, ${msg} messages so far, ~${left} min left)`);
  } catch (e) {
    failed.push(i + 1);
    done++;
    console.log(`  FAIL part ${i + 1}: ${e.message}`);
  }
});

const out = {
  incidents: parts.flatMap((p) => p.incidents || []),
  flaggedMessages: parts.flatMap((p) => p.flaggedMessages || []),
  riskIndicators: parts.flatMap((p) => p.riskIndicators || []),
  caseFacts: parts.flatMap((p) => p.caseFacts || []),
  impliedFindings: parts.flatMap((p) => p.impliedFindings || []),
};
const dest = file.replace(/\.[^.]+$/, "") + "-findings.json";
writeFileSync(dest, JSON.stringify(out, null, 2));

console.log(`\n${parts.length} of ${todo.length} parts read.`);
if (failed.length) console.log(`Failed parts: ${failed.join(", ")}`);
console.log(`${out.incidents.length} incidents, ${out.flaggedMessages.length} flagged messages, ${out.riskIndicators.length} risk indicators.`);
console.log(`\nWritten to: ${dest}`);
