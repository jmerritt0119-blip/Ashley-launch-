import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, INCIDENT_CATEGORIES, type Incident } from "../db";

const today = () => new Date().toISOString().slice(0, 10);

const BLANK: Omit<Incident, "id" | "createdAt"> = {
  date: today(),
  time: "",
  title: "",
  narrative: "",
  categories: [],
  severity: 3,
  location: "",
  witnesses: "",
  policeReport: "",
  medical: "",
  childrenPresent: false,
};

export default function Incidents() {
  const [draft, setDraft] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<string>("");

  const incidents = useLiveQuery(
    () => db.incidents.orderBy("date").reverse().toArray(),
    []
  );

  const visible = (incidents || []).filter(
    (i) => !filter || i.categories.includes(filter)
  );

  const set = (patch: Partial<typeof BLANK>) => setDraft((d) => ({ ...d, ...patch }));

  const toggleCategory = (c: string) =>
    set({
      categories: draft.categories.includes(c)
        ? draft.categories.filter((x) => x !== c)
        : [...draft.categories, c],
    });

  const save = async () => {
    if (!draft.title.trim() && !draft.narrative.trim()) return;
    if (editingId != null) {
      await db.incidents.update(editingId, { ...draft });
    } else {
      await db.incidents.add({ ...draft, createdAt: Date.now() });
    }
    setDraft({ ...BLANK });
    setEditingId(null);
    setShowForm(false);
  };

  const edit = (i: Incident) => {
    const { id, createdAt, ...rest } = i;
    setDraft({ ...BLANK, ...rest });
    setEditingId(i.id ?? null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (id?: number) => {
    if (id == null) return;
    if (confirm("Delete this incident entry?")) await db.incidents.delete(id);
  };

  return (
    <div>
      <h1>Incident log</h1>
      <p className="muted">
        Contemporaneous records carry weight in court. Write what happened in plain facts — dates,
        actions, exact words — the way you'd want a judge to read it.
      </p>

      {!showForm && (
        <button className="btn" onClick={() => setShowForm(true)}>
          + Document an incident
        </button>
      )}

      {showForm && (
        <div className="panel" style={{ marginTop: 14 }}>
          <h2>{editingId != null ? "Edit incident" : "New incident"}</h2>
          <div className="row">
            <label className="field">
              <span>Date</span>
              <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label className="field">
              <span>Approximate time (optional)</span>
              <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />
            </label>
            <label className="field">
              <span>Severity (1 = low, 5 = extreme)</span>
              <select
                value={draft.severity}
                onChange={(e) => set({ severity: parseInt(e.target.value, 10) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Short title</span>
            <input
              type="text"
              placeholder="e.g., Threatened me in the kitchen in front of our daughter"
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </label>

          <label className="field">
            <span>What happened — facts, in order, exact words in quotes where you can</span>
            <textarea
              placeholder={'He arrived at 8:40pm although the schedule says 6pm. When I opened the door he said, "..." '}
              value={draft.narrative}
              onChange={(e) => set({ narrative: e.target.value })}
            />
          </label>

          <span className="muted small">Categories (tap all that apply)</span>
          <div className="checks">
            {INCIDENT_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`chip ${draft.categories.includes(c) ? "on" : ""}`}
                onClick={() => toggleCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="row">
            <label className="field">
              <span>Location (optional)</span>
              <input type="text" value={draft.location} onChange={(e) => set({ location: e.target.value })} />
            </label>
            <label className="field">
              <span>Witnesses (optional)</span>
              <input
                type="text"
                placeholder="Names, or 'neighbor at #12'"
                value={draft.witnesses}
                onChange={(e) => set({ witnesses: e.target.value })}
              />
            </label>
          </div>
          <div className="row">
            <label className="field">
              <span>Police report # (optional)</span>
              <input
                type="text"
                value={draft.policeReport}
                onChange={(e) => set({ policeReport: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Medical care / injuries (optional)</span>
              <input
                type="text"
                placeholder="ER visit, photos taken, bruising on left arm…"
                value={draft.medical}
                onChange={(e) => set({ medical: e.target.value })}
              />
            </label>
          </div>

          <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={draft.childrenPresent}
              onChange={(e) => set({ childrenPresent: e.target.checked })}
              style={{ width: "auto" }}
            />
            <span style={{ margin: 0 }}>Children were present or involved</span>
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => void save()}>
              {editingId != null ? "Save changes" : "Save incident"}
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setDraft({ ...BLANK });
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ margin: "16px 0 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="muted small">Filter:</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">All categories</option>
          {INCIDENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="muted small">{visible.length} shown</span>
      </div>

      {visible.map((i) => (
        <div className={`item-card sev-${i.severity}`} key={i.id}>
          <div className="head">
            <span className="date">
              {i.date}
              {i.time ? ` · ${i.time}` : ""}
            </span>
            <span className="title">{i.title || "(untitled)"}</span>
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
            {i.policeReport && <span className="tag">report #{i.policeReport}</span>}
            {i.medical && <span className="tag">medical: {i.medical}</span>}
            {i.witnesses && <span className="tag">witnesses: {i.witnesses}</span>}
            {i.location && <span className="tag">{i.location}</span>}
          </div>
          <div className="actions">
            <button className="btn ghost sm" onClick={() => edit(i)}>
              Edit
            </button>
            <button className="btn ghost sm" onClick={() => void remove(i.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {incidents && incidents.length === 0 && (
        <p className="muted" style={{ marginTop: 14 }}>
          Nothing logged yet. Start with the most recent incident — then work backward through the
          big ones as you're able.
        </p>
      )}
    </div>
  );
}
