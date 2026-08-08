import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

interface Props {
  go: (view: string) => void;
}

export default function Search({ go }: Props) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const results = useLiveQuery(async () => {
    if (query.length < 2) return null;
    const has = (...fields: (string | undefined)[]) =>
      fields.some((f) => (f || "").toLowerCase().includes(query));
    const [incidents, messages, evidence, documents, dates] = await Promise.all([
      db.incidents.filter((i) => has(i.title, i.narrative, i.witnesses, i.location)).limit(50).toArray(),
      db.messages.filter((m) => has(m.text, m.sender)).limit(50).toArray(),
      db.evidence.filter((e) => has(e.title, e.notes, e.fileName)).limit(50).toArray(),
      db.documents.filter((d) => has(d.title, d.content)).limit(50).toArray(),
      db.dates.filter((d) => has(d.title, d.notes, d.location)).limit(50).toArray(),
    ]);
    return { incidents, messages, evidence, documents, dates };
  }, [query]);

  const total = results
    ? results.incidents.length +
      results.messages.length +
      results.evidence.length +
      results.documents.length +
      results.dates.length
    : 0;

  const mark = (text: string, n = 180) => {
    const i = text.toLowerCase().indexOf(query);
    if (i === -1) return text.slice(0, n);
    const start = Math.max(0, i - 60);
    return (start > 0 ? "…" : "") + text.slice(start, start + n) + (text.length > start + n ? "…" : "");
  };

  return (
    <div>
      <h1>Search the case file</h1>
      <input
        type="text"
        autoFocus
        placeholder="Search everything — incidents, messages, evidence, documents, dates…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ fontSize: "1.05rem", padding: "12px 14px" }}
      />
      {query.length >= 2 && results && (
        <p className="muted small" style={{ marginTop: 8 }}>
          {total} result{total === 1 ? "" : "s"} for "{q.trim()}"
        </p>
      )}

      {results && results.incidents.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <h2>Incidents ({results.incidents.length})</h2>
          {results.incidents.map((i) => (
            <div className="item-card" key={i.id} style={{ cursor: "pointer" }} onClick={() => go("incidents")}>
              <div className="head">
                <span className="date">{i.date}</span>
                <span className="title">{i.title}</span>
              </div>
              <p className="small" style={{ margin: "4px 0 0" }}>{mark(i.narrative)}</p>
            </div>
          ))}
        </div>
      )}

      {results && results.messages.length > 0 && (
        <div className="panel">
          <h2>Messages ({results.messages.length})</h2>
          {results.messages.map((m) => (
            <div className="item-card" key={m.id} style={{ cursor: "pointer" }} onClick={() => go("messages")}>
              <div className="head">
                <span className="date">{m.date}</span>
                <span className="title">{m.sender}</span>
                {m.starred && <span>★</span>}
              </div>
              <p className="small" style={{ margin: "4px 0 0" }}>{mark(m.text)}</p>
            </div>
          ))}
        </div>
      )}

      {results && results.evidence.length > 0 && (
        <div className="panel">
          <h2>Evidence ({results.evidence.length})</h2>
          {results.evidence.map((e) => (
            <div className="item-card" key={e.id} style={{ cursor: "pointer" }} onClick={() => go("evidence")}>
              <div className="head">
                <span className="date">{e.date}</span>
                <span className="title">{e.title}</span>
                <span className="tag">{e.kind}</span>
              </div>
              {e.notes && <p className="small" style={{ margin: "4px 0 0" }}>{mark(e.notes)}</p>}
            </div>
          ))}
        </div>
      )}

      {results && results.documents.length > 0 && (
        <div className="panel">
          <h2>Documents ({results.documents.length})</h2>
          {results.documents.map((d) => (
            <div className="item-card" key={d.id} style={{ cursor: "pointer" }} onClick={() => go("documents")}>
              <div className="head">
                <span className="title">{d.title}</span>
              </div>
              <p className="small" style={{ margin: "4px 0 0" }}>{mark(d.content)}</p>
            </div>
          ))}
        </div>
      )}

      {results && results.dates.length > 0 && (
        <div className="panel">
          <h2>Key dates ({results.dates.length})</h2>
          {results.dates.map((d) => (
            <div className="item-card" key={d.id} style={{ cursor: "pointer" }} onClick={() => go("dates")}>
              <div className="head">
                <span className="date">{d.date}</span>
                <span className="title">{d.title}</span>
                <span className="tag">{d.type}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && results && total === 0 && (
        <p className="muted" style={{ marginTop: 14 }}>
          Nothing matched. Try a different word — or a shorter piece of it.
        </p>
      )}
    </div>
  );
}
