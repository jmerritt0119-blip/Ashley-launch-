import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

interface Entry {
  date: string;
  type: "incident" | "message" | "evidence";
  label: string;
  detail: string;
  extra?: string;
}

export default function Timeline() {
  const entries = useLiveQuery(async () => {
    const [incidents, messages, evidence] = await Promise.all([
      db.incidents.toArray(),
      db.messages.filter((m) => m.starred).toArray(),
      db.evidence.toArray(),
    ]);
    const all: Entry[] = [
      ...incidents.map((i) => ({
        date: i.date,
        type: "incident" as const,
        label: i.title || "(incident)",
        detail: i.narrative,
        extra: [
          `severity ${i.severity}/5`,
          i.categories.join(", "),
          i.childrenPresent ? "children present" : "",
          i.policeReport ? `report #${i.policeReport}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
      ...messages.map((m) => ({
        date: m.date,
        type: "message" as const,
        label: `★ Message from ${m.sender}`,
        detail: `"${m.text}"`,
        extra: m.tags.join(", "),
      })),
      ...evidence.map((e) => ({
        date: e.date,
        type: "evidence" as const,
        label: `Evidence: ${e.title}`,
        detail: e.notes || "",
        extra: e.kind,
      })),
    ];
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return all;
  }, []);

  return (
    <div>
      <h1>Case timeline</h1>
      <p className="muted">
        Everything with a date, in one thread: incidents (red), starred messages (gold), and
        evidence (green). This is the story of the case, told in order — the same shape your
        attorney and the court will want it in.
      </p>

      <div className="timeline" style={{ marginTop: 18 }}>
        {(entries || []).map((e, idx) => (
          <div className={`t-entry ${e.type}`} key={idx}>
            <div className="t-date">{e.date}</div>
            <div>
              <strong>{e.label}</strong>
              {e.extra ? <span className="muted small"> — {e.extra}</span> : null}
            </div>
            {e.detail && (
              <div className="small" style={{ whiteSpace: "pre-wrap" }}>
                {e.detail.length > 400 ? e.detail.slice(0, 400) + "…" : e.detail}
              </div>
            )}
          </div>
        ))}
      </div>

      {entries && entries.length === 0 && (
        <p className="muted">
          Nothing dated yet. Log incidents, star messages, and add evidence — they'll assemble here
          automatically.
        </p>
      )}
    </div>
  );
}
