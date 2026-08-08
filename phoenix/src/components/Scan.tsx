import { useRef, useState } from "react";
import { db } from "../db";
import { streamAdvocate } from "../claude";
import { buildScanPrompt, parseScanResult, SCAN_INPUT_LIMIT, type ScanResult } from "../scan";
import { ocrImages } from "../ocr";
import type { Settings } from "../settings";

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  settings: Settings;
  goSettings: () => void;
}

export default function Scan({ settings, goSettings }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [pickedInc, setPickedInc] = useState<Set<number>>(new Set());
  const [pickedMsg, setPickedMsg] = useState<Set<number>>(new Set());
  const [fallbackDate, setFallbackDate] = useState(today());
  const [added, setAdded] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);

  const needsKey = settings.connection === "direct" && !settings.apiKey;

  const onFile = async (f: File) => {
    setText((await f.text()).slice(0, SCAN_INPUT_LIMIT));
  };

  const onScreenshots = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setBusy(true);
    try {
      const extracted = await ocrImages(files, (i, n) => setProgress(`Reading screenshot ${i} of ${n}…`));
      setText((t) => (t ? t + "\n\n" : "") + extracted);
    } catch (e: any) {
      setError("Couldn't read the screenshots: " + (e?.message || "OCR failed") + " (OCR needs a network connection the first time).");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const run = async () => {
    const doc = text.trim();
    if (!doc || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setAdded(null);
    setProgress("The Advocate is reading the document…");
    try {
      let acc = "";
      const full = await streamAdvocate({
        connection: settings.connection,
        apiKey: settings.apiKey,
        model: settings.model,
        history: [{ role: "user", content: buildScanPrompt(doc.slice(0, SCAN_INPUT_LIMIT)) }],
        caseContext: null,
        onDelta: (d) => {
          acc += d;
          setProgress(`Cataloging… (${acc.length.toLocaleString()} characters read)`);
        },
      });
      const parsed = parseScanResult(full || acc);
      setResult(parsed);
      setPickedInc(new Set(parsed.incidents.map((_, i) => i)));
      setPickedMsg(new Set(parsed.messages.map((_, i) => i)));
    } catch (e: any) {
      setError(e?.message || "The scan failed — try again, or scan a smaller portion.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const toggle = (set: Set<number>, i: number, save: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    save(next);
  };

  const commit = async () => {
    if (!result) return;
    const now = Date.now();
    const incidents = result.incidents.filter((_, i) => pickedInc.has(i));
    const messages = result.messages.filter((_, i) => pickedMsg.has(i));
    if (incidents.length) {
      await db.incidents.bulkAdd(
        incidents.map((i) => ({
          date: i.date || fallbackDate,
          time: "",
          title: i.title || "(from scan)",
          narrative: i.narrative + (i.date ? "" : "\n[Date not stated in source — needs confirming]"),
          categories: i.categories.length ? i.categories : ["verbal / emotional"],
          severity: i.severity,
          location: "",
          witnesses: "",
          policeReport: "",
          medical: "",
          childrenPresent: i.childrenPresent,
          createdAt: now,
        }))
      );
    }
    if (messages.length) {
      await db.messages.bulkAdd(
        messages.map((m) => ({
          date: m.date || fallbackDate,
          sender: m.sender,
          text: m.text,
          source: "scan",
          tags: m.tags,
          starred: true,
          createdAt: now,
        }))
      );
    }
    setAdded(
      `Added ${incidents.length} incident${incidents.length === 1 ? "" : "s"} and ${messages.length} flagged message${
        messages.length === 1 ? "" : "s"
      } to your records.`
    );
    setResult(null);
    setText("");
  };

  return (
    <div>
      <h1>Deep scan</h1>
      <p className="muted">
        Dump an entire report — a full message export, a journal, emails, anything — and The
        Advocate will read all of it, find every instance of abuse, and catalog each one as a
        dated, categorized entry. You review before anything is saved.
      </p>

      {needsKey && (
        <div className="notice">
          Direct mode needs your Anthropic API key.{" "}
          <a style={{ cursor: "pointer" }} onClick={goSettings}>
            Add it in Settings
          </a>{" "}
          — or switch the AI connection to "This site's server".
        </div>
      )}

      <div className="panel">
        <textarea
          style={{ minHeight: 180 }}
          placeholder="Paste the document here — or upload a file / screenshots below…"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, SCAN_INPUT_LIMIT))}
        />
        <p className="muted small" style={{ margin: "6px 0" }}>
          {text.length.toLocaleString()} / {SCAN_INPUT_LIMIT.toLocaleString()} characters
          {text.length >= SCAN_INPUT_LIMIT ? " — limit reached; scan this part, then paste the rest." : ""}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || needsKey || !text.trim()} onClick={() => void run()}>
            {busy ? "Scanning…" : "Scan & catalog"}
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            Upload text file
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => shotRef.current?.click()}>
            Add screenshots (OCR)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.log,.md,text/plain,text/csv"
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
        {progress && <p className="muted small" style={{ marginTop: 8 }}>{progress}</p>}
      </div>

      {error && <div className="notice">{error}</div>}
      {added && <div className="notice calm">{added}</div>}

      {result && (
        <>
          {result.summary && (
            <div className="panel">
              <h2>What the scan found</h2>
              <p>{result.summary}</p>
              <label className="field" style={{ maxWidth: 280 }}>
                <span>Date to use for undated items (marked for you to confirm)</span>
                <input type="date" value={fallbackDate} onChange={(e) => setFallbackDate(e.target.value)} />
              </label>
              <button className="btn" onClick={() => void commit()}>
                Add {pickedInc.size + pickedMsg.size} selected to my records
              </button>
            </div>
          )}

          {result.incidents.length > 0 && (
            <div className="panel">
              <h2>Incidents found ({result.incidents.length})</h2>
              {result.incidents.map((i, idx) => (
                <div className="item-card" key={idx}>
                  <div className="head">
                    <input
                      type="checkbox"
                      checked={pickedInc.has(idx)}
                      onChange={() => toggle(pickedInc, idx, setPickedInc)}
                      style={{ width: "auto" }}
                    />
                    <span className="date">{i.date || "date unknown"}</span>
                    <span className="title">{i.title}</span>
                    <span className="sev-dots">{"●".repeat(i.severity)}{"○".repeat(5 - i.severity)}</span>
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{i.narrative}</p>
                  <div className="tags">
                    {i.categories.map((c) => (
                      <span className="tag" key={c}>
                        {c}
                      </span>
                    ))}
                    {i.childrenPresent && <span className="tag sev">children present</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.messages.length > 0 && (
            <div className="panel">
              <h2>Messages to flag ({result.messages.length})</h2>
              {result.messages.map((m, idx) => (
                <div className="item-card" key={idx}>
                  <div className="head">
                    <input
                      type="checkbox"
                      checked={pickedMsg.has(idx)}
                      onChange={() => toggle(pickedMsg, idx, setPickedMsg)}
                      style={{ width: "auto" }}
                    />
                    <span className="date">{m.date || "date unknown"}</span>
                    <span className="title">{m.sender}</span>
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>"{m.text}"</p>
                  <div className="tags">
                    {m.tags.map((t) => (
                      <span className="tag" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
