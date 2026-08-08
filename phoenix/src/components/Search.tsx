import { useState } from "react";
import { db } from "../db";
import { streamAdvocate, buildCaseSnapshot } from "../claude";
import type { Settings } from "../settings";

interface Props {
  go: (view: string) => void;
  settings: Settings;
}

interface Hit {
  kind: string;
  date: string;
  title: string;
  body: string;
  view: string;
}

/**
 * Search is deterministic: plain substring matching finds every occurrence,
 * so nothing is missed. The AI then reads the matches and explains what they
 * add up to — code for recall, model for meaning.
 */
export default function Search({ go, settings }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [truncated, setTruncated] = useState(0);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsKey = settings.connection === "direct" && !settings.apiKey;

  const runSearch = async (term: string): Promise<Hit[]> => {
    const needle = term.trim().toLowerCase();
    if (!needle) return [];
    const out: Hit[] = [];

    const [incidents, messages, evidence, financials, dates, docs, violations] = await Promise.all([
      db.incidents.toArray(),
      db.messages.toArray(),
      db.evidence.toArray(),
      db.financials.toArray(),
      db.dates.toArray(),
      db.documents.toArray(),
      db.violations.toArray(),
    ]);

    const has = (...parts: (string | undefined)[]) =>
      parts.filter(Boolean).join(" ").toLowerCase().includes(needle);

    for (const i of incidents) {
      if (has(i.title, i.narrative, i.categories.join(" "), i.witnesses, i.location))
        out.push({
          kind: "Incident",
          date: i.date,
          title: i.title,
          body: i.narrative,
          view: "incidents",
        });
    }
    for (const m of messages) {
      if (has(m.text, m.sender, m.tags.join(" ")))
        out.push({
          kind: m.starred ? "Message ★" : "Message",
          date: m.date,
          title: m.sender,
          body: m.text,
          view: "messages",
        });
    }
    for (const v of violations) {
      if (has(v.type, v.description, v.orderName, v.witnesses, v.proof))
        out.push({ kind: "Violation", date: v.date, title: v.type, body: v.description, view: "violations" });
    }
    for (const e of evidence) {
      if (has(e.title, e.notes, e.kind, e.fileName))
        out.push({ kind: "Evidence", date: e.date, title: e.title, body: e.notes || "", view: "evidence" });
    }
    for (const f of financials) {
      if (has(f.name, f.notes, f.type, f.owner))
        out.push({
          kind: "Financial",
          date: "",
          title: `${f.type}: ${f.name}`,
          body: f.notes || "",
          view: "financials",
        });
    }
    for (const d of dates) {
      if (has(d.title, d.notes, d.type, d.location))
        out.push({ kind: "Key date", date: d.date, title: d.title, body: d.notes || "", view: "dates" });
    }
    for (const d of docs) {
      if (has(d.title, d.content))
        out.push({
          kind: "Document",
          date: new Date(d.updatedAt).toISOString().slice(0, 10),
          title: d.title,
          body: d.content.slice(0, 400),
          view: "documents",
        });
    }

    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
  };

  const search = async () => {
    setError(null);
    setAnswer("");
    const found = await runSearch(q);
    setTruncated(Math.max(0, found.length - 300));
    setHits(found);
  };

  /** Feed the matches — not the whole archive — to The Advocate. */
  const analyze = async () => {
    if (!hits?.length || busy) return;
    setBusy(true);
    setError(null);
    setAnswer("");
    try {
      const forAi = hits.slice(0, 400);
      const evidenceText = forAi
        .map((h) => `[${h.kind}] ${h.date || "no date"} — ${h.title}: ${h.body.slice(0, 500)}`)
        .join("\n");
      const caseContext = settings.shareContext ? await buildCaseSnapshot(settings.county) : null;
      let acc = "";
      await streamAdvocate({
        connection: settings.connection,
        apiKey: settings.apiKey,
        model: settings.model,
        caseContext,
        history: [
          {
            role: "user",
            content: `I searched my own records for "${q}". Here are the ${forAi.length} matching entries${
              truncated ? ` (of ${hits.length} total)` : ""
            }:\n\n${evidenceText}\n\nRead these and tell me what they add up to: the pattern, how it escalates or repeats over time, which specific entries are the strongest for court and why, what's missing or uncorroborated, and what I should do next. Cite the entries by date when you refer to them. Be concrete — this is my own evidence, not a hypothetical.`,
          },
        ],
        onDelta: (d) => {
          acc += d;
          setAnswer(acc);
        },
      });
    } catch (e: any) {
      setError(e?.message || "Couldn't reach The Advocate.");
    } finally {
      setBusy(false);
    }
  };

  const saveAnswer = async () => {
    const now = Date.now();
    await db.documents.add({
      title: `Analysis: "${q}"`.slice(0, 80),
      content: answer,
      createdAt: now,
      updatedAt: now,
    });
    alert("Saved to Documents — print it or bring it to your attorney.");
  };

  return (
    <div>
      <h1>Search everything</h1>
      <p className="muted">
        Searches every incident, every message in the archive, violations, evidence, money entries,
        dates, and documents — exactly, so nothing is missed. Then The Advocate can read the results
        and tell you what they prove.
      </p>

      <div className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ flex: 1 }}
              placeholder={`a word, a name, a phrase — "money", "custody", "I'll take her"`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!q.trim()}>
              Search
            </button>
          </div>
        </form>
        <div className="quick-actions" style={{ marginTop: 10 }}>
          {["threat", "money", "her school", "police", "drinking", "custody"].map((s) => (
            <button
              key={s}
              className="btn secondary sm"
              onClick={() => {
                setQ(s);
                setTimeout(() => void search(), 0);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {hits && (
        <div className="panel">
          <h2>
            {hits.length} match{hits.length === 1 ? "" : "es"} for "{q}"
          </h2>
          {hits.length > 0 && (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>
                Found by exact matching across your whole record — every occurrence, nothing
                sampled.
              </p>
              <button className="btn" disabled={busy || needsKey} onClick={() => void analyze()}>
                {busy ? "Reading your results…" : "Ask The Advocate what these prove"}
              </button>
            </>
          )}
        </div>
      )}

      {error && <div className="notice">{error}</div>}

      {answer && (
        <div className="panel">
          <h2>What The Advocate sees</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
          {!busy && (
            <button className="btn secondary sm" onClick={() => void saveAnswer()}>
              Save to documents
            </button>
          )}
        </div>
      )}

      {hits?.slice(0, 300).map((h, i) => (
        <div className="item-card" key={i} style={{ cursor: "pointer" }} onClick={() => go(h.view)}>
          <div className="head">
            <span className="tag">{h.kind}</span>
            {h.date && <span className="date">{h.date}</span>}
            <span className="title">{h.title}</span>
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{h.body.slice(0, 400)}</p>
        </div>
      ))}

      {truncated > 0 && (
        <p className="muted small">
          Showing the first 300 — {truncated.toLocaleString()} more matched and were included in the
          analysis above.
        </p>
      )}

      {hits && hits.length === 0 && (
        <p className="muted" style={{ marginTop: 14 }}>
          Nothing matched "{q}". Try a shorter word, or a phrase he actually used.
        </p>
      )}
    </div>
  );
}
