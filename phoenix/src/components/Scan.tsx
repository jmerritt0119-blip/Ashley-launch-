import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { addMessagesDeduped, db, isTimestampOnly } from "../db";
import { streamAdvocate } from "../claude";
import { handoff } from "../handoff";
import {
  buildScanPrompt,
  chunkScanInput,
  estimateScanTime,
  mergeScanResults,
  parseScanResult,
  SCAN_CHUNK_SIZE,
  SCAN_MODEL,
  SCANNER_VERSION,
  type ScanResult,
} from "../scan";
import {
  analysisAsText,
  buildSynthesisPrompt,
  lethalityCount,
  parseCaseAnalysis,
  type CaseAnalysis,
} from "../synthesis";
import { takeSnapshot } from "../safety";
import { readAnyFiles } from "../readAnyFile";
import { messagesFromCsv, type ParsedMessage } from "../parseMessages";
import type { Settings } from "../settings";
import { recordImport, sha256Hex } from "../integrity";

/**
 * Is this actually a spreadsheet, or is it prose that happens to contain commas?
 *
 * It has to be a header row, and it has to name the column holding the message
 * text. Without one, messagesFromCsv falls back to assuming the first three
 * columns are date, sender and text — which is a reasonable guess for a real
 * export and a catastrophic one for ordinary writing.
 *
 * "if the cops come here again, I'll tell them you hit me first, and who do you
 * think they believe" contains two commas, so it was being read as three
 * columns and filed as a message from a sender called "I'll tell them you hit
 * me first" whose text was "and who do you think they believe". Her own words,
 * cut into fragments and attributed to people who do not exist, in the archive
 * that goes to her attorney.
 *
 * Requiring the header is the difference between recognising a file and
 * guessing at one. A genuine phone export always carries it.
 */
function looksLikeCsvExport(doc: string): boolean {
  const firstLine = doc.slice(0, 4000).split("\n")[0] || "";
  if (!firstLine.includes(",")) return false;
  const header = firstLine.toLowerCase();
  // The same column the parser needs in order to know what the message is.
  return /(^|,)\s*"?[^,"]*(text|body|message|content)[^,"]*"?\s*(,|$)/.test(header);
}

/**
 * A CSV export is imported by code, not by the AI: every row lands in the
 * archive verbatim before a single token is spent. The model's job is then
 * only to flag and categorize — so a model mistake can never lose a message.
 */
