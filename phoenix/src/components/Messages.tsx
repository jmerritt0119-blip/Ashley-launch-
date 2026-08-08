import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, MESSAGE_TAGS, type Msg } from "../db";
import { messagesFromCsv, messagesFromText } from "../parseMessages";
import { ocrImages } from "../ocr";
import { useDraft } from "../useDraft";
import { searchMessages } from "../messageIndex";
import { usePaneActive } from "../paneContext";

const today = () => new Date().toISOString().slice(0, 10);

/** How many rows are drawn at once. The archive can hold tens of thousands. */
const PAGE = 400;

export default function Messages() {
  const active = usePaneActive();
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText] = useDraft("messages.paste", "");
  const [defaultSender, setDefaultSender] = useDraft("messages.sender", "Him");
  const [defaultDate, setDefaultDate] = useState(today());
  const [preview, setPreview] = useState<
    { date: string; time?: string; sender: string; text: string }[] | null
  >(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  /**
   * Edits she has made that the database has confirmed, held here so a chip
   * flips the instant she taps it. Re-reading a 27,000-row archive takes a
   * moment, and during that moment the old value would otherwise still be on
   * screen — which reads as "it didn't save".
   */
  const [edits, setEdits] = useState<Record<number, Partial<Msg>>>({});
  const [savedId, setSavedId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<number | undefined>(undefined);

  // Typing shouldn't re-scan the whole archive on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [search]);

  /**
   * Searching runs against an in-memory index of the archive rather than
   * walking the database each time, so a word that matches nothing is as fast
   * as one that matches everything. Only the rows actually shown are read back
   * out of the database, and they carry their current values.
   */
  const [result, setResult] = useState<{ rows: Msg[]; more: boolean } | undefined>(undefined);
  const total = useLiveQuery(() => db.messages.count(), [], 0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void searchMessages({ query, tag: tagFilter, starredOnly, limit: PAGE }).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [query, tagFilter, starredOnly, active, total, savedId]);

  const page = result?.rows;
  const more = !!result?.more;
  const visible = (page || []).map((m) => {
    const patch = m.id != null ? edits[m.id] : undefined;
    return patch ? { ...m, ...patch } : m;
  });

  const buildPreview = () => {
    const parsed = messagesFromText(pasteText, { date: defaultDate, sender: defaultSender });
    setPreview(parsed);
  };

  const onFile = async (f: File) => {
    const text = await f.text();
    const parsed = f.name.toLowerCase().endsWith(".csv")
      ? messagesFromCsv(text)
      : messagesFromText(text, { date: defaultDate, sender: defaultSender });
    setPreview(parsed);
    setShowImport(true);
  };

  const commitImport = async (source: string) => {
    if (!preview || preview.length === 0) return;
    const now = Date.now();
    await db.messages.bulkAdd(
      preview.map((p) => ({
        date: p.date,
        time: p.time || undefined,
        sender: p.sender,
        text: p.text,
        source,
        tags: [],
        starred: false,
        createdAt: now,
      }))
    );
    setPreview(null);
    setPasteText("");
    setShowImport(false);
  };

  const onScreenshots = async (files: File[]) => {
    if (!files.length) return;
    setShowImport(true);
    try {
      const text = await ocrImages(files, (i, n) => setOcrStatus(`Reading screenshot ${i} of ${n}…`));
      setPasteText((t) => (t ? t + "\n\n" : "") + text);
      setOcrStatus(
        "Text extracted below — fix any misreads, set the defaults, then Preview. (Screenshots never leave this device.)"
      );
    } catch (e: any) {
      setOcrStatus(
        "Couldn't read the screenshots: " + (e?.message || "OCR failed") + " (OCR needs a network connection the first time it runs.)"
      );
    }
  };

  /**
   * Write one field and prove it landed. The change shows immediately, the
   * database is asked to confirm it, and if the write fails for any reason the
   * chip goes back to where it was and she is told — silence is not an option
   * when the record is the case.
   */
  const persist = async (m: Msg, patch: Partial<Msg>) => {
    if (m.id == null) return;
    const id = m.id;
    const before: Partial<Msg> = {};
    for (const k of Object.keys(patch) as (keyof Msg)[]) (before as any)[k] = m[k];

    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
    setSaveError(null);
    try {
      const changed = await db.messages.update(id, patch);
      if (changed === 0) throw new Error("that message is no longer in the archive");
      // Read it back. A save she can't verify is a save she can't rely on.
      const row = await db.messages.get(id);
      if (!row) throw new Error("could not read the message back after saving");
      setEdits((e) => ({ ...e, [id]: { ...e[id], tags: row.tags || [], starred: !!row.starred } }));
      setSavedId(id);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSavedId(null), 1400);
    } catch (err: any) {
      setEdits((e) => ({ ...e, [id]: { ...e[id], ...before } }));
      setSaveError(
        `That change did not save — ${err?.message || "the browser refused the write"}. Nothing was lost; try again, and if it keeps failing make a backup from Settings before doing anything else.`
      );
    }
  };

  const toggleStar = (m: Msg) => void persist(m, { starred: !m.starred });

  const toggleTag = (m: Msg, tag: string) => {
    const current = m.tags || [];
    const tags = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    void persist(m, { tags });
  };

  return (
    <div>
      <h1>Messages</h1>
      <p className="muted">
        Texts are often the strongest written record of threats, control, and admissions. Import
        them, then <strong>star</strong> the significant ones and tag what they show. Keep the
        originals on your phone untouched — screenshots and carrier records are the proof; this is
        your working index.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setShowImport(!showImport)}>
          + Import / paste messages
        </button>
        <button className="btn secondary" onClick={() => fileRef.current?.click()}>
          Upload .csv or .txt export
        </button>
        <button className="btn secondary" onClick={() => shotRef.current?.click()}>
          From screenshots (OCR)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        <input
          ref={shotRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            void onScreenshots(files);
            e.target.value = "";
          }}
        />
      </div>

      <details className="panel" style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>
           Getting texts off an iPhone (iMessage)
        </summary>
        <ul className="small" style={{ marginTop: 10 }}>
          <li>
            <strong>Screenshots (easiest):</strong> screenshot the thread — scroll so the contact
            name and timestamps show — then tap <em>From screenshots (OCR)</em> above and select
            them from your Photos. The text is extracted right on this device.
          </li>
          <li>
            <strong>Live Text:</strong> in Photos, touch and hold the text inside a screenshot,
            Select All → Copy, then paste into the box above.
          </li>
          <li>
            <strong>On a Mac:</strong> if Messages syncs via iCloud, open the conversation in the
            Messages app, select messages, copy, and paste here.
          </li>
          <li>
            <strong>Full exports:</strong> tools like iMazing can export whole iMessage threads to
            CSV from an iPhone backup — upload the CSV above and it parses with dates and senders.
          </li>
          <li className="muted">
            Keep the original thread on the phone untouched — screenshots plus carrier records
            (your attorney can subpoena them) are the proof; this app is your working index. If you
            think the phone is monitored, do this from a safer device.
          </li>
        </ul>
      </details>

      {showImport && (
        <div className="panel" style={{ marginTop: 14 }}>
          <h2>Paste a conversation</h2>
          <p className="muted small">
            WhatsApp exports ("[3/14/24, 9:12 PM] Name: …" or "3/14/24, 21:12 - Name: …") parse
            automatically with dates and senders. Anything else is captured line-by-line using the
            defaults below — you can fix dates later.
          </p>
          <div className="row">
            <label className="field">
              <span>Default sender for unlabeled lines</span>
              <input value={defaultSender} onChange={(e) => setDefaultSender(e.target.value)} />
            </label>
            <label className="field">
              <span>Default date for unlabeled lines</span>
              <input type="date" value={defaultDate} onChange={(e) => setDefaultDate(e.target.value)} />
            </label>
          </div>
          {ocrStatus && <div className="notice calm">{ocrStatus}</div>}
          <textarea
            style={{ minHeight: 140 }}
            placeholder="Paste the conversation here…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn secondary" onClick={buildPreview} disabled={!pasteText.trim()}>
              Preview
            </button>
            {preview && (
              <button className="btn" onClick={() => void commitImport("paste")}>
                Import {preview.length} message{preview.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
          {preview && (
            <div style={{ marginTop: 12, maxHeight: 220, overflowY: "auto" }}>
              {preview.slice(0, 50).map((p, idx) => (
                <div key={idx} className="small" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                  <strong>{p.date}</strong> · {p.sender}: {p.text.slice(0, 140)}
                </div>
              ))}
              {preview.length > 50 && (
                <p className="muted small">…and {preview.length - 50} more.</p>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ margin: "16px 0 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search text or sender…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">All tags</option>
          {MESSAGE_TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className={`chip ${starredOnly ? "on" : ""}`} onClick={() => setStarredOnly(!starredOnly)}>
          ★ starred only
        </button>
        <span className="muted small">
          {page === undefined
            ? "loading…"
            : more
              ? `first ${PAGE} of ${total.toLocaleString()} — narrow the search to see the rest`
              : `${visible.length.toLocaleString()} shown of ${total.toLocaleString()}`}
        </span>
      </div>

      {saveError && <div className="notice warn">{saveError}</div>}
      {tagFilter && (
        <p className="muted small" style={{ marginTop: -4 }}>
          Filtered to “{tagFilter}”. Removing that tag from a message saves it and then drops it out
          of this filtered view — it is not deleted.
        </p>
      )}

      {visible.map((m) => (
        <div className="item-card" key={m.id}>
          <div className="head">
            <button className="star-btn" title="Star as significant" onClick={() => toggleStar(m)}>
              {m.starred ? "★" : "☆"}
            </button>
            <span className="date">{m.date}</span>
            <span className="title">{m.sender}</span>
            {savedId === m.id && (
              <span className="small" style={{ color: "var(--good, #2e7d32)", fontWeight: 700 }}>
                ✓ saved
              </span>
            )}
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{m.text}</p>
          <div className="checks" style={{ margin: 0 }}>
            {MESSAGE_TAGS.map((t) => (
              <button
                key={t}
                className={`chip ${(m.tags || []).includes(t) ? "on" : ""}`}
                onClick={() => toggleTag(m, t)}
              >
                {t}
              </button>
            ))}
            <button
              className="chip"
              onClick={() => {
                if (
                  m.id != null &&
                  confirm(
                    "Remove this message from your index?\n\n" +
                      "Think carefully. Once a case is underway, deleting messages — even ones " +
                      "that seem unimportant or embarrassing — can be raised against you as " +
                      "destroying evidence, and courts can instruct that the missing material " +
                      "would have hurt you.\n\n" +
                      "Storage is not a reason to delete: your whole archive is a few megabytes, " +
                      "smaller than one phone video. Nothing here slows the app down.\n\n" +
                      "If a message just isn't relevant, leave it — an untouched record is what " +
                      "makes the rest of it credible."
                  )
                )
                  void db.messages.delete(m.id);
              }}
            >
              delete
            </button>
          </div>
        </div>
      ))}

      {total === 0 && (
        <p className="muted" style={{ marginTop: 14 }}>
          No messages yet. Paste a conversation or upload an export to begin.
        </p>
      )}
    </div>
  );
}
