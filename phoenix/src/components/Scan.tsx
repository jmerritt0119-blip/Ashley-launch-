import { useEffect, useRef, useState } from "react";
import { db } from "../db";
import { streamAdvocate } from "../claude";
import { handoff } from "../handoff";
import {
  buildScanPrompt,
  chunkScanInput,
  mergeScanResults,
  parseScanResult,
  SCAN_CHUNK_SIZE,
  SCAN_MODEL,
  type ScanResult,
} from "../scan";
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
  const [remaining, setRemaining] = useState<number[]>([]);
  const [loadedNote, setLoadedNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);
  const chunksRef = useRef<string[]>([]);
  const partsRef = useRef<ScanResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const needsKey = settings.connection === "direct" && !settings.apiKey;
  const estParts = Math.max(1, Math.ceil(text.trim().length / SCAN_CHUNK_SIZE));

  const onFiles = async (files: File[]) => {
    const texts: string[] = [];
    for (const f of files) texts.push(await f.text());
    const combined = [text.trim(), ...texts].filter(Boolean).join("\n\n");
    if (combined.length > 300_000) {
      // Giant upload: don't render it into the textarea — start scanning it.
      setText("");
      setLoadedNote(
        `File loaded — ${combined.length.toLocaleString()} characters (kept out of the text box to stay fast).`
      );
      void run(false, combined);
    } else {
      setText(combined);
    }
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

  const applyMerged = (merged: ScanResult) => {
    setResult(merged);
    setPickedInc(new Set(merged.incidents.map((_, i) => i)));
    setPickedMsg(new Set(merged.messages.map((_, i) => i)));
  };

  // The home screen can hand a freshly uploaded file straight here — load it
  // and start scanning immediately, so upload-to-catalog is one tap. Huge
  // files stay out of the textarea (rendering millions of characters would
  // lag a phone); the scan itself runs from memory either way.
  useEffect(() => {
    const t = handoff.scanText;
    if (t && t.trim()) {
      handoff.scanText = null;
      if (t.length > 300_000) {
        setLoadedNote(
          `File loaded — ${t.length.toLocaleString()} characters (kept out of the text box to stay fast).`
        );
      } else {
        setText(t);
      }
      void run(false, t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (resume = false, docOverride?: string) => {
    if (busy || needsKey) return;
    let chunks: string[];
    let indices: number[];
    if (resume && chunksRef.current.length && remaining.length) {
      chunks = chunksRef.current;
      indices = [...remaining];
    } else {
      const doc = (docOverride ?? text).trim();
      if (!doc) return;
      chunks = chunkScanInput(doc);
      chunksRef.current = chunks;
      partsRef.current = [];
      indices = chunks.map((_, i) => i);
      setResult(null);
    }
    setBusy(true);
    setError(null);
    setAdded(null);
    setRemaining([]);
    const abort = new AbortController();
    abortRef.current = abort;
    const failed: number[] = [];
    const parts = partsRef.current;

    for (let n = 0; n < indices.length; n++) {
      const idx = indices[n];
      if (abort.signal.aborted) {
        failed.push(...indices.slice(n));
        break;
      }
      const label = chunks.length > 1 ? `part ${idx + 1} of ${chunks.length}` : "the document";
      const found = mergeScanResults(parts);
      const foundNote =
        parts.length > 0
          ? ` ${found.incidents.length} incidents & ${found.messages.length} messages found so far.`
          : "";
      setProgress(`The Advocate is reading ${label}…${foundNote}`);
      let ok = false;
      const backoff = [2000, 5000];
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          let acc = "";
          const full = await streamAdvocate({
            connection: settings.connection,
            apiKey: settings.apiKey,
            // Scans are pinned to Opus regardless of the chat model picker —
            // cataloging must be as careful as the case deserves.
            model: SCAN_MODEL,
            history: [
              {
                role: "user",
                content: buildScanPrompt(chunks[idx], { index: idx + 1, total: chunks.length }),
              },
            ],
            caseContext: null,
            signal: abort.signal,
            onDelta: (d) => {
              acc += d;
              setProgress(`Cataloging ${label}… (${acc.length.toLocaleString()} characters)${foundNote}`);
            },
          });
          parts.push(parseScanResult(full || acc));
          ok = true;
        } catch {
          if (abort.signal.aborted) break;
          if (attempt < 2) await new Promise((r) => setTimeout(r, backoff[attempt]));
        }
      }
      if (!ok && !abort.signal.aborted) failed.push(idx);
      if (parts.length) applyMerged(mergeScanResults(parts));
    }

    setRemaining(failed);
    if (abort.signal.aborted) {
      setError(
        failed.length
          ? `Scan stopped — ${chunks.length - failed.length} of ${chunks.length} parts are cataloged below. Tap "Scan remaining parts" to finish anytime.`
          : "Scan stopped."
      );
    } else if (failed.length) {
      setError(
        `${failed.length} of ${chunks.length} part${failed.length === 1 ? "" : "s"} (${failed
          .map((i) => i + 1)
          .join(", ")}) hit a connection error and ${
          failed.length === 1 ? "was" : "were"
        } skipped — everything else is cataloged below. Tap "Scan remaining parts" to finish.`
      );
    }
    setBusy(false);
    setProgress("");
    abortRef.current = null;
  };

  const stop = () => abortRef.current?.abort();

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
    setRemaining([]);
    setLoadedNote(null);
    chunksRef.current = [];
    partsRef.current = [];
  };

  return (
    <div>
      <h1>Upload & deep scan</h1>
      <p className="muted">
        Dump an entire report — a full message export, a journal, emails, anything — and The
        Advocate will read all of it, find every instance of abuse, and catalog each one as a
        dated, categorized entry. There's no size limit: big documents are scanned in parts,
        automatically. You review before anything is saved.
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
          placeholder="Paste the document here — the whole thing, any size — or upload files / screenshots below…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {loadedNote && (
          <p className="muted small" style={{ margin: "6px 0", fontWeight: 700 }}>
            {loadedNote}
          </p>
        )}
        <p className="muted small" style={{ margin: "6px 0" }}>
          {text.trim().length.toLocaleString()} characters
          {text.trim().length > SCAN_CHUNK_SIZE
            ? ` — will scan in ${estParts} parts, automatically`
            : " — no size limit; paste or upload the whole export"}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || needsKey || !text.trim()} onClick={() => void run()}>
            {busy ? "Scanning…" : "Scan & catalog"}
          </button>
          {busy && (
            <button className="btn ghost" onClick={stop}>
              Stop (keeps what's found)
            </button>
          )}
          {!busy && remaining.length > 0 && (
            <button className="btn secondary" onClick={() => void run(true)}>
              Scan remaining parts ({remaining.length})
            </button>
          )}
          <button className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            Upload file (.csv, .txt…)
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => shotRef.current?.click()}>
            Add screenshots (OCR)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,.tsv,.log,.md,.json,text/plain,text/csv"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) void onFiles(files);
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
        <p className="muted small" style={{ marginTop: 8 }}>
          Deep scans always run on Claude Opus 5. A very large export takes a while — keep this
          tab open; you can stop anytime and finish later, and results appear below as each part
          completes.
        </p>
      </div>

      {error && <div className="notice">{error}</div>}
      {added && <div className="notice calm">{added}</div>}

      {result && (
        <>
          <div className="panel">
            <h2>What the scan found</h2>
            {result.summary && <p style={{ whiteSpace: "pre-wrap" }}>{result.summary}</p>}
            <label className="field" style={{ maxWidth: 280 }}>
              <span>Date to use for undated items (marked for you to confirm)</span>
              <input type="date" value={fallbackDate} onChange={(e) => setFallbackDate(e.target.value)} />
            </label>
            <button className="btn" disabled={busy} onClick={() => void commit()}>
              Add {pickedInc.size + pickedMsg.size} selected to my records
            </button>
            {busy && (
              <p className="muted small" style={{ marginTop: 6 }}>
                Still scanning — the list below grows as parts finish. Save when it's done (or
                stop first).
              </p>
            )}
          </div>

          {result.incidents.length > 0 && (
            <div className="panel">
              <h2>Incidents found ({result.incidents.length})</h2>
              {result.incidents.length > 400 && (
                <p className="muted small">
                  Showing the first 400 to keep this page fast — every one of the{" "}
                  {result.incidents.length.toLocaleString()} is selected and will be saved.
                </p>
              )}
              {result.incidents.slice(0, 400).map((i, idx) => (
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
              {result.messages.length > 400 && (
                <p className="muted small">
                  Showing the first 400 to keep this page fast — every one of the{" "}
                  {result.messages.length.toLocaleString()} is selected and will be saved.
                </p>
              )}
              {result.messages.slice(0, 400).map((m, idx) => (
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
