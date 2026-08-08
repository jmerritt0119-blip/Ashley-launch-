import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { parseJournal, type ParsedEntry } from "../journalImport";
import { handoff } from "../handoff";
import { exportJournalCsv, downloadText } from "../exportCsv";
import { useDraft } from "../useDraft";
import { usePaneActive } from "../paneContext";

const today = () => new Date().toISOString().slice(0, 10);

export default function Journal({ go }: { go: (v: string) => void }) {
  const active = usePaneActive();
  const [date, setDate] = useDraft("journal.date", today());
  const [time, setTime] = useDraft("journal.time", "");
  const [title, setTitle] = useDraft("journal.title", "");
  const [body, setBody] = useDraft("journal.body", "");
  const [contemporaneous, setContemporaneous] = useDraft("journal.contemporaneous", true);
  const [saved, setSaved] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [paste, setPaste] = useDraft("journal.paste", "");
  const [preview, setPreview] = useState<ParsedEntry[] | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const entries = useLiveQuery(async () => {
    if (!active) return undefined;
    return db.journal.orderBy("date").reverse().toArray();
  }, [active]);

  const visible = (entries || []).filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return e.body.toLowerCase().includes(q) || (e.title || "").toLowerCase().includes(q);
  });

  const save = async () => {
    if (!body.trim() && !title.trim()) return;
    const now = Date.now();
    await db.journal.add({
      date: date || today(),
      time: time || undefined,
      title: title.trim() || undefined,
      body: body.trim(),
      tags: [],
      contemporaneous,
      source: "typed",
      createdAt: now,
      updatedAt: now,
    });
    setTitle("");
    setBody("");
    setTime("");
    setSaved("Saved to your journal.");
    setTimeout(() => setSaved(null), 2500);
  };

  const commitImport = async () => {
    if (!preview?.length) return;
    const now = Date.now();
    // Skip entries already present, so importing the same export twice is safe.
    const existing = new Set(
      (await db.journal.toArray()).map((e) => `${e.date}|${e.body.slice(0, 200)}`)
    );
    const fresh = preview.filter((p) => !existing.has(`${p.date}|${p.body.slice(0, 200)}`));
    if (fresh.length) {
      await db.journal.bulkAdd(
        fresh.map((p) => ({
          date: p.date || today(),
          time: p.time,
          title: p.title,
          body: p.body,
          tags: [],
          // Imported writing was written at the time, which is the whole point.
          contemporaneous: true,
          source: "imported",
          createdAt: now,
          updatedAt: now,
        }))
      );
    }
    const skipped = preview.length - fresh.length;
    setImportNote(
      `Imported ${fresh.length} entr${fresh.length === 1 ? "y" : "ies"}.` +
        (skipped ? ` ${skipped} were already here and were not duplicated.` : "")
    );
    setPreview(null);
    setPaste("");
  };

  const scanJournal = async () => {
    const all = await db.journal.orderBy("date").toArray();
    if (!all.length) return;
    handoff.scanText = all
      .map(
        (e) =>
          `${e.date}${e.time ? " " + e.time : ""}${e.title ? " — " + e.title : ""}\n${e.body}`
      )
      .join("\n\n----\n\n");
    go("scan");
  };

  const undated = (entries || []).filter((e) => !e.date || e.date === today()).length;

  return (
    <div>
      <h1>Journal</h1>
      <p className="muted">
        What you wrote at the time carries weight that a later account cannot. A judge reads
        "written that night" very differently from "written for court" — so keep writing here, and
        bring in whatever you have already written elsewhere.
      </p>

      <div className="panel">
        <h2>Write an entry</h2>
        <div className="row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Time (optional)</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Title (optional)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A few words" />
        </label>
        <label className="field">
          <span>What happened, and how it felt</span>
          <textarea
            style={{ minHeight: 180 }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write freely. This is yours — nothing here is shared with anyone unless you export it."
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={contemporaneous}
            onChange={(e) => setContemporaneous(e.target.checked)}
          />
          <span>I'm writing this at the time, or close to it</span>
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => void save()} disabled={!body.trim() && !title.trim()}>
            Save entry
          </button>
          <button className="btn secondary" onClick={() => setShowImport(!showImport)}>
            Import a journal I already have
          </button>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Everything you type is kept as you type it — switching tabs, closing the browser, or
          hitting Exit will not lose it.
        </p>
        {saved && <div className="notice calm">{saved}</div>}
      </div>

      {showImport && (
        <div className="panel">
          <h2>Bring in a journal you've already written</h2>
          <p className="small">
            Copy your entries out of Apple Journal, Day One, Notes, a Google Doc — anything — and
            paste them below. Entries are split on their date headings (<em>Wednesday, July 8</em>,{" "}
            <em>7/8/25</em>, <em>2025-07-08</em>, and similar). Anything without a date is still kept.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <label className="btn secondary" style={{ cursor: "pointer" }}>
              Upload a .txt file
              <input
                type="file"
                accept=".txt,.md,text/plain"
                style={{ display: "none" }}
                onChange={async (ev) => {
                  const f = ev.target.files?.[0];
                  ev.target.value = "";
                  if (!f) return;
                  const t = await f.text();
                  setPaste(t);
                  setPreview(parseJournal(t));
                }}
              />
            </label>
          </div>
          <textarea
            style={{ minHeight: 160 }}
            placeholder="Paste your journal here…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              className="btn secondary"
              onClick={() => setPreview(parseJournal(paste))}
              disabled={!paste.trim()}
            >
              Preview
            </button>
            {preview && preview.length > 0 && (
              <button className="btn" onClick={() => void commitImport()}>
                Import {preview.length} entr{preview.length === 1 ? "y" : "ies"}
              </button>
            )}
          </div>
          {preview && (
            <div style={{ marginTop: 12, maxHeight: 260, overflowY: "auto" }}>
              {preview.length === 0 && (
                <p className="muted small">Nothing found to import from that text.</p>
              )}
              {preview.slice(0, 40).map((p, i) => (
                <div
                  key={i}
                  className="small"
                  style={{ padding: "5px 0", borderBottom: "1px solid var(--line)" }}
                >
                  <strong>{p.date || "(no date found — you can fix it after importing)"}</strong>
                  {p.time ? ` ${p.time}` : ""} · {p.body.slice(0, 130)}
                </div>
              ))}
              {preview.length > 40 && (
                <p className="muted small">…and {preview.length - 40} more.</p>
              )}
            </div>
          )}
          {importNote && <div className="notice calm">{importNote}</div>}
        </div>
      )}

      {(entries?.length || 0) > 0 && (
        <div className="panel">
          <h2>What to do with it</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => void scanJournal()}>
              Have the AI read my journal for evidence
            </button>
            <button className="btn secondary" onClick={() => void exportJournalCsv()}>
              Export as a spreadsheet
            </button>
            <button
              className="btn secondary"
              onClick={async () => {
                const all = await db.journal.orderBy("date").toArray();
                downloadText(
                  `journal-${new Date().toISOString().slice(0, 10)}.txt`,
                  all
                    .map(
                      (e) =>
                        `${e.date}${e.time ? " " + e.time : ""}${e.title ? " — " + e.title : ""}\n\n${e.body}`
                    )
                    .join("\n\n" + "=".repeat(60) + "\n\n"),
                  "text/plain;charset=utf-8"
                );
              }}
            >
              Export as a document
            </button>
            <button className="btn secondary" onClick={() => go("packet")}>
              Everything, for my attorney →
            </button>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            The AI reads your journal the same way it reads messages — looking for incidents, for
            patterns, and for the things that support your case. Nothing is sent anywhere else.
          </p>
        </div>
      )}

      {(entries?.length || 0) > 0 && (
        <div style={{ margin: "16px 0 10px", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search your journal…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <span className="muted small">
            {visible.length} of {entries?.length} entries
            {undated > 0 ? "" : ""}
          </span>
        </div>
      )}

      {visible.slice(0, 200).map((e) => (
        <div className="item-card" key={e.id}>
          <div className="head">
            <span className="date">
              {e.date}
              {e.time ? ` ${e.time}` : ""}
            </span>
            {e.title && <span className="title">{e.title}</span>}
            {e.contemporaneous && (
              <span className="small muted" title="Written at the time — this matters in court">
                written at the time
              </span>
            )}
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{e.body}</p>
          <div className="checks" style={{ margin: 0 }}>
            <button
              className="chip"
              onClick={() => {
                if (e.id != null && confirm("Delete this journal entry? This cannot be undone."))
                  void db.journal.delete(e.id);
              }}
            >
              delete
            </button>
          </div>
        </div>
      ))}

      {entries && entries.length === 0 && (
        <p className="muted" style={{ marginTop: 14 }}>
          Nothing here yet. Write an entry above, or bring in a journal you already keep.
        </p>
      )}
    </div>
  );
}
