import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, DATE_TYPES, type KeyDate } from "../db";
import { downloadIcs } from "../ics";

const today = () => new Date().toISOString().slice(0, 10);

function daysUntil(date: string): number {
  const d = new Date(date + "T00:00:00");
  const now = new Date(today() + "T00:00:00");
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

interface Props {
  prepWithAdvocate: (prompt: string) => void;
}

export default function Dates({ prepWithAdvocate }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("hearing");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const dates = useLiveQuery(() => db.dates.orderBy("date").toArray(), []);
  const upcoming = (dates || []).filter((d) => daysUntil(d.date) >= 0);
  const past = (dates || []).filter((d) => daysUntil(d.date) < 0).reverse();

  const save = async () => {
    if (!title.trim()) return;
    await db.dates.add({
      date,
      time,
      title: title.trim(),
      type,
      location,
      notes,
      createdAt: Date.now(),
    });
    setTitle("");
    setNotes("");
    setLocation("");
    setTime("");
  };

  const badge = (d: KeyDate) => {
    const n = daysUntil(d.date);
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n > 1) return `in ${n} days`;
    return `${-n}d ago`;
  };

  const prepPrompt = (d: KeyDate) =>
    `I have a ${d.type} coming up on ${d.date}${d.time ? ` at ${d.time}` : ""}: "${d.title}"${
      d.location ? ` (${d.location})` : ""
    }${d.notes ? `. Notes: ${d.notes}` : ""}. Prepare me: what happens at it, what I should bring from my records, what I'll likely be asked, and what I should be ready to request.`;

  const row = (d: KeyDate, isPast = false) => (
    <div className="item-card" key={d.id} style={isPast ? { opacity: 0.65 } : undefined}>
      <div className="head">
        <span className="date">
          {d.date}
          {d.time ? ` · ${d.time}` : ""}
        </span>
        <span className="title">{d.title}</span>
        <span className="tag sev">{badge(d)}</span>
        <span className="tag">{d.type}</span>
      </div>
      {(d.location || d.notes) && (
        <p className="small" style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>
          {d.location ? `📍 ${d.location}` : ""}
          {d.location && d.notes ? " — " : ""}
          {d.notes}
        </p>
      )}
      <div className="actions">
        <button
          className="btn secondary sm"
          onClick={() => downloadIcs([d], `${d.title.replace(/[^\w-]+/g, "-").slice(0, 40)}.ics`)}
        >
           Add to Apple Calendar
        </button>
        {!isPast && (
          <button className="btn secondary sm" onClick={() => prepWithAdvocate(prepPrompt(d))}>
            Prep with The Advocate
          </button>
        )}
        <button
          className="btn ghost sm"
          onClick={() => {
            if (d.id != null && confirm("Delete this date?")) void db.dates.delete(d.id);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <h1>Key dates</h1>
      <p className="muted">
        Hearings, filing deadlines, attorney meetings, exchanges. Every date exports straight into
        Apple Calendar (or any calendar) with reminders set for one week and one day before —
        deadlines are where cases are won or quietly lost.
      </p>

      <div className="panel">
        <h2>Add a date</h2>
        <div className="row">
          <label className="field">
            <span>What is it</span>
            <input
              value={title}
              placeholder="e.g., Temporary orders hearing — Dept. 3"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {DATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Time (optional)</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Location (optional)</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Notes (optional) — what to bring, what it's about</span>
          <textarea style={{ minHeight: 56 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="btn" onClick={() => void save()}>
          Save date
        </button>
      </div>

      {upcoming.length > 1 && (
        <button
          className="btn secondary"
          style={{ marginBottom: 12 }}
          onClick={() => downloadIcs(upcoming, "phoenix-key-dates.ics")}
        >
           Export all upcoming to Calendar ({upcoming.length})
        </button>
      )}

      <h2>Upcoming</h2>
      {upcoming.map((d) => row(d))}
      {upcoming.length === 0 && <p className="muted">No upcoming dates on file.</p>}

      {past.length > 0 && (
        <>
          <h2 style={{ marginTop: 18 }}>Past</h2>
          {past.map((d) => row(d, true))}
        </>
      )}
    </div>
  );
}
