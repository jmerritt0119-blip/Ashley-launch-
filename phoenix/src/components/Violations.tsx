import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, VIOLATION_TYPES } from "../db";
import { handoff } from "../handoff";

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  go: (view: string) => void;
}

export default function Violations({ go }: Props) {
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("");
  const [type, setType] = useState<string>(VIOLATION_TYPES[0]);
  const [orderName, setOrderName] = useState("");
  const [provision, setProvision] = useState("");
  const [description, setDescription] = useState("");
  const [childPresent, setChildPresent] = useState(true);
  const [witnesses, setWitnesses] = useState("");
  const [proof, setProof] = useState("");
  const [reported, setReported] = useState("");

  const rows = useLiveQuery(() => db.violations.orderBy("date").reverse().toArray(), []);

  const save = async () => {
    if (!description.trim()) return;
    await db.violations.add({
      date,
      time,
      type,
      orderName: orderName.trim(),
      provision: provision.trim(),
      description: description.trim(),
      childPresent,
      witnesses: witnesses.trim(),
      proof: proof.trim(),
      reported: reported.trim(),
      createdAt: Date.now(),
    });
    setDescription("");
    setWitnesses("");
    setProof("");
    setReported("");
    setTime("");
  };

  const buildEnforcement = () => {
    handoff.ask =
      "Using my violation log, prepare me for a motion to enforce in Texas. Group the violations by the provision they breach, show the pattern and how often it happens, tell me which ones are strong enough to stand alone and which need more proof, what documentation each one still needs, what relief a Texas court can order for this pattern (make-up possession, contempt, fees, modification), and exactly what to hand my attorney. Verify the current Texas enforcement rules before you cite them.";
    go("advocate");
  };

  const count = rows?.length ?? 0;

  return (
    <div>
      <h1>Order violations</h1>
      <p className="muted">
        Every time he breaks a court order, log it the same day. This is the single most powerful
        record you can build: Texas enforcement runs on documented, specific, repeated violations —
        dates, times, and proof. A pattern here is what moves a judge.
      </p>

      {count > 0 && (
        <div className="notice" style={{ cursor: "pointer" }} onClick={buildEnforcement}>
          <strong>
            {count} violation{count === 1 ? "" : "s"} logged.
          </strong>{" "}
          Tap to have The Advocate build the enforcement case from them.
        </div>
      )}

      <div className="panel">
        <h2>Log a violation</h2>
        <div className="row">
          <label className="field">
            <span>Date it happened</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Time (courts care — be exact)</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            <span>What he did</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {VIOLATION_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>Which order (e.g. "Temporary Orders 3/4/26", "Protective Order")</span>
            <input value={orderName} onChange={(e) => setOrderName(e.target.value)} />
          </label>
          <label className="field">
            <span>Paragraph it breaks (optional — your attorney can fill this in)</span>
            <input value={provision} onChange={(e) => setProvision(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Exactly what happened — facts, times, his words in quotes</span>
          <textarea
            style={{ minHeight: 90 }}
            placeholder={`Exchange was ordered for 6:00pm at the police station. He never came. At 7:42pm he texted "I'm not bringing her back tonight, deal with it." She was returned 3/16 at 9:15am.`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={childPresent}
            onChange={(e) => setChildPresent(e.target.checked)}
            style={{ width: "auto" }}
          />
          <span style={{ margin: 0 }}>My daughter was involved or present</span>
        </label>
        <div className="row">
          <label className="field">
            <span>Who saw it</span>
            <input value={witnesses} onChange={(e) => setWitnesses(e.target.value)} />
          </label>
          <label className="field">
            <span>Proof and where it lives</span>
            <input
              placeholder="screenshot in Evidence, station camera, text thread"
              value={proof}
              onChange={(e) => setProof(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Reported to</span>
            <input
              placeholder="police report #, attorney emailed 3/16"
              value={reported}
              onChange={(e) => setReported(e.target.value)}
            />
          </label>
        </div>
        <button className="btn" onClick={() => void save()}>
          Log this violation
        </button>
        <p className="muted small" style={{ marginTop: 8 }}>
          Follow the order yourself, exactly, even when he doesn't — your clean record is what makes
          his violations matter. If a violation puts you or your daughter in danger, call 911 first;
          violating a protective order is a crime in Texas, not just a family-court issue.
        </p>
      </div>

      {(rows || []).map((v) => (
        <div className="item-card" key={v.id}>
          <div className="head">
            <span className="date">
              {v.date}
              {v.time ? ` · ${v.time}` : ""}
            </span>
            <span className="title">{v.type}</span>
            {v.orderName && <span className="tag">{v.orderName}</span>}
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{v.description}</p>
          <p className="small muted" style={{ margin: 0 }}>
            {[
              v.childPresent ? "child involved" : "",
              v.provision ? `provision: ${v.provision}` : "",
              v.witnesses ? `witness: ${v.witnesses}` : "",
              v.proof ? `proof: ${v.proof}` : "",
              v.reported ? `reported: ${v.reported}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="actions">
            <button
              className="btn ghost sm"
              onClick={() => {
                if (v.id != null && confirm("Delete this violation entry?"))
                  void db.violations.delete(v.id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      {rows && rows.length === 0 && (
        <p className="muted" style={{ marginTop: 14 }}>
          Nothing logged yet — which is good. If it starts, log it here the same day.
        </p>
      )}
    </div>
  );
}
