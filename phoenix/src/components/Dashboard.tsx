import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { exportEverythingZip } from "../exportCsv";
import { attorneyEmailText, packetStats } from "../attorneyPacket";
import { QUICK_ACTIONS } from "../claude";
import { handoff } from "../handoff";
import DataSafety from "./DataSafety";
import NextSteps from "./NextSteps";
import type { Settings } from "../settings";

interface Props {
  go: (view: string) => void;
  displayName: string;
  settings: Settings;
}

const HERO_CHIPS = ["Protect my daughter", "Prep for a custody hearing", "What am I missing?"];

export default function Dashboard({ go, displayName, settings }: Props) {
  const [ask, setAsk] = useState("");
  const [grabBusy, setGrabBusy] = useState<string | null>(null);
  const [grabDone, setGrabDone] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * Everything, in one file, from the first thing she sees.
   *
   * The scenario this is built for: he is in the next room, she has perhaps two
   * minutes, and she needs the case file out and the app closed. Hunting
   * through tabs is not an option, and neither is waiting. So this sits at the
   * top of the first screen, takes one tap, runs entirely on the device — no
   * AI, no network, no cost — and lands in Downloads ready to send.
   */
  const grabEverything = async () => {
    setGrabDone(null);
    setGrabBusy("Gathering…");
    try {
      const { files, bytes } = await exportEverythingZip(
        (d: number, t: number) => setGrabBusy(`Packaging ${Math.min(d + 1, t)} of ${t}…`),
        { name: settings.displayName, county: settings.county }
      );
      const mb = Math.max(0.1, Math.round((bytes / 1_048_576) * 10) / 10);
      setGrabDone(`Done — ${files} files, ${mb} MB, in your Downloads. Safe to close the app.`);
      // Having the file is only half of it. She still has to work out what to
      // say, while under pressure. Write the email for her.
      try {
        setEmail(attorneyEmailText(settings.displayName, await packetStats()));
      } catch {
        /* the file is what matters; the draft is a bonus */
      }
    } catch (e: any) {
      setGrabDone("Couldn't build it: " + (e?.message || "unknown error"));
    } finally {
      setGrabBusy(null);
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useLiveQuery(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [incidents, messages, starred, evidence, financials, nextDates, lastBackup] =
      await Promise.all([
        db.incidents.count(),
        db.messages.count(),
        db.messages.filter((m) => m.starred).count(),
        db.evidence.count(),
        db.financials.count(),
        db.dates.where("date").aboveOrEqual(today).sortBy("date"),
        db.kv.get("lastBackupAt"),
      ]);
    // An unfinished scan is easy to lose track of — it lives on another tab,
    // and she has no reason to go looking for it.
    const savedScan = (await db.kv.get("scanInProgress"))?.value as
      | { remaining: number[]; total: number }
      | undefined;
    return {
      incidents,
      messages,
      starred,
      evidence,
      financials,
      next: nextDates[0] ?? null,
      lastBackupAt: (lastBackup?.value as number | undefined) ?? null,
      scanLeft: savedScan?.remaining?.length ?? 0,
      scanTotal: savedScan?.total ?? 0,
    };
  });

  const askNow = (q: string) => {
    const question = q.trim();
    if (!question) return;
    handoff.ask = question;
    setAsk("");
    go("advocate");
  };

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    const texts: string[] = [];
    for (const f of files) texts.push(await f.text());
    handoff.scanText = texts.join("\n\n");
    go("scan");
  };

  const empty =
    counts && counts.incidents + counts.messages + counts.evidence + counts.financials === 0;

  return (
    <div>
      <h1>
        {displayName ? `Welcome back, ${displayName}.` : "Welcome back."}
      </h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        Every entry you make here is a brick in the case. Small, steady, documented — that's how
        it's won.
      </p>

      <div
        className="panel"
        style={{ borderColor: "var(--accent)", borderWidth: 2, textAlign: "center" }}
      >
        <h2 style={{ marginTop: 0 }}>Get my whole case out — one tap</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Everything you have, in one file, ready to send to your attorney or anyone else.
          It works with no internet and takes a few seconds.
        </p>
        <button
          className="btn"
          style={{ fontSize: "1.05rem", padding: "12px 26px" }}
          disabled={!!grabBusy}
          onClick={() => void grabEverything()}
        >
          {grabBusy || "Download everything now"}
        </button>
        {grabDone && (
          <p className="small" style={{ marginBottom: 0 }}>
            <strong>{grabDone}</strong>
          </p>
        )}
        {email && (
          <div style={{ marginTop: 12, textAlign: "left" }}>
            <p className="small" style={{ margin: "0 0 6px" }}>
              <strong>Step 2 — the email.</strong> Written for you. Copy it, attach the file
              you just downloaded, send.
            </p>
            <textarea
              readOnly
              value={email}
              style={{ width: "100%", minHeight: 150, fontSize: "0.85rem" }}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <button
                className="btn secondary sm"
                onClick={() => {
                  void navigator.clipboard.writeText(email).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  });
                }}
              >
                {copied ? "Copied ✓" : "Copy the email"}
              </button>
              <a
                className="btn secondary sm"
                href={`mailto:?subject=${encodeURIComponent(
                  "My case file — records and chronology"
                )}&body=${encodeURIComponent(email.split("\n").slice(2).join("\n"))}`}
              >
                Open in my email app
              </a>
            </div>
          </div>
        )}
        <p className="muted small" style={{ marginBottom: 0, marginTop: 10 }}>
          Need to leave fast? Press <strong>Esc</strong> twice, or tap <strong>✕ Exit</strong> —
          the screen becomes a weather search straight away.
        </p>
      </div>

      <div className="panel">
        <h2>Ask The Advocate — anything, any hour</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askNow(ask);
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ flex: 1 }}
              placeholder="Something he did today, a hearing coming up, a letter you got…"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!ask.trim()}>
              Ask
            </button>
          </div>
        </form>
        <div className="quick-actions" style={{ marginTop: 10 }}>
          {QUICK_ACTIONS.filter((qa) => HERO_CHIPS.includes(qa.label)).map((qa) => (
            <button key={qa.label} className="btn secondary sm" onClick={() => askNow(qa.prompt)}>
              {qa.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Have his texts? Upload them — the AI finds the abuse</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          A message export (.csv), emails, a journal — any size, even years of texts. Every line is
          read, every instance of abuse is found and filed for court. You approve before anything
          saves.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Upload files
          </button>
          <button className="btn secondary" onClick={() => go("scan")}>
            Paste text or screenshots instead
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.txt,.csv,.tsv,.log,.md,.json,.eml,.html,.htm,.vcf,.rtf,text/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            void onFiles(files);
            e.target.value = "";
          }}
        />
      </div>

      {!!counts?.scanLeft && (
        <div className="notice" style={{ cursor: "pointer" }} onClick={() => go("scan")}>
          <strong>Your scan isn't finished.</strong> {counts.scanLeft} of {counts.scanTotal} parts
          are still to read. Everything already found is saved and safe. Tap to pick up where it
          stopped — you don't need to upload anything again.
        </div>
      )}

      {counts?.next && (
        <div className="notice" style={{ cursor: "pointer" }} onClick={() => go("dates")}>
          <strong>Next key date:</strong> {counts.next.date}
          {counts.next.time ? ` at ${counts.next.time}` : ""} — {counts.next.title} (
          {counts.next.type}). Tap to review and prep.
        </div>
      )}

      {counts &&
        counts.incidents + counts.messages + counts.evidence > 0 &&
        (!counts.lastBackupAt || Date.now() - counts.lastBackupAt > 7 * 86400000) && (
          <div className="notice" style={{ cursor: "pointer" }} onClick={() => go("settings")}>
            <strong>Protect the record.</strong> Your entries live only on this device —{" "}
            {counts.lastBackupAt
              ? `your last encrypted backup was ${Math.round(
                  (Date.now() - counts.lastBackupAt) / 86400000
                )} days ago.`
              : "no encrypted backup exists yet."}{" "}
            Tap to export one now (takes a minute).
          </div>
        )}

      <div className="stat-grid">
        <div className="stat" onClick={() => go("incidents")}>
          <div className="num">{counts?.incidents ?? "–"}</div>
          <div className="lbl">Incidents documented</div>
        </div>
        <div className="stat" onClick={() => go("messages")}>
          <div className="num">{counts?.messages ?? "–"}</div>
          <div className="lbl">Messages on file{counts ? ` (${counts.starred} ★)` : ""}</div>
        </div>
        <div className="stat" onClick={() => go("evidence")}>
          <div className="num">{counts?.evidence ?? "–"}</div>
          <div className="lbl">Evidence items</div>
        </div>
        <div className="stat" onClick={() => go("financials")}>
          <div className="num">{counts?.financials ?? "–"}</div>
          <div className="lbl">Financial entries</div>
        </div>
      </div>

      {empty && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h2>Start here</h2>
          <ol className="checklist">
            <li>
              <strong>Log the most recent incident</strong> while it's fresh — date, what happened,
              who saw it. (<a onClick={() => go("incidents")} style={{ cursor: "pointer" }}>Incident log</a>)
            </li>
            <li>
              <strong>Bring in the texts.</strong> Upload the export above, or paste conversations
              that show threats, control, or admissions. Star the ones that matter. (
              <a onClick={() => go("messages")} style={{ cursor: "pointer" }}>Messages</a>)
            </li>
            <li>
              <strong>Photograph and file evidence</strong> — injuries, damage, documents, screenshots. (
              <a onClick={() => go("evidence")} style={{ cursor: "pointer" }}>Evidence vault</a>)
            </li>
            <li>
              <strong>List money facts</strong> — accounts, debts, income, property. Financial
              clarity is leverage. (<a onClick={() => go("financials")} style={{ cursor: "pointer" }}>Financials</a>)
            </li>
            <li>
              <strong>Then talk to The Advocate</strong> — it will find the patterns, the gaps, and
              the next moves. (<a onClick={() => go("advocate")} style={{ cursor: "pointer" }}>Advocate</a>)
            </li>
          </ol>
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <h2>Fast actions</h2>
        <div className="quick-actions">
          <button className="btn secondary sm" onClick={() => go("custody")}>
            + Log a custody incident
          </button>
          <button className="btn secondary sm" onClick={() => go("incidents")}>
            + Log an incident
          </button>
          <button className="btn secondary sm" onClick={() => go("messages")}>
            + Import messages
          </button>
          <button className="btn secondary sm" onClick={() => go("dates")}>
            + Add a court date
          </button>
          <button className="btn secondary sm" onClick={() => go("attorney")}>
            Send everything to my attorney
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          In immediate danger? Call 911. Any time, any hour: 1-800-799-7233 or text START to 88788.
        </p>
      </div>

      <NextSteps go={go} settings={settings} />

      <DataSafety compact />
    </div>
  );
}
