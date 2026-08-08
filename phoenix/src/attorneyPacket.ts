// The documents a lawyer actually reads first.
//
// A zip of spreadsheets is raw material, not a brief. What an attorney opens
// first is a cover page telling them what this is, and a chronology telling
// them what happened in order. Everything else is lookup.
//
// Three rules govern every word generated here:
//   1. Never state as fact anything she did not record. Every line traces to a
//      reference she can produce.
//   2. Never blur what is verified into what is her account. A hash proves a
//      file is unchanged; it does not prove who sent a message. The cover page
//      says so plainly, because a lawyer who discovers that distinction later
//      stops trusting the whole packet.
//   3. Never draft anything she might sign without a lawyer reading it first.

import { db } from "./db";
import { refEvi, refInc, refJrn, refMsg, refVio, REF_KEY } from "./refs";

const d = (s: string) => s || "(date not recorded)";

export interface PacketStats {
  incidents: number;
  messages: number;
  flagged: number;
  journal: number;
  violations: number;
  evidence: number;
  files: number;
  earliest: string;
  latest: string;
}

export async function packetStats(): Promise<PacketStats> {
  const [incidents, messages, journal, violations, evidence] = await Promise.all([
    db.incidents.toArray(),
    db.messages.toArray(),
    db.journal.toArray(),
    db.violations.toArray(),
    db.evidence.toArray(),
  ]);
  const dates = [
    ...incidents.map((i) => i.date),
    ...messages.map((m) => m.date),
    ...journal.map((j) => j.date),
    ...violations.map((v) => v.date),
  ]
    .filter((x) => /^\d{4}-\d{2}-\d{2}/.test(x || ""))
    .sort();
  return {
    incidents: incidents.length,
    messages: messages.length,
    flagged: messages.filter((m) => m.starred).length,
    journal: journal.length,
    violations: violations.length,
    evidence: evidence.length,
    files: evidence.filter((e) => e.blob).length,
    earliest: dates[0] || "",
    latest: dates[dates.length - 1] || "",
  };
}

/**
 * The page a lawyer reads before anything else: what this is, how it is
 * organised, what is proven and what is not, and what they can obtain that
 * she cannot.
 */
export async function buildCoverLetter(name: string, county: string): Promise<string> {
  const s = await packetStats();
  const imports = await db.imports.toArray();
  const fingerprinted = imports.length;

  const L: string[] = [];
  L.push("PREPARED FOR COUNSEL");
  L.push("=".repeat(70));
  L.push("");
  L.push(`Prepared by:  ${name || "[client name]"}`);
  L.push(`Prepared on:  ${new Date().toLocaleDateString()}`);
  if (county) L.push(`Jurisdiction: ${county} County, Texas`);
  L.push("");
  L.push("This is a client-prepared record. It is not a filing, not a sworn");
  L.push("statement, and not legal advice. It was assembled to save you time:");
  L.push("everything is dated, numbered, and cross-referenced so you can go");
  L.push("straight from a claim to the record behind it.");
  L.push("");

  L.push("WHAT IS IN IT");
  L.push("-".repeat(70));
  L.push(`  ${String(s.incidents).padStart(6)}  incidents documented by the client`);
  L.push(`  ${String(s.messages).padStart(6)}  messages archived (${s.flagged} flagged as significant)`);
  L.push(`  ${String(s.journal).padStart(6)}  journal entries`);
  L.push(`  ${String(s.violations).padStart(6)}  alleged violations of a court order`);
  L.push(`  ${String(s.evidence).padStart(6)}  evidence items (${s.files} with a file attached)`);
  if (s.earliest) L.push(`\n  Covering ${s.earliest} to ${s.latest}.`);
  L.push("");
  L.push("  START WITH:  CHRONOLOGY.txt — everything in date order, one page per");
  L.push("               year of the relationship, each line carrying its reference.");
  L.push("");

  L.push("HOW THE NUMBERING WORKS");
  L.push("-".repeat(70));
  L.push(REF_KEY.split("\n").slice(1).join("\n"));
  L.push("");

  L.push("WHAT IS VERIFIED, AND WHAT IS NOT");
  L.push("-".repeat(70));
  L.push("  Please read this before relying on anything here.");
  L.push("");
  L.push("  VERIFIED — that the files have not changed since the client saved them.");
  L.push(`  Every file and message export was fingerprinted (SHA-256) with a`);
  L.push(`  timestamp at the moment it was imported, before any dispute existed.`);
  L.push(`  ${fingerprinted} such records are listed in EVIDENCE-INTEGRITY.csv. If the`);
  L.push("  authenticity of a message is challenged, the copy produced can be");
  L.push("  re-hashed and compared against the value recorded then.");
  L.push("");
  L.push("  NOT VERIFIED — authorship, and the truth of any account.");
  L.push("  Nothing here establishes who sent a message. That comes from the");
  L.push("  device itself and from carrier records. The incident narratives and");
  L.push("  journal entries are the client's own account, offered as such.");
  L.push("");
  L.push("  Journal entries marked 'written at the time' were recorded");
  L.push("  contemporaneously rather than reconstructed later.");
  L.push("");

  const gaps = await missingRecords();
  if (gaps.length) {
    L.push("RECORDS THE CLIENT CANNOT OBTAIN, BUT YOU MAY BE ABLE TO");
    L.push("-".repeat(70));
    for (const g of gaps) L.push(`  • ${g}`);
    L.push("");
  }

  L.push("A NOTE ON THE ORIGINALS");
  L.push("-".repeat(70));
  L.push("  This packet is a working copy. The original messages remain on the");
  L.push("  client's phone and the original photographs in her camera roll,");
  L.push("  untouched. Nothing has been deleted from either.");
  L.push("");
  return L.join("\n");
}

