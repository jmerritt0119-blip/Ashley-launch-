import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, INCIDENT_CATEGORIES, type Incident } from "../db";
import { useDraft } from "../useDraft";

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
  const [draft, setDraft] = useDraft("incidents.draft", { ...BLANK });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<string>("");
  /** Minimum severity to show — how she finds the worst of it fast. */
  const [minSev, setMinSev] = useState<number>(0);

  const incidents = useLiveQuery(
    () => db.incidents.orderBy("date").reverse().toArray(),
    []
  );

  const all = incidents || [];
  const visible = all.filter(
    (i) => (!filter || i.categories.includes(filter)) && i.severity >= minSev
  );
  /** The highest severity anything in her file actually reaches. */
  const worst = all.reduce((n, i) => Math.max(n, i.severity), 0);

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
        <select
          value={minSev}
          onChange={(e) => setMinSev(Number(e.target.value))}
          style={{ maxWidth: 220 }}
        >
          <option value={0}>Any severity</option>
          <option value={5}>Only the most serious (5)</option>
          <option value={4}>Serious and above (4–5)</option>
          <option value={3}>Moderate and above (3–5)</option>
        </select>
        <span className="muted small">{visible.length} shown</span>
      </div>

      {/*
        Asking for the worst and being shown an empty page reads as a verdict —
        as though none of it was that bad. It is nothing of the kind: it is the
        scanner having graded cautiously, or those entries not being catalogued
        yet. Say so, and show her the nearest thing rather than nothing.
      */}
      {minSev > 0 && visible.length === 0 && all.length > 0 && (
        <div className="notice calm">
          <strong>Nothing in your file is marked {minSev} or higher yet.</strong> That is not a
          judgement about what happened to you — it is how these entries were graded, and the
          scanner grades cautiously. The most serious thing recorded so far is a{" "}
          <strong>{worst}</strong>.
          <div style={{ marginTop: 8 }}>
            <button className="btn secondary sm" onClick={() => setMinSev(worst)}>
              Show me the worst {worst === 5 ? "" : `(${worst})`} of what's here
            </button>
          </div>
          <p className="small" style={{ marginBottom: 0 }}>
            If something belongs higher — anything about your neck or breathing, a weapon, a threat
            to kill, anything sexual you did not agree to, or violence in front of your daughter —
            open it and change the severity yourself. Yours is the account that counts.
          </p>
        </div>
      )}

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
