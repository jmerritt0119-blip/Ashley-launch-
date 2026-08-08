import { useEffect, useState } from "react";
import { db } from "../db";

interface Plan {
  escalation: string;
  goBag: Record<string, boolean>;
  goBagExtra: string;
  numbers: string;
  docs: Record<string, boolean>;
  tech: Record<string, boolean>;
  kids: string;
  notes: string;
}

const GO_BAG = [
  "Driver's license / ID",
  "Birth certificates (mine + kids)",
  "Social Security cards",
  "Cash and a spare debit/credit card",
  "Medications and copies of prescriptions",
  "Spare keys (car, house, work)",
  "Phone charger (and a cheap backup phone if possible)",
  "Copies of court orders / protective order",
  "Insurance cards",
  "A few days of clothes for me and the kids",
  "Kids' comfort items (small toy, blanket)",
  "Important photos / small irreplaceables",
];

const DOCS = [
  "Marriage certificate",
  "Financial statements (bank, retirement, credit cards)",
  "Tax returns (last 2-3 years)",
  "Pay stubs (mine and his, if lawfully available)",
  "Mortgage / lease documents",
  "Car titles and registration",
  "Passports (mine + kids)",
  "Immigration documents",
  "Kids' medical and school records",
  "Evidence backups (this app's encrypted export)",
];

const TECH = [
  "New email account he doesn't know about (for attorney + court)",
  "Changed passwords on my key accounts (email, iCloud, bank)",
  "Two-factor authentication turned on",
  "Location sharing / Find My reviewed and locked down",
  "Signed out unknown devices from my accounts",
  "Carrier account PIN set (stops SIM swaps / account access)",
  "Checked my phone for unfamiliar apps or profiles",
  "This app's Quick Exit and PIN/Face ID set up",
];

const EMPTY: Plan = {
  escalation: "",
  goBag: {},
  goBagExtra: "",
  numbers: "",
  docs: {},
  tech: {},
  kids: "",
  notes: "",
};

export default function SafetyPlan() {
  const [plan, setPlan] = useState<Plan>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void db.kv.get("safetyPlan").then((row) => {
      if (row?.value) setPlan({ ...EMPTY, ...row.value });
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      void db.kv.put({ key: "safetyPlan", value: plan });
    }, 500);
    return () => clearTimeout(timer);
  }, [plan, loaded]);

  const set = (patch: Partial<Plan>) => setPlan((p) => ({ ...p, ...patch }));
  const toggle = (field: "goBag" | "docs" | "tech", item: string) =>
    setPlan((p) => ({ ...p, [field]: { ...p[field], [item]: !p[field][item] } }));

  const checklist = (field: "goBag" | "docs" | "tech", items: string[]) => (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((item) => (
        <li key={item} style={{ marginBottom: 6 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!plan[field][item]}
              onChange={() => toggle(field, item)}
              style={{ width: "auto", marginTop: 3 }}
            />
            <span style={plan[field][item] ? { color: "var(--good)" } : undefined}>{item}</span>
          </label>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1>Safety plan</h1>
        <button className="btn secondary sm" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <p className="muted no-print">
        A personal plan, saved automatically on this device. Fill in what applies; skip what
        doesn't. A hotline advocate (1-800-799-7233) can help you build this too — they do it every
        day.
      </p>

      <div className="panel">
        <h2>If things escalate</h2>
        <p className="muted small no-print">
          Which rooms have exits and no weapons? Which neighbor can you go to? What's your code word
          with trusted people that means "call the police"?
        </p>
        <textarea
          value={plan.escalation}
          onChange={(e) => set({ escalation: e.target.value })}
          placeholder="Safe rooms and exits… neighbor I trust… code word…"
        />
      </div>

      <div className="panel">
        <h2>Go-bag (kept where he won't find it — car trunk, work, a friend's)</h2>
        {checklist("goBag", GO_BAG)}
        <label className="field" style={{ marginTop: 10 }}>
          <span>Anything else for your situation</span>
          <textarea
            style={{ minHeight: 50 }}
            value={plan.goBagExtra}
            onChange={(e) => set({ goBagExtra: e.target.value })}
          />
        </label>
      </div>

      <div className="panel">
        <h2>Important numbers</h2>
        <p className="muted small no-print">
          Attorney, local DV advocate, trusted family/friends, school, pediatrician. Write them down
          — if you lose your phone, memory is the backup.
        </p>
        <textarea value={plan.numbers} onChange={(e) => set({ numbers: e.target.value })} />
      </div>

      <div className="panel">
        <h2>Documents to gather (originals or copies)</h2>
        {checklist("docs", DOCS)}
      </div>

      <div className="panel">
        <h2>Tech safety</h2>
        {checklist("tech", TECH)}
        <p className="muted small no-print" style={{ marginTop: 8 }}>
          Full step-by-step guides: techsafety.org (Safety Net project).
        </p>
      </div>

      <div className="panel">
        <h2>For the kids</h2>
        <p className="muted small no-print">
          Who is approved for school pickup? Does the school have a copy of any protective order?
          What's the plan and code word if your daughter needs help reaching you?
        </p>
        <textarea value={plan.kids} onChange={(e) => set({ kids: e.target.value })} />
      </div>

      <div className="panel">
        <h2>Notes</h2>
        <textarea value={plan.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <p className="muted small">
        In immediate danger: 911. Any hour: 1-800-799-7233, text START to 88788, or chat at
        thehotline.org.
      </p>
    </div>
  );
}
