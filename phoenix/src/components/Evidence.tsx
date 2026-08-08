import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type EvidenceItem } from "../db";

const today = () => new Date().toISOString().slice(0, 10);
const KINDS = ["photo", "screenshot", "document", "audio", "video", "other"];

function Thumb({ item }: { item: EvidenceItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (item.blob && item.fileType?.startsWith("image/")) {
      const u = URL.createObjectURL(item.blob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
  }, [item.blob, item.fileType]);
  if (!url) return null;
  return <img className="evidence-thumb" src={url} alt={item.title} />;
}

export default function Evidence() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState("photo");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);

  const items = useLiveQuery(() => db.evidence.orderBy("date").reverse().toArray(), []);

  const bulkAddScreenshots = async (files: File[]) => {
    if (!files.length) return;
    const now = Date.now();
    await db.evidence.bulkAdd(
      files.map((f) => ({
        title: f.name.replace(/\.[a-z0-9]+$/i, ""),
        date: today(),
        kind: f.type.startsWith("image/") ? "screenshot" : "document",
        notes: "",
        tags: [],
        fileName: f.name,
        fileType: f.type,
        blob: f,
        createdAt: now,
      }))
    );
  };

  const save = async () => {
    if (!title.trim() && !file) return;
    await db.evidence.add({
      title: title.trim() || file?.name || "(untitled)",
      date,
      kind,
      notes,
      tags: [],
      fileName: file?.name,
      fileType: file?.type,
      blob: file ?? undefined,
      createdAt: Date.now(),
    });
    setTitle("");
    setNotes("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const download = (item: EvidenceItem) => {
    if (!item.blob) return;
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.fileName || item.title;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1>Evidence vault</h1>
      <p className="muted">
        Photos of injuries and damage, screenshots with the timestamp and contact visible, medical
        and police records, financial documents. Files are stored on this device only. Always keep
        the originals too — untouched, and backed up somewhere he can't reach.
      </p>

      <div className="panel">
        <h2>Add evidence</h2>
        <div className="row">
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              placeholder="e.g., Bruise on left arm — photo taken next morning"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Date it was created / taken</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>File (optional — you can also just index where the original lives)</span>
          <input
            ref={fileRef}
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="field">
          <span>Notes — what it shows, where the original is, who else has a copy</span>
          <textarea
            style={{ minHeight: 64 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => void save()}>
            Save to vault
          </button>
          <button className="btn secondary" onClick={() => bulkRef.current?.click()}>
            + Add several photos at once
          </button>
          <input
            ref={bulkRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              void bulkAddScreenshots(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          On iPhone the picker opens your Photos — select a whole batch of screenshots or injury
          photos and they're filed in one go (dated today; edit dates as needed).
        </p>
      </div>

      {(items || []).map((item) => (
        <div className="item-card" key={item.id}>
          <div className="head">
            <span className="date">{item.date}</span>
            <span className="title">{item.title}</span>
            <span className="tag">{item.kind}</span>
          </div>
          {item.notes && <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{item.notes}</p>}
          <Thumb item={item} />
          <div className="actions">
            {item.blob && (
              <button className="btn ghost sm" onClick={() => download(item)}>
                Download
              </button>
            )}
            <button
              className="btn ghost sm"
              onClick={() => {
                if (item.id != null && confirm("Delete this evidence entry?"))
                  void db.evidence.delete(item.id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {items && items.length === 0 && (
        <p className="muted" style={{ marginTop: 14 }}>
          The vault is empty. Even a phone photo of a document counts — add what you have.
        </p>
      )}
    </div>
  );
}
