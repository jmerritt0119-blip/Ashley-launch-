import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Doc } from "../db";
import { downloadText } from "../exportCsv";

export default function Documents() {
  const docs = useLiveQuery(() => db.documents.orderBy("updatedAt").reverse().toArray(), []);
  const [openId, setOpenId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  const open = (d: Doc) => {
    setOpenId(d.id ?? null);
    setTitle(d.title);
    setContent(d.content);
    setSaved(true);
  };

  const createNew = () => {
    setOpenId(-1);
    setTitle("");
    setContent("");
    setSaved(false);
  };

  const save = async () => {
    const now = Date.now();
    const t = title.trim() || "Untitled document";
    if (openId === -1) {
      const id = (await db.documents.add({ title: t, content, createdAt: now, updatedAt: now })) as number;
      setOpenId(id);
    } else if (openId != null) {
      await db.documents.update(openId, { title: t, content, updatedAt: now });
    }
    setSaved(true);
  };

  // Autosave a moment after typing stops.
  useEffect(() => {
    if (openId == null || openId === -1) return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  if (openId != null) {
    return (
      <div>
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button className="btn ghost" onClick={() => setOpenId(null)}>
            ← All documents
          </button>
          {openId === -1 && (
            <button className="btn" onClick={() => void save()}>
              Save
            </button>
          )}
          <button className="btn secondary" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <button
            className="btn secondary"
            onClick={() => downloadText(`${(title || "document").replace(/[^\w-]+/g, "-").slice(0, 40)}.txt`, content, "text/plain;charset=utf-8")}
          >
            Download .txt
          </button>
          {openId !== -1 && (
            <button
              className="btn ghost"
              onClick={() => {
                if (confirm("Delete this document?")) {
                  void db.documents.delete(openId);
                  setOpenId(null);
                }
              }}
            >
              Delete
            </button>
          )}
          <span className="muted small" style={{ alignSelf: "center" }}>
            {openId === -1 ? "Not saved yet" : saved ? "Saved" : "Saving…"}
          </span>
        </div>
        <div className="panel">
          <input
            type="text"
            placeholder="Document title"
            value={title}
            style={{ fontFamily: "var(--serif)", fontSize: "1.2rem", fontWeight: 700, marginBottom: 10 }}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaved(false);
            }}
          />
          <textarea
            style={{ minHeight: "55vh", lineHeight: 1.6 }}
            placeholder="Write here — or save an answer from The Advocate and polish it into a working draft…"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setSaved(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Documents</h1>
      <p className="muted">
        Working drafts and saved Advocate outputs — declaration outlines, hearing preparation,
        question lists — kept as named documents you can edit, print, and bring to your attorney.
        Save any AI answer here with its "Save to documents" button.
      </p>
      <button className="btn" onClick={createNew}>
        + New document
      </button>
      <div style={{ marginTop: 14 }}>
        {(docs || []).map((d) => (
          <div className="item-card" key={d.id} style={{ cursor: "pointer" }} onClick={() => open(d)}>
            <div className="head">
              <span className="title">{d.title}</span>
              <span className="muted small">updated {new Date(d.updatedAt).toLocaleDateString()}</span>
            </div>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {d.content.slice(0, 160)}
              {d.content.length > 160 ? "…" : ""}
            </p>
          </div>
        ))}
        {docs && docs.length === 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            Nothing here yet. Ask The Advocate for a declaration outline or hearing prep, then save
            it as a document.
          </p>
        )}
      </div>
    </div>
  );
}
