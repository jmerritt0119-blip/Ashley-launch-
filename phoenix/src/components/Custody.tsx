import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { useDraft } from "../useDraft";

const today = () => new Date().toISOString().slice(0, 10);

// Custody entries are incidents with the "children / custody" category plus a
// structured prefix, so they appear in the timeline, packet, and AI snapshot
// automatically.
const CUSTODY_TYPES = [
  { key: "Missed visit", hint: "Scheduled time he didn't show, or showed late/impaired" },
  { key: "Exchange incident", hint: "What happened at pickup/drop-off" },
  { key: "Concerning statement", hint: "Something he said to or about your daughter — exact words" },
  { key: "Unsafe behavior", hint: "Driving, substances, weapons, neglect, anyone unsafe around her" },
  { key: "Order violation", hint: "Contact or conduct that violates a current court order" },
  { key: "Child's disclosure", hint: "Something she told you — her words, verbatim, without questioning her" },
  { key: "School / medical", hint: "Missed appointments, school reports, therapist notes" },
];

export default function Custody() {
  const [type, setType] = useDraft("custody.type", CUSTODY_TYPES[0].key);
  const [date, setDate] = useDraft("custody.date", today());
  const [time, setTime] = useDraft("custody.time", "");
  const [narrative, setNarrative] = useDraft("custody.narrative", "");
  const [witnesses, setWitnesses] = useDraft("custody.witnesses", "");
  const [severity, setSeverity] = useDraft("custody.severity", 3);

  const entries = useLiveQuery(
    () =>
      db.incidents
        .orderBy("date")
        .reverse()
        .filter((i) => i.categories.includes("children / custody"))
        .toArray(),
    []
  );

  const save = async () => {
    if (!narrative.trim()) return;
    await db.incidents.add({
      date,
      time,
      title: `${type}`,
      narrative,
      categories: ["children / custody"],
      severity,
      location: "",
      witnesses,
      policeReport: "",
      medical: "",
      childrenPresent: true,
      createdAt: Date.now(),
    });
    setNarrative("");
    setWitnesses("");
    setTime("");
  };

  const hint = CUSTODY_TYPES.find((t) => t.key === type)?.hint || "";

  return (
    <div>
      <h1>Custody log</h1>
      <p className="muted">
        Family courts move on documentation. Every missed visit, every incident at an exchange,
        every concerning statement — logged the day it happens, in plain facts — builds the record
        that protects your daughter.
      </p>

      <div className="notice">
        <strong>If she is in immediate danger, call 911 now.</strong> Then ask your attorney or the
        court about an emergency protective order — those exist for exactly this. Don't wait for a
        scheduled hearing.
      </div>

      <div className="panel">
        <h2>Log a custody incident</h2>
        <div className="row">
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {CUSTODY_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.key}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Time (optional)</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Severity</span>
            <select value={severity} onChange={(e) => setSeverity(parseInt(e.target.value, 10))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>What happened — {hint}</span>
          <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} />
        </label>
        <label className="field">
          <span>Witnesses (optional)</span>
          <input
            type="text"
            placeholder="Who else saw or heard it"
            value={witnesses}
            onChange={(e) => setWitnesses(e.target.value)}
          />
        </label>
        <button className="btn" onClick={() => void save()}>
          Save to the record
        </button>
        <p className="muted small" style={{ marginTop: 10 }}>
          Tips that make these entries count: write it the same day; quote exact words; never coach
          or question your daughter — just write down what she says on her own; and keep following
          current court orders to the letter, even unfair ones, while you work to change them. Your
          clean record is leverage.
        </p>
      </div>

      <h2 style={{ marginTop: 18 }}>Custody record ({entries?.length ?? 0})</h2>
      {(entries || []).map((i) => (
        <div className={`item-card sev-${i.severity}`} key={i.id}>
          <div className="head">
            <span className="date">
              {i.date}
              {i.time ? ` · ${i.time}` : ""}
            </span>
            <span className="title">{i.title}</span>
            <span className="sev-dots">{"●".repeat(i.severity)}{"○".repeat(5 - i.severity)}</span>
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{i.narrative}</p>
          {i.witnesses && (
            <div className="tags">
              <span className="tag">witnesses: {i.witnesses}</span>
            </div>
          )}
          <div className="actions">
            <button
              className="btn ghost sm"
              onClick={() => {
                if (i.id != null && confirm("Delete this entry?")) void db.incidents.delete(i.id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
      {entries && entries.length === 0 && (
        <p className="muted">No custody entries yet. The record starts with the next thing that happens.</p>
      )}
    </div>
  );
}