/** What exists somewhere that she can't get herself. */
async function missingRecords(): Promise<string[]> {
  const [incidents, messages, violations] = await Promise.all([
    db.incidents.toArray(),
    db.messages.toArray(),
    db.violations.toArray(),
  ]);
  const out: string[] = [];

  if (messages.length) {
    out.push(
      `Carrier records for the ${messages.length.toLocaleString()} messages archived here — ` +
        "independent confirmation of sender, recipient and timestamp."
    );
  }
  const reports = incidents.map((i) => i.policeReport).filter(Boolean);
  if (reports.length) {
    out.push(`Police reports referenced in the incident log: ${reports.join(", ")}.`);
  } else if (incidents.length) {
    out.push(
      "Any police call-outs — the client has not recorded a report number, but calls may exist under her address."
    );
  }
  const medical = incidents.map((i) => i.medical).filter(Boolean);
  if (medical.length) out.push(`Medical records referenced: ${medical.join("; ")}.`);
  const witnesses = incidents.map((i) => i.witnesses).filter(Boolean);
  if (witnesses.length) out.push(`Witnesses named in the incident log: ${witnesses.join("; ")}.`);
  if (incidents.some((i) => i.childrenPresent)) {
    out.push("School or childcare records, if the child's behaviour was noted at the time.");
  }
  if (violations.length) {
    out.push("The order alleged to have been violated, and any enforcement history.");
  }
  out.push("Financial disclosure — bank, payroll and tax records for the marital estate.");
  return out;
}

/**
 * One chronology, everything merged, in date order. This is the document a
 * lawyer actually works from.
 */
