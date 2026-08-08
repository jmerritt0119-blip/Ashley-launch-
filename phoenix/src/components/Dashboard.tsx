import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

interface Props {
  go: (view: string) => void;
  displayName: string;
}

export default function Dashboard({ go, displayName }: Props) {
  const counts = useLiveQuery(async () => {
    const [incidents, messages, starred, evidence, financials] = await Promise.all([
      db.incidents.count(),
      db.messages.count(),
      db.messages.filter((m) => m.starred).count(),
      db.evidence.count(),
      db.financials.count(),
    ]);
    return { incidents, messages, starred, evidence, financials };
  });

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
              <strong>Bring in the texts.</strong> Paste or import the conversations that show
              threats, control, or admissions. Star the ones that matter. (
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
          <button className="btn secondary sm" onClick={() => go("packet")}>
            Build attorney packet
          </button>
          <button className="btn secondary sm" onClick={() => go("advocate")}>
            Ask The Advocate
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          In immediate danger? Call 911. Any time, any hour: 1-800-799-7233 or text START to 88788.
        </p>
      </div>
    </div>
  );
}