function detectCsvMessages(doc: string): ParsedMessage[] {
  if (!looksLikeCsvExport(doc)) return [];
  try {
    const rows = messagesFromCsv(doc);
    return rows.length >= 3 ? rows : [];
  } catch {
    return [];
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * An unfinished scan, kept on disk so closing the tab does not throw it away.
 *
 * All of it used to live in React state and refs: the document, the chunks, the
 * parts already catalogued, and the list of parts still to do. The app told her
 * to "tap Scan remaining parts to finish" — a promise it could not keep, because
 * a reload erased every one of those. Finishing then meant re-uploading millions
 * of characters and paying for the whole scan a second time.
 *
 * Only the parts NOT yet done are stored, plus what has been found so far, which
 * is far smaller than the original export and enough to finish.
 */
const SCAN_STATE_KEY = "scanInProgress";

/**
 * The findings themselves, kept separately from the unfinished-scan state.
 *
 * They needed their own key because of the shape of the other one: the
 * in-progress record is deliberately deleted the moment nothing is left to do,
 * and it is only ever restored when parts remain. Both of those are right for
 * resuming a scan and catastrophic for keeping a finished one. A scan that ran
 * all the way to the end therefore wiped its own saved copy on the last batch
 * and left the entire catalog in React state alone — so closing the tab,
 * reloading, or a phone dropping a backgrounded page threw away every finding,
 * silently, at the exact moment the scan had just succeeded.
 *
 * That is the one failure that looks identical to "the scan found nothing".
 *
 * Written after every batch and kept after the scan ends. Cleared only when she
 * files the findings into her records, which is the one point where keeping
 * them would risk adding the same incident twice.
 */
const SCAN_FINDINGS_KEY = "scanFindings";

/**
 * Is this a failure that trying again cannot fix?
 *
 * Every failed part costs five requests: three attempts, then the part is cut
 * in half and both halves are tried. That is right for an overloaded model or
 * a dropped connection, and pure waste for "the account is out of credit" —
 * which will answer the same way every time, for every part, until somebody
 * adds money. On a 47-part archive that difference is 235 pointless requests
 * against 1.
 *
 * Matched against the server's own words, which are the plain-English messages
 * the function produces for 401, 402 and 404 — not on status codes, because by
 * the time the reply reaches here it is text.
 */
const isFatalScanError = (message: string) =>
  // "usage limit" and "regain access" are here because of a real reply from the
  // live endpoint: "You have reached your specified API usage limits. You will
  // regain access on 2026-09-01." That is an account ceiling, not a shortage —
  // no amount of retrying, splitting or waiting a few minutes touches it, and
  // it does not contain any of the words this used to look for. Without a match
  // it was treated as a transient failure: every part retried, every part
  // split, every request billed, and the sentence itself — which is about
  // somebody's account limits — rendered straight onto her screen.
  /out of credit|billing|credit balance|authentication|api key|not available on this account|usage limit|regain access|quota/i.test(
    message
  );

interface SavedScan {
  chunks: string[];
  remaining: number[];
  parts: ScanResult[];
  total: number;
  savedAt: number;
}

interface SavedFindings {
  result: ScanResult;
  savedAt: number;
}

async function saveFindings(v: SavedFindings | null): Promise<void> {
  try {
    if (v) await db.kv.put({ key: SCAN_FINDINGS_KEY, value: v });
    else await db.kv.delete(SCAN_FINDINGS_KEY);
  } catch {
    /* a scan must never fail because progress could not be written */
  }
}

async function loadFindings(): Promise<SavedFindings | null> {
  try {
    const row = await db.kv.get(SCAN_FINDINGS_KEY);
    const v = row?.value as SavedFindings | undefined;
    return v?.result ? v : null;
  } catch {
    return null;
  }
}

async function saveScanState(v: SavedScan | null): Promise<void> {
  try {
    if (v) await db.kv.put({ key: SCAN_STATE_KEY, value: v });
    else await db.kv.delete(SCAN_STATE_KEY);
  } catch {
    /* a scan must never fail because progress could not be written */
  }
}

async function loadScanState(): Promise<SavedScan | null> {
  try {
    const row = await db.kv.get(SCAN_STATE_KEY);
    const v = row?.value as SavedScan | undefined;
    return v && Array.isArray(v.chunks) && v.remaining?.length ? v : null;
  } catch {
    return null;
  }
}

interface Props {
  settings: Settings;
  goSettings: () => void;
  update: (patch: Partial<Settings>) => void;
  /** True while this view is the one on screen — it stays mounted when it isn't. */
  active?: boolean;
}

export default function Scan({ settings, goSettings, update, active = true }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [pickedInc, setPickedInc] = useState<Set<number>>(new Set());
  const [pickedMsg, setPickedMsg] = useState<Set<number>>(new Set());
  const [fallbackDate, setFallbackDate] = useState(today());

  /**
   * Her answers to the things the scan could only read between the lines.
   *
   * A reading by an app proves nothing. Her own account of what happened,
   * written in her words with the message sitting next to it as corroboration,
   * is real evidence — so each reading is a question, and answering it is what
   * files it. Dismissing is equally valid and just as important: a wrong
   * reading she cannot get rid of would make the whole list untrustworthy.
   */
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [savedImplied, setSavedImplied] = useState<Set<number>>(new Set());
  // Hiding the button depends on React re-rendering, which has not happened
  // yet when someone taps twice. This closes before the first await, so a
  // double tap can never file the same account twice.
  const savingImplied = useRef<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  /**
   * The real reason a part failed, shown the moment it happens.
   *
   * It was already being captured — and then held back until the whole scan
   * finished, behind a progress line that told her the part was "too big",
   * which the code has no way of knowing. So she sat and watched eighty parts
   * fail, one by one, being given a diagnosis that was a guess, while the
   * actual sentence the server sent back was sitting in a variable.
   *
   * A scan that cannot work should say why in the first thirty seconds, not
   * after twenty minutes and a hundred billed requests.
   */
  const [liveError, setLiveError] = useState<string | null>(null);
  /**
   * The whole-case analysis, and whether it is running.
   *
   * A separate step she starts herself rather than something the scan does
   * automatically at the end, so that after a long scan she chooses when to
   * read the analysis rather than having it appear unbidden.
   */
  const [analysis, setAnalysis] = useState<CaseAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  /** How far through the parts she is, and roughly how much longer. */
  const [pct, setPct] = useState<number | null>(null);
  const [eta, setEta] = useState("");
  /** Findings the merge dropped because an earlier part already had them. */
  const [dupes, setDupes] = useState(0);
  const [added, setAdded] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number[]>([]);
  const [loadedNote, setLoadedNote] = useState<string | null>(null);
  const [archived, setArchived] = useState<number>(0);
  const [dupNote, setDupNote] = useState<string | null>(null);
  const [senders, setSenders] = useState<{ name: string; count: number }[]>([]);
  /** How many messages she already has, so the re-scan button knows to appear. */
  const archivedCount = useLiveQuery(() => db.messages.count(), [], 0);
  /**
   * How many saved messages have a date where their words should be.
   *
   * Counted rather than assumed, because this decides whether she is shown a
   * repair plan or left alone. Computed on demand instead of live: it reads
   * every row, and on her archive that is 25,000 of them.
   */
  const [broken, setBroken] = useState<number | null>(null);
  /** Set once she has cleared, so the steps keep guiding her to the end. */
  const [repairing, setRepairing] = useState(false);
  const countBroken = async () => {
    try {
      const rows = await db.messages.toArray();
      setBroken(rows.reduce((n, m) => n + (isTimestampOnly(m.text || "") ? 1 : 0), 0));
    } catch {
      setBroken(null);
    }
  };
  useEffect(() => {
    void countBroken();
    // Re-counted whenever the archive size changes — after an import, and
    // after a clear.
  }, [archivedCount]);
  const docRef = useRef<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);
  const chunksRef = useRef<string[]>([]);
  const partsRef = useRef<ScanResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const needsKey = settings.connection === "direct" && !settings.apiKey;
  const estParts = Math.max(1, Math.ceil(text.trim().length / SCAN_CHUNK_SIZE));
  const estimate = useMemo(
    () => (text.trim().length > 0 ? estimateScanTime(text.trim().length) : null),
    [text]
  );

  /**
   * The facts list is the part an attorney can act on immediately, so it gets
   * written out as a document rather than living only in this view.
   */
  const saveFactsAsDoc = async () => {
    if (!result?.facts?.length) return;
    const now = Date.now();
    const body = result.facts
      .map(
        (f) =>
          `${f.date || "(date not stated)"} — ${f.type}\n  "${f.quote}"\n  Why it matters: ${f.whyItMatters}`
      )
      .join("\n\n");
    await db.documents.add({
      title: `Case-building facts from the scan (${new Date().toISOString().slice(0, 10)})`,
      content:
        "Facts found in the message record that support the case beyond the abuse itself — " +
        "money, parenting, and statements likely to contradict his position in court.\n\n" +
        body,
      createdAt: now,
      updatedAt: now,
    });
    setAdded("Saved the case-building facts to Documents.");
  };

  /**
   * Save every message in a CSV export to the archive immediately, by code.
   * This happens before the AI runs, so the record is complete and permanent
   * even if the scan is interrupted or the model misses something.
   */
  const archiveCsv = async (doc: string): Promise<number> => {
    const rows = detectCsvMessages(doc);
    if (!rows.length) return 0;
    const now = Date.now();
    // Fingerprint the export itself, so the archive can be tied back to the
    // exact file it came from if he ever claims these texts were invented.
    void sha256Hex(doc).then((sha256) =>
      recordImport({ kind: "message export", rows: rows.length, bytes: doc.length, sha256 })
    );
    // Re-uploading the same export must not double the archive.
    const { added, skipped } = await addMessagesDeduped(
      rows.map((m) => ({
        date: m.date,
        time: m.time || undefined,
        sender: m.sender,
        text: m.text,
        source: "csv",
        tags: [],
        starred: false,
        createdAt: now,
      }))
    );
    setArchived(added);
    setDupNote(
      skipped
        ? `${skipped.toLocaleString()} of these were already in your archive and were not added again.`
        : null
    );

    // Who is in this thread? A phone-number-only export gives no clue which
    // side is his, and his words are the ones that carry weight in court.
    const counts = new Map<string, number>();
    for (const m of rows) counts.set(m.sender, (counts.get(m.sender) || 0) + 1);
    setSenders(
      [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
    );
    return rows.length;
  };

  const markHim = (name: string) => {
    const current = settings.hisNames
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const next = current.includes(name)
      ? current.filter((n) => n !== name)
      : [...current, name];
    update({ hisNames: next.join(", ") });
  };

  const isHim = (name: string) =>
    settings.hisNames
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .includes(name.trim().toLowerCase());

  /**
   * Takes whatever she has, sorts it out for her.
   *
   * Abuse does not arrive as one tidy file type. It is screenshots of texts,
   * forwarded emails, saved DMs, a PDF from a lawyer, a note she typed. The
   * uploader used to accept six text extensions and route images through a
   * separate button she had to know about — and anything else was read as text,
   * which turns a PDF into binary noise the AI then dutifully cataloged.
   *
   * One button now. Images go to OCR, readable files are read, and anything
   * that comes back as binary is named and explained rather than silently
   * feeding garbage into her case file.
   */
  const looksBinary = (t: string) =>
    // Replacement chars and NULs are what a decoded PDF/DOCX/image looks like.
    t.length > 0 && (t.match(/[\uFFFD\u0000]/g) || []).length / t.length > 0.02;

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setBusy(true);
    let out;
    try {
      out = await readAnyFiles(files, setProgress);
    } catch (e: any) {
      setBusy(false);
      setProgress("");
      setError("Couldn't read those files: " + (e?.message || "unknown error"));
      return;
    }
    setBusy(false);
    setProgress("");

    if (out.failed.length) {
      setError(
        `Read ${out.read.length} of ${files.length}. ` +
          `Couldn't read: ${out.failed.map((f) => `${f.name} (${f.reason})`).join("; ")}. ` +
          `Everything else went in fine.`
      );
    }

    const combined = [text.trim(), out.text].filter(Boolean).join("\n\n");
    if (!combined) return;
    if (combined.length > 300_000) {
      setText("");
      setLoadedNote(
        `Loaded — ${combined.length.toLocaleString()} characters (kept out of the text box to stay fast).`
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
      const { text: extracted, read, failed } = await readAnyFiles(files, setProgress);
      if (extracted) setText((t) => (t ? t + "\n\n" : "") + extracted);
      if (failed.length) {
        setError(
          `Read ${read.length} of ${files.length} — those are in the box below and safe. ` +
            `${failed.length} couldn't be read: ${failed.slice(0, 4).map((f) => f.name).join(", ")}` +
            `${failed.length > 4 ? `, and ${failed.length - 4} more` : ""}. Try those again on their own.`
        );
      }
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
    if (!active) return;
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
      return;
    }
    // An analysis she has already paid for comes back with everything else.
    void (async () => {
      try {
        const row = await db.kv.get("caseAnalysis");
        const v = row?.value as { analysis?: CaseAnalysis } | undefined;
        if (v?.analysis) setAnalysis(v.analysis);
      } catch {
        /* nothing saved */
      }
    })();
    // Nothing handed over — pick up an unfinished scan if one was left behind.
    void (async () => {
      if (busy || chunksRef.current.length || partsRef.current.length) return;
      const saved = await loadScanState();
      if (saved) {
        chunksRef.current = saved.chunks;
        partsRef.current = saved.parts;
        setRemaining(saved.remaining);
        if (saved.parts.length) applyMerged(mergeScanResults(saved.parts));
        setLoadedNote(
          `You have an unfinished scan — ${saved.remaining.length} of ${saved.total} parts left. ` +
            `Everything already read is below and saved. Tap "Scan remaining parts" to finish; ` +
            `you do not need to upload anything again.`
        );
        return;
      }
      // No scan to resume, but a finished one may have left findings she never
      // filed. Those used to vanish on reload; they are hers until she says
      // otherwise.
      const kept = await loadFindings();
      if (!kept) return;
      // Seeded as a single part so anything scanned from here merges with it
      // instead of replacing it — the merge deduplicates, so re-finding the
      // same incident cannot double it.
      partsRef.current = [kept.result];
      applyMerged(kept.result);
      const n = kept.result.incidents.length + kept.result.messages.length;
      const when = kept.savedAt ? new Date(kept.savedAt).toLocaleDateString() : "";
      setLoadedNote(
        `Still here — ${n.toLocaleString()} finding${n === 1 ? "" : "s"} from your scan` +
          `${when ? ` on ${when}` : ""}, saved on this device. Nothing has been added to your ` +
          `records yet; review them below and add the ones you want.`
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /**
   * `archiveFirst` is false when the document IS the archive.
   *
   * A re-scan renders her saved messages back into text and scans that. Feeding
   * it to the importer as well asks the app to import a file it wrote itself,
   * which at best re-adds what is already there and at worst reads her prose as
   * columns. Nothing that came out of the database goes back into it.
   */
  const run = async (resume = false, docOverride?: string, archiveFirst = true) => {
    if (busy || needsKey) return;
    let chunks: string[];
    let indices: number[];
    if (resume && chunksRef.current.length && remaining.length) {
      chunks = chunksRef.current;
      indices = [...remaining];
    } else {
      const doc = (docOverride ?? text).trim();
      if (!doc) return;
      // Reverted: the document is sent exactly as it arrives.
      //
      // Stripping the export down to date/sender/text measured beautifully —
      // 56% fewer characters, half the parts — and it is the change that sits
      // between the run that worked and the runs that did not. Cheaper is
      // worth nothing if it stops finding her evidence, so the shape the
      // scanner was proven against is the shape it gets. Speed can be revisited
      // once there is a working baseline to measure against, and not before.
      chunks = chunkScanInput(doc);
      chunksRef.current = chunks;
      indices = chunks.map((_, i) => i);
      // Findings from an earlier run are KEPT.
      //
      // Starting a scan used to clear them, so stopping a long run and
      // starting again wiped everything it had found off the screen — hours of
      // reading, gone, with no warning and nothing she did wrong. The merge
      // already deduplicates by date and content, so carrying them forward
      // costs nothing and re-finding the same incident cannot double it.
      indices = chunks.map((_, i) => i);
    }
    setBusy(true);
    setError(null);
    setLiveError(null);
    setAdded(null);
    setRemaining([]);
    // Deterministic first: if this is a message export, every row is saved to
    // the archive by code before the AI reads a single line.
    if (!resume) {
      docRef.current = chunks.join("\n");
      setPct(null);
      setEta("");
      if (archiveFirst) {
        setProgress("Saving every message to your archive…");
        try {
          const n = await archiveCsv(docOverride ?? text);
          if (n) setProgress(`${n.toLocaleString()} messages saved. Now reading them…`);
        } catch {
          /* archive failure must not block the scan */
        }
      }
    }
    const abort = new AbortController();
    abortRef.current = abort;
    const failed: number[] = [];
    // The actual reason the first part died. Every failure used to be labelled
    // "a connection error" whatever it was — an API rejection, a truncated
    // reply, a parse failure — which sent hours of debugging in the wrong
    // direction. Whatever it really is, she and I both get to see it.
    let firstError = "";
    /** True once a failure arrives that no amount of retrying can fix. */
    let fatal = false;
    /** Records the reason once, and puts it on screen straight away. */
    const noteError = (e: any) => {
      const message = String(e?.message || e || "unknown");
      if (isFatalScanError(message)) fatal = true;
      if (firstError) return;
      firstError = message;
      setLiveError(firstError);
    };
    const parts = partsRef.current;

    // A hundred and twenty-five parts is a long time to stare at a screen with
    // no idea whether it is working. She gets a bar, a real time estimate from
    // how long her own parts are actually taking, and a running count of what
    // has been found — so a slow scan reads as slow rather than as broken.
    const startedAt = Date.now();
    setPct(0);
    setEta("");
    setDupes(0);

    /** One request for one piece of text. Returns null rather than throwing. */
    const scanPiece = async (piece: string, index: number, total: number) => {
      try {
        const out = await streamAdvocate({
          connection: settings.connection,
          apiKey: settings.apiKey,
          model: SCAN_MODEL,
          history: [{ role: "user", content: buildScanPrompt(piece, { index, total }) }],
          caseContext: null,
          webSearch: false,
          mode: "scan",
          signal: abort.signal,
          onDelta: () => {},
        });
        return parseScanResult(out);
      } catch (e) {
        // Was swallowed silently, so when the split-in-half rescue failed too
        // there was nothing at all to say why.
        noteError(e);
        return null;
      }
    };

    // Four parts at a time.
    //
    // The parts are independent — each reads its own slice and returns its own
    // catalog — so running them one after another was costing wall-clock for
    // nothing. On her archive that was 152 minutes of sitting and waiting.
    // Four at once brings it to roughly forty, and everything that made a
    // sequential run safe still holds: progress is written after each batch,
    // a failure still only costs its own part, and Stop still stops.
    //
    // Deliberately four rather than more: this is her phone on her connection,
    // and hammering the API is how a run of failures starts.
    const CONCURRENCY = 4;
    let completed = 0;
    for (let b = 0; b < indices.length; b += CONCURRENCY) {
      if (abort.signal.aborted) {
        failed.push(...indices.slice(b));
        break;
      }
      const batch = indices.slice(b, b + CONCURRENCY);
      await Promise.all(batch.map(async (idx, k) => {
      const n = b + k;
      if (abort.signal.aborted) {
        failed.push(idx);
        return;
      }
      const label = chunks.length > 1 ? `part ${idx + 1} of ${chunks.length}` : "the document";
      const found = mergeScanResults(parts);
      const foundNote =
        parts.length > 0
          ? ` ${found.incidents.length} incidents & ${found.messages.length} messages found so far.`
          : "";
      setPct(Math.round((completed / indices.length) * 100));
      if (completed > 0) {
        const perPart = (Date.now() - startedAt) / completed;
        const leftMs = perPart * (indices.length - completed);
        const mins = Math.round(leftMs / 60000);
        setEta(
          leftMs < 90_000
            ? "less than two minutes left"
            : `about ${mins} minute${mins === 1 ? "" : "s"} left`
        );
      }
      setProgress(`The Advocate is reading ${label}…${foundNote}`);
      let ok = false;
      // Longer than it looks like it needs to be: the common cause of a run of
      // failures is the model being overloaded, and retrying hard makes that
      // worse while billing for every attempt.
      const backoff = [3000, 12000];
      // Whatever the last attempt managed to send, kept so a part that never
      // completes can still be salvaged rather than thrown away.
      let lastPartial = "";
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          let acc = "";
          const full = await streamAdvocate({
            connection: settings.connection,
            apiKey: settings.apiKey,
            // Pinned to SCAN_MODEL regardless of the chat model picker.
            model: SCAN_MODEL,
            history: [
              {
                role: "user",
                content: buildScanPrompt(
                  chunks[idx],
                  { index: idx + 1, total: chunks.length },
                  { his: settings.hisNames, others: settings.otherNames }
                ),
              },
            ],
            caseContext: null,
            webSearch: false,
            mode: "scan",
            signal: abort.signal,
            onDelta: (d) => {
              acc += d;
              if (acc.length > lastPartial.length) lastPartial = acc;
              setProgress(`Cataloging ${label}…${foundNote}`);
            },
          });
          const got = parseScanResult(full || acc);
          parts.push(got);
          // A reply that had to be repaired was cut off mid-catalog, and the
          // salvage path is good enough that it looks like a clean success —
          // which is how evidence goes missing with nothing on screen saying
          // so. Keep what came back (merge deduplicates, so nothing is counted
          // twice) and leave the part marked unfinished so it is split and
          // re-read, which is the only thing that recovers the cut-off tail.
          //
          // Deliberately NOT a retry: a part that was too long to finish is
          // too long every time, so three attempts would buy three identical
          // truncations and bill for all of them. Break straight out to the
          // split path.
          if (got.truncated) break;
          ok = true;
        } catch (e: any) {
          noteError(e);
          // Nothing to gain from attempts two and three.
          if (fatal || abort.signal.aborted) break;
          // Before paying for another attempt, check whether the one that just
          // failed already came back with a usable catalog. A part cut off near
          // the end still holds nearly all of its evidence, and re-running it
          // costs a full Opus request to maybe recover the tail.
          //
          // A failed 63-part scan billed 189 requests and returned nothing,
          // because every part was retried to exhaustion whether or not it had
          // already produced something. Salvage first, retry only when there is
          // genuinely nothing to keep.
          if (lastPartial.trim()) {
            try {
              const rescued = parseScanResult(lastPartial);
              if (rescued.incidents.length || rescued.messages.length) {
                parts.push(rescued);
                break;
              }
            } catch {
              /* nothing parseable yet — a retry is worth paying for */
            }
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, backoff[attempt]));
        }
      }
      // Reported as incomplete either way, so she can top it up — but the
      // evidence that did come back is kept rather than thrown away.
      // Last resort before giving up on a part: cut it in half.
      //
      // A part that cannot finish inside the platform's execution limit fails
      // identically however many times it is retried — more attempts just cost
      // more money for the same nothing. Two smaller pieces each have half the
      // work to do, and in practice both complete.
      if (!ok && !fatal && !abort.signal.aborted && chunks[idx].length > 6000) {
        // Says what it is doing, not why it thinks it has to. Splitting is
        // worth trying whatever went wrong; asserting the part was "too big"
        // when the reply was actually a rejection is how a whole day gets
        // spent shrinking things that were never too large.
        setProgress(`${label} didn't come back — trying it in two smaller pieces…`);
        const mid = chunks[idx].lastIndexOf("\n", Math.floor(chunks[idx].length / 2)) + 1 ||
          Math.floor(chunks[idx].length / 2);
        const halves = [chunks[idx].slice(0, mid), chunks[idx].slice(mid)].filter((h) => h.trim());
        let rescued = 0;
        for (const h of halves) {
          if (abort.signal.aborted) break;
          const r = await scanPiece(h, idx + 1, chunks.length);
          if (r) {
            parts.push(r);
            rescued++;
          }
        }
        if (rescued === halves.length) ok = true;
      }
      // A part that did not finish is a part still to do — including one that
      // was in flight when she pressed Stop.
      //
      // This used to exclude aborted parts, on the reasoning that stopping is
      // not a failure. But four parts run at once, so Stop lands in the middle
      // of up to four of them, and excluding those meant they were dropped:
      // never scanned, never saved, and never listed as remaining. On a 60,000
      // character part that is a quarter of a million characters of her archive
      // disappearing from the run, while the screen said the scan had merely
      // stopped. She could tap "Scan remaining parts" and still never get them.
      if (!ok) failed.push(idx);
      // Published the instant this part returns — she should watch findings
      // appear one at a time, not in silence and then four at once.
      if (parts.length) {
        const merged = mergeScanResults(parts);
        // Parts overlap at their boundaries and the same incident often shows
        // up in two of them. The merge has always dropped those silently,
        // which meant the one thing proving the app is being careful with her
        // record was invisible. Count them and say so.
        const raw =
          parts.reduce((n, p) => n + p.incidents.length + p.messages.length, 0);
        setDupes(Math.max(0, raw - merged.incidents.length - merged.messages.length));
        applyMerged(merged);
      }

      // Write progress after every part. A tab closed mid-scan now costs at
      // most the part that was in flight, instead of the entire run.
      }));

      // Written after every batch rather than every part: the same guarantee,
      // one disk write instead of four.
      completed += batch.length;
      const stillToDo = [...failed, ...indices.slice(b + batch.length)];
      await saveScanState(
        stillToDo.length
          ? { chunks, remaining: stillToDo, parts, total: chunks.length, savedAt: Date.now() }
          : null
      );
      // The findings outlive the scan that produced them. The line above
      // deletes the resume record as soon as there is nothing left to resume,
      // which used to take the only saved copy of the catalog with it.
      if (parts.length) {
        await saveFindings({ result: mergeScanResults(parts), savedAt: Date.now() });
      }

      // Stop a scan that cannot work, instead of billing for eighty parts to
      // prove it.
      //
      // When the very first parts all fail, the cause is the request itself —
      // no credit, a rejected key, a model the account cannot reach — and it
      // will fail identically every remaining part. Failing parts are the
      // expensive kind: three attempts plus two half-sized retries, five
      // requests each, for nothing. A run of failures at the start is a
      // different event from one part failing in the middle, and only the
      // second is worth pushing through.
      if (!abort.signal.aborted && (fatal || (!parts.length && completed >= 8))) {
        failed.push(...indices.slice(b + batch.length));
        abort.abort();
        setLiveError(
          (firstError || "the scan could not be completed") +
            (fatal
              ? "\n\nStopped straight away, because this is not something trying again would fix — " +
                "every remaining part would come back with the same answer."
              : "\n\nStopped after the first 8 parts, because every one of them failed the same " +
                "way and the rest would have too.") +
            " Nothing already in your records has been touched. Once that's sorted, tap scan " +
            "again — it picks up from here rather than starting over."
        );
        break;
      }
    }

    // Record which scanner produced these results, so a later, better one can
    // offer a re-scan instead of her never finding out it improved.
    if (!failed.length && !abort.signal.aborted) {
      try {
        await db.kv.put({ key: "scannerVersion", value: SCANNER_VERSION });
      } catch {
        /* never fail a completed scan over bookkeeping */
      }
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
          .slice(0, 20)
          .join(", ")}${failed.length > 20 ? "…" : ""}) could not be read and ${
          failed.length === 1 ? "was" : "were"
        } skipped — everything else is cataloged below. Tap "Scan remaining parts" to finish.` +
          // Same rule as the live banner: the real reason is shown unless it is
          // a billing or key problem, which is not hers to see or to solve.
          (firstError && !isFatalScanError(firstError)
            ? `\n\nWhat went wrong: ${firstError}`
            : "")
      );
    }
    setBusy(false);
    setProgress("");
    abortRef.current = null;
  };

  const stop = () => abortRef.current?.abort();

  /**
   * Re-read everything already in her archive, with no file involved.
   *
   * The only way to start a scan was to have text in the box — and a large
   * export is deliberately kept OUT of the box to stay fast, which left the
   * Scan button greyed out and no obvious way to run it again. The honest
   * description of that is: after her biggest upload, the app had no visible
   * restart. She was re-uploading a 3.7 MB file to get back to where she
   * already was.
   *
   * Her messages are in the database from the moment the file was read, so the
   * archive is all that is needed. One button, always available once she has
   * messages, no file, no hunting.
   */
  /**
   * Empties the message list so she can add her export again cleanly.
   *
   * Messages only. Incidents, documents, evidence files, her journal and
   * everything she has written stay untouched — those are her work, and this
   * button exists to undo an import fault, not to wipe her case.
   *
   * A restore point is taken first, so if the wrong button was pressed at the
   * worst possible moment, it is recoverable.
   */
  /**
   * Which of the three steps she is on.
   *
   * 1 — there are still broken messages saved, so clear them
   * 2 — the list is empty, so add the file
   * 3 — real messages are saved, so scan them
   */
  const step = broken && broken > 0 ? 1 : archivedCount === 0 ? 2 : 3;
  /**
   * Show the plan when the archive is actually broken, and keep showing it
   * until she has been walked all the way to a scan — otherwise clearing makes
   * the instructions vanish at the exact moment she needs step two.
   */
  const needsRepair = (broken !== null && broken > 0) || (repairing && step < 3) || (repairing && step === 3);

  const clearArchive = async () => {
    const n = archivedCount || 0;
    if (
      !confirm(
        `Remove all ${n.toLocaleString()} saved messages and start the message list over?\n\n` +
          "Your incidents, documents, photos and notes are NOT touched — only the message list.\n\n" +
          "Do this if your messages imported showing only a date instead of what was said. " +
          "Afterwards, add your export file again and it will come in properly.\n\n" +
          "A restore point is saved first, so this can be undone."
      )
    )
      return;
    setError(null);
    setProgress("Saving a restore point…");
    try {
      await takeSnapshot("before clearing the message list");
      setProgress("Clearing the message list…");
      setRepairing(true);
      await db.messages.clear();
      // Any half-finished scan refers to messages that no longer exist.
      await saveScanState(null);
      await saveFindings(null);
      setProgress("");
      setLoadedNote(null);
      setError(
        "Your message list is empty and a restore point was saved. Tap “Upload file” and add your export again — it will come in with what was actually said, and each message marked with who sent it."
      );
    } catch (e: any) {
      setProgress("");
      setError("Couldn't clear the message list: " + (e?.message || "unknown error"));
    }
  };

  const rescanArchive = async () => {
    setError(null);
    setProgress("Reading your archive…");
    try {
      const rows = await db.messages.orderBy("date").toArray();
      const doc = rows
        .filter((m) => (m.text || "").trim())
        .map((m) => `${m.date}${m.time ? " " + m.time : ""} ${m.sender}: ${m.text.trim()}`)
        .join("\n");
      if (!doc) {
        setProgress("");
        setError("There are no messages in your archive yet to scan.");
        return;
      }
      setLoadedNote(
        `Reading ${rows.length.toLocaleString()} messages straight from your archive — nothing to upload.`
      );
      // These messages are already saved; importing them again is what must not
      // happen.
      await run(false, doc, false);
    } catch (e: any) {
      setProgress("");
      setError("Couldn't read your archive: " + (e?.message || "unknown error"));
    }
  };

  /**
   * Read the whole catalog at once and write the analysis no single part could.
   *
   * Runs over the findings, not the archive, so it is one request regardless of
   * how big her export was.
   */
  const analyseWholeCase = async () => {
    if (!result || analysing) return;
    setAnalysing(true);
    setError(null);
    setLiveError(null);
    setProgress("Reading the whole case together — patterns, timeline, danger indicators…");
    try {
      const out = await streamAdvocate({
        connection: settings.connection,
        apiKey: settings.apiKey,
        model: SCAN_MODEL,
        history: [{ role: "user", content: buildSynthesisPrompt(result, settings.hisNames) }],
        caseContext: null,
        webSearch: false,
        mode: "scan",
        onDelta: () => {},
      });
      const parsed = parseCaseAnalysis(out);
      setAnalysis(parsed);
      try {
        await db.kv.put({ key: "caseAnalysis", value: { analysis: parsed, savedAt: Date.now() } });
      } catch {
        /* never fail an analysis over bookkeeping */
      }
    } catch (e: any) {
      setLiveError(String(e?.message || e || "unknown"));
    } finally {
      setAnalysing(false);
      setProgress("");
    }
  };

  /** Put the analysis in Documents, where it goes into the attorney packet. */
  const saveAnalysisAsDoc = async () => {
    if (!analysis) return;
    const now = Date.now();
    await db.documents.add({
      title: `Case analysis — patterns across the whole record (${new Date().toISOString().slice(0, 10)})`,
      content:
        "Written by reading every finding from the deep scan together, rather than " +
        "message by message. Everything below is drawn from quotes already in your " +
        "records.\n\n" +
        analysisAsText(analysis),
      createdAt: now,
      updatedAt: now,
    });
    setAdded("Saved the case analysis to Documents.");
  };

  const toggle = (set: Set<number>, i: number, save: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    save(next);
  };

  /**
   * Which category a reading belongs in once she confirms it.
   *
   * Conservative on purpose: anything the taxonomy does not clearly cover
   * lands in coercive control rather than being upgraded into something more
   * serious that the words may not carry.
   */
  const categoryForImplied = (type: string): string[] => {
    const t = type.toLowerCase();
    if (/sexual|reproductive|image-based/.test(t)) return ["sexual abuse"];
    if (/physical|strangulation/.test(t)) return ["physical"];
    if (/threat/.test(t)) return ["threats / intimidation"];
    if (/monitor|stalk/.test(t)) return ["stalking / monitoring"];
    if (/isolat/.test(t)) return ["isolation"];
    if (/financial/.test(t)) return ["financial abuse"];
    if (/child|substance/.test(t)) return ["children / custody"];
    return ["coercive control"];
  };

  /** Files her answer as an incident — her account, his message beneath it. */
  const saveImplied = async (idx: number) => {
    if (!result) return;
    const f = result.implied[idx];
    const account = (answers[idx] || "").trim();
    if (!account || savingImplied.current.has(idx)) return;
    savingImplied.current.add(idx);
    await db.incidents.add({
      date: f.date || fallbackDate,
      time: "",
      title: f.type.charAt(0).toUpperCase() + f.type.slice(1),
      narrative:
        `${account}\n\n` +
        `[In his own words, ${f.date || "date not stated in the message"}: "${f.quote}"]` +
        (f.date ? "" : "\n[Date not stated in source — needs confirming]"),
      categories: categoryForImplied(f.type),
      severity: 3,
      location: "",
      witnesses: "",
      policeReport: "",
      medical: "",
      childrenPresent: false,
      createdAt: Date.now(),
    });
    setSavedImplied((s) => new Set(s).add(idx));
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
      // Messages already archived from the CSV get starred and tagged in
      // place — never duplicated. Anything the archive doesn't have (a quote
      // pulled from a journal or screenshot) is added.
      const fresh: typeof messages = [];
      for (const m of messages) {
        const key = m.text.trim().slice(0, 160);
        const existing = await db.messages.filter((row) => row.text.trim().slice(0, 160) === key).first();
        if (existing?.id != null) {
          await db.messages.update(existing.id, {
            starred: true,
            tags: Array.from(new Set([...(existing.tags || []), ...m.tags])),
          });
        } else {
          fresh.push(m);
        }
      }
      if (fresh.length) {
        await db.messages.bulkAdd(
          fresh.map((m) => ({
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
    // Filed into her records now, so the working copy is cleared — otherwise a
    // reload would offer the same findings again and adding them twice would
    // put duplicate incidents in her case file.
    await saveFindings(null);
    await saveScanState(null);
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
        {estimate && (
          <p className="small" style={{ margin: "6px 0", fontWeight: 600 }}>
            This will take roughly {estimate.minsLow}–{estimate.minsHigh} minutes.{" "}
            <span className="muted" style={{ fontWeight: 400 }}>
              You can stop at any point and pick up where you left off — nothing is lost and
              nothing is read twice.
            </span>
          </p>
        )}
        {/*
          One thing to do at a time, in order, with the reason in plain words.
          She is not debugging an import bug; she is being told which button to
          press next and what it will do.
        */}
        {needsRepair && !busy && (
          <div
            className="card"
            style={{ borderLeft: "4px solid var(--accent, #b4462f)", padding: 12, margin: "10px 0" }}
          >
            <strong>Your messages need adding again — three steps, about two minutes.</strong>
            <p className="small" style={{ marginTop: 6 }}>
              {broken
                ? `${broken.toLocaleString()} of your saved messages came in showing only a date, with none of what was actually said. That was a fault in how the file was read, and it is fixed now — but the messages already saved have to be added again before a scan can find anything in them.`
                : "Your message list is empty. Add your export file and it will come in with what was actually said, and each message marked with who sent it."}
            </p>
            <ol className="small" style={{ lineHeight: 2, paddingLeft: 20, margin: "8px 0 0" }}>
              <li>
                <strong>{step > 1 ? "✓ Cleared" : "Clear the old messages."}</strong>{" "}
                {step === 1 && (
                  <>
                    Your incidents, documents and photos are not touched.{" "}
                    <button className="btn sm" onClick={() => void clearArchive()}>
                      Clear my messages
                    </button>
                  </>
                )}
              </li>
              <li>
                <strong>{step > 2 ? "✓ Added" : "Add your export file again."}</strong>{" "}
                {step === 2 && (
                  <>
                    The same file you used before.{" "}
                    <button className="btn sm" onClick={() => fileRef.current?.click()}>
                      Choose my file
                    </button>
                  </>
                )}
              </li>
              <li>
                <strong>Scan it, and save what it finds.</strong>{" "}
                {step === 3 && (
                  <>
                    Leave it running until it finishes.{" "}
                    <button className="btn sm" onClick={() => void rescanArchive()}>
                      Scan my {archivedCount.toLocaleString()} messages
                    </button>
                  </>
                )}
              </li>
            </ol>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" disabled={busy || needsKey || !text.trim()} onClick={() => void run()}>
            {busy ? "Scanning…" : "Scan & catalog"}
          </button>
          {busy && (
            // Solid, not ghost. A faded button reads as decoration, and the one
            // control that lets her stop a twenty-minute job needs to look like
            // something she is allowed to press.
            <button className="btn secondary" onClick={stop}>
              Stop — keep what's found so far
            </button>
          )}
          {!busy && remaining.length > 0 && (
            <button className="btn secondary" onClick={() => void run(true)}>
              Scan remaining parts ({remaining.length})
            </button>
          )}
          {/*
            Always shown, never hidden on a condition she cannot see.
            Hiding it when the archive is empty meant an empty device and a
            stale cached page looked identical — there was no way to tell
            whether the button was missing or the archive was. It now says
            which, and the count is on the face of it.
          */}
          {!busy && (
            <button
              className="btn"
              disabled={!archivedCount}
              onClick={() => void rescanArchive()}
              title={
                archivedCount
                  ? "Reads the messages already saved on this device"
                  : "There are no messages saved on this device yet"
              }
            >
              {archivedCount
                ? `Scan my ${archivedCount.toLocaleString()} saved messages again`
                : "Scan my saved messages (none yet)"}
            </button>
          )}
          <button className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            Upload file (.csv, .txt…)
          </button>
          {/*
            Here, not buried in settings.
            Her messages imported with the date where the words should have
            been, so the fix is: empty the message list, add the file again.
            That is two taps on the screen she is already looking at, and it
            touches nothing except messages — every incident, document, photo
            and note she has built stays exactly where it is.
          */}
          {!busy && !!archivedCount && !needsRepair && (
            <button
              className="btn ghost"
              onClick={() => void clearArchive()}
              title="Empties the message list only — your incidents, documents and evidence are untouched"
            >
              Clear messages & start over
            </button>
          )}
          <button className="btn ghost" disabled={busy} onClick={() => shotRef.current?.click()}>
            Add screenshots (OCR)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf,.txt,.csv,.tsv,.log,.md,.json,.eml,.html,.htm,.vcf,.rtf,text/*"
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
            accept="image/*,application/pdf,.pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              void onScreenshots(files);
              e.target.value = "";
            }}
          />
        </div>
        {pct !== null && busy && (
          <div style={{ marginTop: 10 }}>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: 10,
                borderRadius: 999,
                background: "var(--line)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(2, pct)}%`,
                  height: "100%",
                  background: "var(--accent-grad)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <p className="small" style={{ margin: "6px 0 0", fontWeight: 600 }}>
              {pct}% done{eta ? ` · ${eta}` : ""}
            </p>
            {result && (result.incidents.length > 0 || result.messages.length > 0) && (
              // The found items are listed further down the page, past the
              // sender picker and the summary — which on a laptop is below the
              // fold, so a scan that is working looks like a scan finding
              // nothing. The tally goes where her eyes already are.
              <p className="small" style={{ margin: "4px 0 0" }}>
                <strong>
                  Found so far: {result.incidents.length} incident
                  {result.incidents.length === 1 ? "" : "s"} and {result.messages.length} message
                  {result.messages.length === 1 ? "" : "s"}
                </strong>{" "}
                — listed further down this page, and they keep appearing as it goes.
              </p>
            )}
            {dupes > 0 && (
              <p className="small muted" style={{ margin: "2px 0 0" }}>
                {dupes.toLocaleString()} repeat{dupes === 1 ? "" : "s"} skipped — the same thing
                turning up in two parts is only recorded once, so your file stays clean.
              </p>
            )}
            {dupNote && (
              <p className="small muted" style={{ margin: "2px 0 0" }}>{dupNote}</p>
            )}
            {result && result.incidents.length > 0 && (
              // The newest findings, as they land. A number going up is
              // reassuring; seeing the actual thing it just found in her own
              // record is the difference between believing it works and hoping.
              <ul className="small muted" style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
                {result.incidents.slice(-3).reverse().map((i, n) => (
                  <li key={`${i.date}-${n}`}>
                    <strong>{i.date || "no date"}</strong> — {(i.title || "").slice(0, 90)}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small" style={{ margin: "2px 0 0" }}>
              You can leave this page or close the app — everything found so far is saved, and it
              picks up where it stopped.
            </p>
          </div>
        )}
        {liveError && (
          // Right under the progress bar, where she is already looking, the
          // moment the first part fails — not twenty minutes later.
          // What she is shown depends on whose problem it is.
          //
          // A billing or key problem belongs to whoever set this app up for
          // her, and she is never shown the money — not the balance, not the
          // rate, not a link to a billing page, not the server's own wording.
          // Asking a woman assembling the evidence of her own abuse to go and
          // top up an account before she is allowed to look at it is not
          // something this app will do. She gets told it is not her, not her
          // case, and not lost, and that it will be dealt with.
          //
          // Everything else — a dropped connection, an overloaded model — is
          // shown as it came, because that is information she can act on.
          <div className="notice" style={{ marginTop: 10 }}>
            {isFatalScanError(liveError) ? (
              <>
                <strong>The AI service isn't answering at the moment.</strong>
                <p className="small" style={{ margin: "6px 0 0" }}>
                  This is a problem with the service itself, not with your case, your file, or
                  anything you did. Every message and every finding you already have is safe on
                  this device. Whoever set this up for you will get it working — and when it is,
                  tap scan again and it carries on from exactly where it stopped, without
                  re-reading anything.
                </p>
              </>
            ) : (
              <>
                <strong>A part came back with this:</strong>
                <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{liveError}</p>
              </>
            )}
          </div>
        )}
        {progress && <p className="muted small" style={{ marginTop: 8 }}>{progress}</p>}
        {archived > 0 && (
          <div className="notice calm" style={{ marginTop: 10 }}>
            <strong>{archived.toLocaleString()} messages saved to your archive.</strong> Every
            single one — saved exactly as written, by the app itself, before the AI read anything.
            They're searchable now and they're in your attorney export. The AI is reading them to
            flag the ones that matter.
          </div>
        )}

        {dupNote && (
          <div className="notice calm" style={{ marginTop: 10 }}>
            {dupNote} Uploading the same export again is safe — it never duplicates your archive,
            and it never adds the same message twice.
          </div>
        )}

        {senders.length > 1 && (
          <div className="panel" style={{ marginTop: 10 }}>
            <h2>Which one is him?</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Tap his name or number. His own words are the strongest evidence you have — Texas
              courts treat them as statements against him, not hearsay — so telling the app who he
              is makes everything from here sharper.
            </p>
            <div className="quick-actions">
              {senders.map((s) => (
                <button
                  key={s.name}
                  className={isHim(s.name) ? "btn sm" : "btn secondary sm"}
                  onClick={() => markHim(s.name)}
                >
                  {isHim(s.name) ? "✓ " : ""}
                  {s.name} ({s.count.toLocaleString()})
                </button>
              ))}
            </div>
            {settings.hisNames && (
              <p className="muted small" style={{ marginBottom: 0 }}>
                Got it — messages from {settings.hisNames} are treated as his.
              </p>
            )}
            {/*
              Names of people talked about, not people who sent anything. The
              buttons above only list senders, so a girlfriend he moved in, a
              child, or a relative who never texted her is invisible to the
              scan no matter how often the two of them wrote about her.
            */}
            <label className="small" style={{ display: "block", marginTop: 10 }}>
              Anyone else this case is about — a new partner, your children, his
              family, a witness. Separate names with commas.
              <input
                type="text"
                className="input"
                style={{ marginTop: 4 }}
                placeholder="e.g. his girlfriend's name, your children's names"
                value={settings.otherNames}
                onChange={(e) => update({ otherNames: e.target.value })}
              />
            </label>
            <p className="muted small" style={{ marginBottom: 0 }}>
              {settings.otherNames
                ? `The scan will treat any mention of ${settings.otherNames} as worth recording, with its date.`
                : "Without this, their names read as ordinary chatter and the scan passes over them."}
            </p>
          </div>
        )}
        <p className="muted small" style={{ marginTop: 8 }}>
          Deep scans always run on Claude Opus 5, whatever the chat is set to. A very large
          export takes a while — you can leave this page or close the app; everything found is
          saved as it goes, and results appear below as each part completes.
        </p>
      </div>

      {error && <div className="notice">{error}</div>}
      {added && <div className="notice calm">{added}</div>}

      {result && (
        <>
          {result.risks.length > 0 && (
            <div className="panel" style={{ borderColor: "var(--danger)", borderWidth: 2 }}>
              <h2 style={{ color: "var(--danger)" }}>
                Read this first — {result.risks.length} safety warning
                {result.risks.length === 1 ? "" : "s"} in these messages
              </h2>
              <p className="small">
                These are the things that predict serious harm. They matter for your safety right
                now, and they are also the strongest possible support for a Texas protective order.
                Show these to your attorney, and to the court.
              </p>
              {result.risks.map((r, i) => (
                <div className="item-card sev-5" key={i}>
                  <div className="head">
                    {r.date && <span className="date">{r.date}</span>}
                    <span className="title">{r.type}</span>
                  </div>
                  {r.quote && (
                    <p style={{ whiteSpace: "pre-wrap", margin: "6px 0", fontWeight: 600 }}>
                      "{r.quote}"
                    </p>
                  )}
                  {r.why && <p className="small muted" style={{ margin: 0 }}>{r.why}</p>}
                </div>
              ))}
              <p className="small" style={{ fontWeight: 700, marginBottom: 0 }}>
                If you are in danger right now: 911. Any hour: 1-800-799-7233, or text START to
                88788. In Texas: Texas Advocacy Project 1-800-374-HOPE.
              </p>
            </div>
          )}

          {result.implied && result.implied.filter((_, i) => !dismissed.has(i)).length > 0 && (
            <div className="panel" style={{ borderColor: "var(--accent)", borderWidth: 2 }}>
              <h2 style={{ marginTop: 0 }}>Things these messages point at without saying</h2>
              <p className="small" style={{ marginTop: 0 }}>
                The worst things rarely get written down plainly — they get referred to, by two
                people who both already know what is meant. Below is what the wording appears to
                point at. <strong>None of it is proof, and none of it is in your records yet.</strong>{" "}
                Only you know what actually happened. Where something is right, answer the question
                and it becomes your own account with his message attached to it — and that is
                evidence. Where it's wrong, dismiss it; getting this list wrong would be worse than
                it being short.
              </p>
              {result.implied.map((f, i) =>
                dismissed.has(i) ? null : (
                  <div className="item-card" key={i}>
                    <div className="head">
                      {f.date && <span className="date">{f.date}</span>}
                      <span className="title">{f.type}</span>
                      <span
                        className="muted small"
                        style={{ marginLeft: "auto", textTransform: "uppercase", letterSpacing: 0.5 }}
                      >
                        {f.confidence}
                      </span>
                    </div>
                    {f.quote && (
                      <p style={{ whiteSpace: "pre-wrap", margin: "6px 0", fontWeight: 600 }}>
                        "{f.quote}"
                      </p>
                    )}
                    <p className="small" style={{ margin: "0 0 4px" }}>{f.reading}</p>
                    {f.basis && (
                      <p className="muted small" style={{ margin: "0 0 8px" }}>
                        <strong>What makes it read that way:</strong> {f.basis}
                      </p>
                    )}
                    {savedImplied.has(i) ? (
                      <p className="small" style={{ margin: 0, fontWeight: 600 }}>
                        Saved to your incidents, in your words. You can edit it any time under Add
                        evidence → Incidents.
                      </p>
                    ) : (
                      <>
                        {f.askHer && (
                          <p className="small" style={{ margin: "0 0 6px", fontWeight: 600 }}>
                            {f.askHer}
                          </p>
                        )}
                        <textarea
                          rows={3}
                          placeholder="What happened, in your own words. Only what you actually remember — you can leave this and come back."
                          value={answers[i] || ""}
                          onChange={(e) =>
                            setAnswers((a) => ({ ...a, [i]: e.target.value }))
                          }
                          style={{ width: "100%" }}
                        />
                        <div className="row" style={{ gap: 8, marginTop: 6 }}>
                          <button
                            className="btn sm"
                            disabled={!(answers[i] || "").trim()}
                            onClick={() => void saveImplied(i)}
                          >
                            Save this as my account
                          </button>
                          <button
                            className="btn ghost sm"
                            onClick={() => setDismissed((s) => new Set(s).add(i))}
                          >
                            That's not what this was
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              )}
              <p className="muted small" style={{ marginBottom: 0 }}>
                If any of this is hard to look at, that is an ordinary reaction and you do not have
                to do it today. The National Domestic Violence Hotline is <strong>1-800-799-7233</strong>,
                or text <strong>START</strong> to <strong>88788</strong> — free, confidential, any hour.
              </p>
            </div>
          )}

          {result.facts && result.facts.length > 0 && (
            <div className="panel">
              <h2>
                {result.facts.length} case-building fact{result.facts.length === 1 ? "" : "s"} beyond
                the abuse
              </h2>
              <p className="small">
                Money, parenting, and his own words. Divorces are won on more than the worst nights:
                what he earns and spends, the time with your daughter he skipped, and above all the
                statements that will contradict what he tells the court. Save this list — send it to
                your attorney as it stands, and take the ones about money into Financials.
              </p>
              {result.facts.map((f, i) => (
                <div className="item-card" key={i}>
                  <div className="head">
                    {f.date && <span className="date">{f.date}</span>}
                    <span className="title">{f.type}</span>
                  </div>
                  {f.quote && (
                    <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>"{f.quote}"</p>
                  )}
                  {f.whyItMatters && (
                    <p className="small muted" style={{ margin: 0 }}>
                      {f.whyItMatters}
                    </p>
                  )}
                </div>
              ))}
              <button
                className="btn secondary"
                onClick={() => void saveFactsAsDoc()}
                style={{ marginTop: 10 }}
              >
                Save this list to Documents
              </button>
            </div>
          )}

          <div className="panel">
            <h2>See the whole case at once</h2>
            <p className="small" style={{ marginTop: 0 }}>
              The scan reads your archive in parts, a few weeks at a time, so no single part
              can see the shape of the whole thing — whether it got worse, what it happened
              around, which of the danger signs are actually present, who else saw it, and
              where his own words contradict what he'll say in court. This reads every finding
              together and writes that down. It works from what the scan already found rather
              than the messages themselves, so it only takes a moment.
            </p>
            {!analysis && (
              <button className="btn" disabled={analysing || busy} onClick={() => void analyseWholeCase()}>
                {analysing ? "Reading the whole case…" : "Analyse the whole case"}
              </button>
            )}

            {analysis && (
              <>
                {analysis.headline && (
                  <p style={{ whiteSpace: "pre-wrap", fontWeight: 600 }}>{analysis.headline}</p>
                )}

                {analysis.lethality.some((l) => l.present !== "not in this record") && (
                  <div className="item-card sev-5">
                    <div className="head">
                      <span className="title">
                        Danger indicators present: {lethalityCount(analysis)} confirmed
                      </span>
                    </div>
                    <p className="small" style={{ margin: "6px 0" }}>
                      These are the factors research links to the most serious outcomes. They
                      are the strongest support a Texas protective order can have.
                    </p>
                    {analysis.lethality
                      .filter((l) => l.present !== "not in this record")
                      .map((l, i) => (
                        <div key={i} style={{ margin: "8px 0" }}>
                          <strong>
                            {l.factor} — {l.present}
                            {l.date ? ` (${l.date})` : ""}
                          </strong>
                          {l.evidence && (
                            <p style={{ whiteSpace: "pre-wrap", margin: "2px 0 0" }}>"{l.evidence}"</p>
                          )}
                        </div>
                      ))}
                  </div>
                )}

                {analysis.trajectory && (
                  <>
                    <h3>How it changed over time</h3>
                    <p style={{ whiteSpace: "pre-wrap" }}>{analysis.trajectory}</p>
                  </>
                )}

                {analysis.clusters.length > 0 && (
                  <>
                    <h3>When it got worse, and what was happening</h3>
                    {analysis.clusters.map((c, i) => (
                      <div className="item-card" key={i}>
                        <div className="head">
                          <span className="date">{c.period}</span>
                          <span className="title">{c.trigger}</span>
                        </div>
                        <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{c.what}</p>
                      </div>
                    ))}
                  </>
                )}

                {analysis.cycle && (
                  <>
                    <h3>The pattern it repeats</h3>
                    <p style={{ whiteSpace: "pre-wrap" }}>{analysis.cycle}</p>
                  </>
                )}

                {analysis.contradictions.length > 0 && (
                  <>
                    <h3>His own words that undercut him ({analysis.contradictions.length})</h3>
                    <p className="small muted" style={{ marginTop: 0 }}>
                      In Texas his own statements come in against him. These are the ones that
                      will not sit alongside the position he is likely to take.
                    </p>
                    {analysis.contradictions.map((c, i) => (
                      <div className="item-card" key={i}>
                        <div className="head">
                          {c.date && <span className="date">{c.date}</span>}
                          <span className="title">{c.contradicts}</span>
                        </div>
                        <p style={{ whiteSpace: "pre-wrap", margin: "6px 0", fontWeight: 600 }}>
                          "{c.hisWords}"
                        </p>
                        <p className="small muted" style={{ margin: 0 }}>{c.whyItMatters}</p>
                      </div>
                    ))}
                  </>
                )}

                {analysis.corroboration.length > 0 && (
                  <>
                    <h3>Proof that doesn't depend on your word ({analysis.corroboration.length})</h3>
                    {analysis.corroboration.map((c, i) => (
                      <div className="item-card" key={i}>
                        <div className="head">
                          {c.date && <span className="date">{c.date}</span>}
                          <span className="title">
                            {c.kind === "record" ? "Record" : "Witness"}: {c.who}
                          </span>
                        </div>
                        <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{c.what}</p>
                        <p className="small muted" style={{ margin: 0 }}>{c.howToGetIt}</p>
                      </div>
                    ))}
                  </>
                )}

                {analysis.gaps.length > 0 && (
                  <>
                    <h3>What's missing</h3>
                    <ul style={{ lineHeight: 1.7 }}>
                      {analysis.gaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </>
                )}

                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn secondary" onClick={() => void saveAnalysisAsDoc()}>
                    Save this to Documents
                  </button>
                  <button
                    className="btn ghost"
                    disabled={analysing}
                    onClick={() => void analyseWholeCase()}
                  >
                    Run it again
                  </button>
                </div>
              </>
            )}
          </div>

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