export async function buildChronology(name: string): Promise<string> {
  const [incidents, messages, journal, violations, evidence] = await Promise.all([
    db.incidents.toArray(),
    db.messages.filter((m) => m.starred).toArray(),
    db.journal.toArray(),
    db.violations.toArray(),
    db.evidence.toArray(),
  ]);

  type Row = { date: string; time: string; sort: string; body: string[] };
  const rows: Row[] = [];

  for (const i of incidents) {
    const extras = [
      i.childrenPresent ? "child present" : "",
      i.location ? `at ${i.location}` : "",
      i.witnesses ? `witness: ${i.witnesses}` : "",
      i.policeReport ? `police report ${i.policeReport}` : "",
      i.medical ? `medical: ${i.medical}` : "",
      i.categories.length ? i.categories.join(", ") : "",
      `severity ${i.severity}/5`,
    ].filter(Boolean);
    rows.push({
      date: i.date, time: i.time || "", sort: `${i.date} ${i.time || "00:00"}`,
      body: [
        `INCIDENT — ${i.title}   [${refInc(i.id)}]`,
        ...i.narrative.split("\n").map((l) => `    ${l}`),
        `    (${extras.join(" · ")})`,
      ],
    });
  }

  for (const m of messages) {
    rows.push({
      date: (m.date || "").slice(0, 10), time: m.time || "",
      sort: `${(m.date || "").slice(0, 10)} ${m.time || "00:00"}`,
      body: [
        `MESSAGE from ${m.sender}   [${refMsg(m.id)}]${m.tags?.length ? `  {${m.tags.join(", ")}}` : ""}`,
        `    "${m.text.replace(/\n/g, "\n     ")}"`,
      ],
    });
  }

  for (const j of journal) {
    rows.push({
      date: j.date, time: j.time || "", sort: `${j.date} ${j.time || "00:00"}`,
      body: [
        `JOURNAL${j.contemporaneous ? " (written at the time)" : " (recalled later)"}` +
          `${j.title ? ` — ${j.title}` : ""}   [${refJrn(j.id)}]`,
        ...j.body.split("\n").map((l) => `    ${l}`),
      ],
    });
  }

  for (const v of violations) {
    rows.push({
      date: v.date, time: v.time || "", sort: `${v.date} ${v.time || "00:00"}`,
      body: [
        `ORDER VIOLATION — ${v.type}   [${refVio(v.id)}]`,
        `    ${v.description}`,
        `    (${[v.orderName, v.provision, v.childPresent ? "child present" : "", v.reported ? `reported: ${v.reported}` : ""].filter(Boolean).join(" · ")})`,
      ],
    });
  }

  for (const e of evidence) {
    rows.push({
      date: e.date, time: "", sort: `${e.date} 00:00`,
      body: [
        `EVIDENCE — ${e.title} (${e.kind})   [${refEvi(e.id)}]`,
        e.notes ? `    ${e.notes}` : "",
        e.sha256 ? `    fingerprint ${e.sha256.slice(0, 16)}…` : "",
      ].filter(Boolean),
    });
  }

  rows.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));

  const L: string[] = [];
  L.push("CHRONOLOGY");
  L.push("=".repeat(70));
  L.push(`${name ? name + " · " : ""}prepared ${new Date().toLocaleDateString()}`);
  L.push("");
  L.push("Everything on record, in date order: incidents, flagged messages,");
  L.push("journal entries, order violations and evidence. Each line carries the");
  L.push("reference of the record it came from — look it up in the spreadsheets");
  L.push("under records/ to see it in full.");
  L.push("");
  L.push("PREPARED FOR COUNSEL. The narratives and journal entries are the");
  L.push("client's own account. See COVER-LETTER.txt for what is verified.");
  L.push("");

  let year = "";
  for (const r of rows) {
    const y = (r.date || "").slice(0, 4);
    if (y && y !== year) {
      year = y;
      L.push("");
      L.push("=".repeat(70));
      L.push(y);
      L.push("=".repeat(70));
    }
    L.push("");
    L.push(`${d(r.date)}${r.time ? ` ${r.time}` : ""}`);
    L.push(...r.body);
  }

  if (!rows.length) L.push("(Nothing on record yet.)");
  L.push("");
  return L.join("\n");
}

