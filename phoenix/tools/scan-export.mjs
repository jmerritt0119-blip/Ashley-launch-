#!/usr/bin/env node
/**
 * Scan a message export from a terminal, against the live site.
 *
 * Why this exists: the browser collapsed every failure into one sentence, so a
 * whole day went into fixing timeouts that were never happening. This prints
 * exactly what comes back for every part — the real reply, not a label.
 *
 * It sends THE APP'S OWN PROMPT, imported from src/scan.ts, and parses the
 * reply with the app's own parser. That matters more than it sounds: this tool
 * used to build a stripped-down prompt of its own, so it could return a healthy
 * catalog while the app returned nothing, or the reverse, and neither result
 * told you anything about the other. A diagnostic that does not send what the
 * patient sends is not a diagnostic.
 *
 *   node tools/scan-export.mjs "/path/to/Messages__Jackson.csv"
 *
 * Options:
 *   --limit 3    scan only the first few parts, to test quickly
 *   --lean       send date/sender/text instead of the raw spreadsheet columns
 *   --compare    scan the same parts BOTH ways and print the counts side by
 *                side. This is the one that settles whether the raw export's
 *                metadata is costing findings, rather than arguing about it.
 *   --url ...    point at a different site
 */
import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";

// Registered before the app source is imported, so `from "./taxonomy"` and the
// rest of the extensionless imports resolve under plain node.
register("./ts-hooks.mjs", import.meta.url);
const { buildScanPrompt, chunkScanInput, parseScanResult, SCAN_MODEL, SCAN_CHUNK_SIZE } =
  await import("../src/scan.ts");
const { messagesFromCsv } = await import("../src/parseMessages.ts");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const has = (n) => args.includes(`--${n}`);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const URL_ = arg("url", "https://phoenix-case-builder.netlify.app") + "/api/advocate";
const LIMIT = Number(arg("limit", "0")) || 0;
const CONC = 4;

/** The control character the server appends when it ends a reply on purpose. */
const DONE = "";

if (!file) {
  console.error(
    'Usage: node tools/scan-export.mjs "/path/to/export.csv" [--limit 3] [--lean] [--compare]'
  );
  process.exit(1);
}

const raw = readFileSync(file, "utf8");
console.log(`Read ${raw.length.toLocaleString()} characters from ${file}`);

/**
 * The same reduction the app can apply: when, who, what — and rows with no text
 * at all (attachments, bare reactions) dropped, since there is nothing in them
 * to read.
 */
function lean(doc) {
  let rows = [];
  try {
    rows = messagesFromCsv(doc);
  } catch {
    return doc;
  }
  if (rows.length < 3) return doc;
  return rows
    .filter((m) => m.text.trim())
    .map((m) => `${m.date}${m.time ? " " + m.time : ""} ${m.sender}: ${m.text.trim()}`)
    .join("\n");
}

/** One request for one part, using the app's prompt. Throws with the real reply. */
async function scanOne(text, index, total) {
  const body = {
    mode: "scan",
    model: SCAN_MODEL,
    messages: [{ role: "user", content: buildScanPrompt(text, { index, total }) }],
  };
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const reply = await res.text();
  // A reply without the marker was cut off in transit — a different problem
  // with a different fix, and it used to be indistinguishable from a clean one
  // because this check compared against an empty string and was always true.
  const clean = reply.includes(DONE);
  const s = reply.split(DONE)[0];
  try {
    return parseScanResult(s);
  } catch (e) {
    throw new Error(
      `HTTP ${res.status}${clean ? "" : ", STREAM CUT (no end marker)"} — ${e.message}`
    );
  }
}

async function pool(items, n, fn) {
  const it = items.entries();
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (const [i, item] of it) await fn(item, i);
    })
  );
}

/** Scan one rendering of the document end to end, and report what came back. */
async function runPass(label, doc) {
  const chunks = chunkScanInput(doc);
  const todo = LIMIT ? chunks.slice(0, LIMIT) : chunks;
  console.log(
    `\n=== ${label} ===\n${doc.length.toLocaleString()} characters, ` +
      `${chunks.length} parts of up to ${SCAN_CHUNK_SIZE.toLocaleString()}; scanning ${todo.length}\n`
  );

  const parts = [];
  const failed = [];
  let done = 0;
  const started = Date.now();

  await pool(todo, CONC, async (text, i) => {
    try {
      const r = await scanOne(text, i + 1, chunks.length);
      parts.push(r);
      done++;
      const inc = parts.reduce((n, p) => n + p.incidents.length, 0);
      const msg = parts.reduce((n, p) => n + p.messages.length, 0);
      const per = (Date.now() - started) / done;
      const left = Math.round((per * (todo.length - done)) / 60000);
      console.log(
        `  ok   part ${i + 1}  (${inc} incidents, ${msg} messages so far, ~${left} min left)`
      );
    } catch (e) {
      failed.push(i + 1);
      done++;
      console.log(`  FAIL part ${i + 1}: ${e.message}`);
    }
  });

  const total = {
    incidents: parts.reduce((n, p) => n + p.incidents.length, 0),
    messages: parts.reduce((n, p) => n + p.messages.length, 0),
    risks: parts.reduce((n, p) => n + p.risks.length, 0),
    facts: parts.reduce((n, p) => n + p.facts.length, 0),
    implied: parts.reduce((n, p) => n + p.implied.length, 0),
  };
  console.log(
    `\n${parts.length} of ${todo.length} parts read.` +
      (failed.length ? ` Failed: ${failed.join(", ")}` : "")
  );
  console.log(
    `${total.incidents} incidents, ${total.messages} flagged messages, ${total.risks} risk ` +
      `indicators, ${total.facts} case facts, ${total.implied} implied findings.`
  );
  return { label, parts, failed, total, chunks: chunks.length, chars: doc.length };
}

const passes = [];
if (has("compare")) {
  // Same parts, both shapes, one run. Whichever finds more, finds more.
  passes.push(await runPass("RAW — the export exactly as it arrives", raw));
  passes.push(await runPass("LEAN — date, sender, text only", lean(raw)));
} else {
  passes.push(
    has("lean")
      ? await runPass("LEAN — date, sender, text only", lean(raw))
      : await runPass("RAW — the export exactly as it arrives", raw)
  );
}

if (passes.length > 1) {
  console.log("\n\n=== SIDE BY SIDE ===");
  const row = (k) =>
    `${k.padEnd(18)} ` + passes.map((p) => String(p.total[k]).padStart(10)).join("");
  console.log("".padEnd(18) + passes.map((p) => p.label.slice(0, 10).padStart(10)).join(""));
  for (const k of ["incidents", "messages", "risks", "facts", "implied"]) console.log(row(k));
  console.log(
    "characters".padEnd(18) + passes.map((p) => p.chars.toLocaleString().padStart(10)).join("")
  );
  console.log(
    "parts".padEnd(18) + passes.map((p) => String(p.chunks).padStart(10)).join("")
  );
  console.log(
    "parts failed".padEnd(18) + passes.map((p) => String(p.failed.length).padStart(10)).join("")
  );
}

// Written in the app's own shape, so it can be read back without translation.
const best = passes[passes.length - 1];
const out = {
  incidents: best.parts.flatMap((p) => p.incidents),
  flaggedMessages: best.parts.flatMap((p) => p.messages),
  riskIndicators: best.parts.flatMap((p) => p.risks),
  caseFacts: best.parts.flatMap((p) => p.facts),
  impliedFindings: best.parts.flatMap((p) => p.implied),
};
const dest = file.replace(/\.[^.]+$/, "") + "-findings.json";
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`\nWritten to: ${dest}`);
