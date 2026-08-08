import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
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
    return {
      incidents,
      messages,
      starred,
      evidence,
      financials,
      next: nextDates[0] ?? null,
      lastBackupAt: (lastBackup?.value as number | undefined) ?? null,
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
          accept=".txt,.csv,.tsv,.log,.md,.json,text/plain,text/csv"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            void onFiles(files);
            e.target.value = "";
          }}
        />
      </div>

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
          <button className="btn secondary sm" onClick={() => go("packet")}>
            Build attorney packet
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
