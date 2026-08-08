import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, MESSAGE_TAGS, type Msg } from "../db";
import { messagesFromCsv, messagesFromText } from "../parseMessages";

const today = () => new Date().toISOString().slice(0, 10);

export default function Messages() {
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [defaultSender, setDefaultSender] = useState("Him");
  const [defaultDate, setDefaultDate] = useState(today());
  const [preview, setPreview] = useState<{ date: string; sender: string; text: string }[] | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const messages = useLiveQuery(() => db.messages.orderBy("date").reverse().toArray(), []);

  const visible = (messages || []).filter((m) => {
    if (starredOnly && !m.starred) return false;
    if (tagFilter && !m.tags.includes(tagFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!m.text.toLowerCase().includes(q) && !m.sender.toLowerCase().includes(q)) return false;
    }
    return true;
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

  const toggleStar = (m: Msg) => {
    if (m.id != null) void db.messages.update(m.id, { starred: !m.starred });
  };

  const toggleTag = (m: Msg, tag: string) => {
    if (m.id == null) return;
    const tags = m.tags.includes(tag) ? m.tags.filter((t) => t !== tag) : [...m.tags, tag];
    void db.messages.update(m.id, { tags });
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
      </div>

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
        <span className="muted small">{visible.length} shown</span>
      </div>

      {visible.slice(0, 400).map((m) => (
        <div className="item-card" key={m.id}>
          <div className="head">
            <button className="star-btn" title="Star as significant" onClick={() => toggleStar(m)}>
              {m.starred ? "★" : "☆"}
            </button>
            <span className="date">{m.date}</span>
            <span className="title">{m.sender}</span>
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{m.text}</p>
          <div className="checks" style={{ margin: 0 }}>
            {MESSAGE_TAGS.map((t) => (
              <button
                key={t}
                className={`chip ${m.tags.includes(t) ? "on" : ""}`}
                onClick={() => toggleTag(m, t)}
              >
                {t}
              </button>
            ))}
            <button
              className="chip"
              onClick={() => {
                if (m.id != null && confirm("Delete this message from the index?"))
                  void db.messages.delete(m.id);
              }}
            >
              delete
            </button>
          </div>
        </div>
      ))}

      {messages && messages.length === 0 && (
        <p className="muted" style={{ marginTop: 14 }}>
          No messages yet. Paste a conversation or upload an export to begin.
        </p>
      )}
    </div>
  );
}