/** The message she sends with the file. Written so she can just copy it. */
export function attorneyEmailText(name: string, s: PacketStats): string {
  return [
    "Subject: My case file — records and chronology",
    "",
    "Hello,",
    "",
    "Attached is my case file. I've put it together myself so it's ready to",
    "work from rather than a pile of screenshots.",
    "",
    "Please start with two files:",
    "  • COVER-LETTER.txt — what's in it, and what is and isn't verified",
    "  • CHRONOLOGY.txt — everything in date order",
    "",
    `It contains ${s.incidents} documented incidents, ${s.messages.toLocaleString()} archived messages`,
    `(${s.flagged} flagged as significant), ${s.journal} journal entries` +
      `${s.violations ? `, ${s.violations} alleged order violations` : ""}` +
      `${s.evidence ? `, and ${s.evidence} evidence items` : ""}.`,
    "",
    "Every record has a fixed reference number, so anything I mention can be",
    "looked up directly. Files were fingerprinted when I saved them, and that",
    "record is included.",
    "",
    "The originals are untouched on my phone. Tell me what else you need and",
    "I'll get it.",
    "",
    name ? name : "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The case file as a single web page.
 *
 * A folder of spreadsheets is work. This opens in any browser with no software
 * and no account: the chronology, the exhibits, the integrity record, all
 * cross-referenced and searchable from one box. It is the difference between a
 * lawyer skimming a client's material and actually using it.
 *
 * Every value is HTML-escaped. The content is her ex-partner's words, and they
 * will be opened on someone else's machine — nothing in here may execute.
 */
export async function buildCaseIndexHtml(name: string, county: string): Promise<string> {
  const [incidents, messages, journal, violations, evidence, imports] = await Promise.all([
    db.incidents.orderBy("date").toArray(),
    db.messages.filter((m) => m.starred).toArray(),
    db.journal.orderBy("date").toArray(),
    db.violations.orderBy("date").toArray(),
    db.evidence.orderBy("date").toArray(),
    db.imports.orderBy("createdAt").toArray(),
  ]);
  const s = await packetStats();

  type Item = { date: string; time: string; kind: string; ref: string; title: string; body: string; meta: string };
  const items: Item[] = [];

  for (const i of incidents)
    items.push({
      date: i.date, time: i.time || "", kind: "Incident", ref: refInc(i.id), title: i.title,
      body: i.narrative,
      meta: [
        `severity ${i.severity}/5`, i.categories.join(", "),
        i.childrenPresent ? "child present" : "", i.location ? `at ${i.location}` : "",
        i.witnesses ? `witness: ${i.witnesses}` : "",
        i.policeReport ? `police report ${i.policeReport}` : "",
        i.medical ? `medical: ${i.medical}` : "",
      ].filter(Boolean).join(" · "),
    });

  for (const m of messages)
    items.push({
      date: (m.date || "").slice(0, 10), time: m.time || "", kind: "Message", ref: refMsg(m.id),
      title: `from ${m.sender}`, body: m.text, meta: (m.tags || []).join(", "),
    });

  for (const j of journal)
    items.push({
      date: j.date, time: j.time || "", kind: "Journal", ref: refJrn(j.id),
      title: j.title || "(entry)", body: j.body,
      meta: j.contemporaneous ? "written at the time" : "recalled later",
    });

  for (const v of violations)
    items.push({
      date: v.date, time: v.time || "", kind: "Violation", ref: refVio(v.id), title: v.type,
      body: v.description,
      meta: [v.orderName, v.provision, v.childPresent ? "child present" : "", v.reported ? `reported: ${v.reported}` : ""]
        .filter(Boolean).join(" · "),
    });

  for (const e of evidence)
    items.push({
      date: e.date, time: "", kind: "Evidence", ref: refEvi(e.id), title: e.title,
      body: e.notes || "", meta: [e.kind, e.fileName ? `files/${e.fileName}` : "indexed only",
        e.sha256 ? `SHA-256 ${e.sha256.slice(0, 16)}…` : ""].filter(Boolean).join(" · "),
    });

  items.sort((a, b) => `${a.date} ${a.time}` < `${b.date} ${b.time}` ? -1 : 1);

  const rows = items
    .map(
      (i) => `<article class="e ${i.kind.toLowerCase()}" data-k="${esc(i.kind)}">
  <div class="h"><span class="ref">${esc(i.ref)}</span><time>${esc(i.date)}${i.time ? " " + esc(i.time) : ""}</time><span class="k">${esc(i.kind)}</span></div>
  <h3>${esc(i.title)}</h3>
  ${i.body ? `<p>${esc(i.body)}</p>` : ""}
  ${i.meta ? `<p class="m">${esc(i.meta)}</p>` : ""}
</article>`
    )
    .join("\n");

  const integrity = imports
    .map(
      (r) => `<tr><td>${esc(new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " "))}</td>
<td>${esc(r.kind)}</td><td>${esc(r.fileName || "")}</td><td>${r.rows ?? ""}</td>
<td class="mono">${esc(r.sha256)}</td></tr>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Case file${name ? " — " + esc(name) : ""}</title>
<style>
:root{--ink:#1a1720;--mut:#6b6675;--line:#e3dfe8;--bg:#faf8fb;--pan:#fff;--acc:#8a3ffc;--dan:#c62828}
@media(prefers-color-scheme:dark){:root{--ink:#ece9f0;--mut:#a09aab;--line:#332e3c;--bg:#141118;--pan:#1c1822}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:28px 20px 80px}
header{border-bottom:2px solid var(--ink);padding-bottom:16px;margin-bottom:8px}
h1{font-size:1.7rem;margin:0 0 4px}
.sub{color:var(--mut);font-size:.92rem}
.tag{display:inline-block;background:var(--dan);color:#fff;font-size:.7rem;font-weight:700;letter-spacing:.06em;padding:3px 8px;border-radius:4px;margin-bottom:10px}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
.stat{background:var(--pan);border:1px solid var(--line);border-radius:8px;padding:8px 12px;font-size:.85rem}
.stat b{display:block;font-size:1.25rem}
.note{background:var(--pan);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:8px;padding:14px 16px;margin:18px 0;font-size:.9rem}
.note h2{margin:0 0 8px;font-size:1rem}
.controls{position:sticky;top:0;background:var(--bg);padding:14px 0;border-bottom:1px solid var(--line);z-index:5}
input[type=search]{width:100%;padding:11px 14px;font-size:1rem;border:1px solid var(--line);border-radius:8px;background:var(--pan);color:var(--ink)}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.filters button{border:1px solid var(--line);background:var(--pan);color:var(--ink);border-radius:999px;padding:5px 12px;font-size:.82rem;cursor:pointer}
.filters button[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.e{background:var(--pan);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
.e.incident{border-left:3px solid var(--dan)}
.e.violation{border-left:3px solid #e07b00}
.e.journal{border-left:3px solid #2e7d32}
.h{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:.8rem;color:var(--mut)}
.ref{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;color:var(--acc)}
.k{margin-left:auto;text-transform:uppercase;letter-spacing:.05em;font-size:.7rem}
.e h3{margin:6px 0;font-size:1.02rem}
.e p{margin:6px 0;white-space:pre-wrap}
.e .m{color:var(--mut);font-size:.84rem}
table{width:100%;border-collapse:collapse;font-size:.8rem;margin-top:10px;display:block;overflow-x:auto}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:.72rem}
h2.sec{margin:34px 0 4px;padding-top:20px;border-top:1px solid var(--line);font-size:1.15rem}
.count{color:var(--mut);font-size:.85rem;margin:10px 0}
@media print{.controls{display:none}.e{break-inside:avoid}}
</style></head><body><div class="wrap">

<header>
  <div class="tag">PREPARED FOR COUNSEL</div>
  <h1>Case file${name ? " — " + esc(name) : ""}</h1>
  <div class="sub">${county ? esc(county) + " County, Texas · " : ""}prepared ${esc(new Date().toLocaleDateString())}${s.earliest ? " · covering " + esc(s.earliest) + " to " + esc(s.latest) : ""}</div>
</header>

<div class="stats">
  <div class="stat"><b>${s.incidents}</b>incidents</div>
  <div class="stat"><b>${s.messages.toLocaleString()}</b>messages (${s.flagged} flagged)</div>
  <div class="stat"><b>${s.journal}</b>journal entries</div>
  <div class="stat"><b>${s.violations}</b>order violations</div>
  <div class="stat"><b>${s.evidence}</b>evidence items</div>
</div>

<div class="note">
  <h2>What is verified, and what is not</h2>
  <p style="margin:0 0 8px"><strong>Verified:</strong> that the files have not changed since they were saved. Each was fingerprinted (SHA-256) with a timestamp on import, before any dispute — see the integrity record at the foot of this page.</p>
  <p style="margin:0"><strong>Not verified:</strong> authorship, or the truth of any account. Nothing here establishes who sent a message; that comes from the device and from carrier records. The narratives and journal entries are the client's own account, offered as such.</p>
</div>

<div class="controls">
  <input type="search" id="q" placeholder="Search everything — a name, a word, a date…" autocomplete="off">
  <div class="filters" id="f">
    <button data-k="" aria-pressed="true">Everything</button>
    <button data-k="Incident" aria-pressed="false">Incidents</button>
    <button data-k="Message" aria-pressed="false">Messages</button>
    <button data-k="Journal" aria-pressed="false">Journal</button>
    <button data-k="Violation" aria-pressed="false">Violations</button>
    <button data-k="Evidence" aria-pressed="false">Evidence</button>
  </div>
</div>

<p class="count" id="count"></p>
<div id="list">
${rows || "<p>(Nothing on record yet.)</p>"}
</div>

<h2 class="sec">Evidence integrity record</h2>
<p class="sub">When each file and export entered the record, and its fingerprint at that moment.</p>
<table><thead><tr><th>Recorded</th><th>What</th><th>File</th><th>Rows</th><th>SHA-256</th></tr></thead>
<tbody>${integrity || "<tr><td colspan=5>(none)</td></tr>"}</tbody></table>

<h2 class="sec">How the numbering works</h2>
<pre style="font-size:.82rem;white-space:pre-wrap;color:var(--mut)">${esc(REF_KEY)}</pre>

<script>
(function(){
  var q=document.getElementById('q'),list=document.getElementById('list'),
      cards=[].slice.call(list.getElementsByClassName('e')),
      count=document.getElementById('count'),kind='';
  var hay=cards.map(function(c){return c.textContent.toLowerCase()});
  function run(){
    var t=q.value.trim().toLowerCase(),n=0;
    cards.forEach(function(c,i){
      var show=(!kind||c.getAttribute('data-k')===kind)&&(!t||hay[i].indexOf(t)>-1);
      c.style.display=show?'':'none'; if(show)n++;
    });
    count.textContent=n+(n===1?' entry':' entries')+(t||kind?' shown':'');
  }
  q.addEventListener('input',run);
  document.getElementById('f').addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b)return;
    kind=b.getAttribute('data-k');
    [].forEach.call(this.getElementsByTagName('button'),function(x){
      x.setAttribute('aria-pressed',String(x===b));});
    run();
  });
  run();
})();
</script>
</div></body></html>`;
}
