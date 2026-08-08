import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FinancialItem } from "../db";

const TYPES: FinancialItem["type"][] = ["asset", "debt", "income", "expense"];
const OWNERS: FinancialItem["owner"][] = ["mine", "theirs", "joint", "unknown"];

export default function Financials() {
  const [type, setType] = useState<FinancialItem["type"]>("asset");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [owner, setOwner] = useState<FinancialItem["owner"]>("joint");
  const [separateProperty, setSeparateProperty] = useState(false);
  const [notes, setNotes] = useState("");

  const items = useLiveQuery(() => db.financials.toArray(), []);

  const save = async () => {
    if (!name.trim()) return;
    await db.financials.add({
      type,
      name: name.trim(),
      value: parseFloat(value) || 0,
      owner,
      separateProperty,
      notes,
      createdAt: Date.now(),
    });
    setName("");
    setValue("");
    setNotes("");
    setSeparateProperty(false);
  };

  const total = (t: FinancialItem["type"]) =>
    (items || []).filter((i) => i.type === t).reduce((a, i) => a + (i.value || 0), 0);

  const fmt = (n: number) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div>
      <h1>Financials</h1>
      <p className="muted">
        Divorce runs on financial disclosure. List everything you know about — accounts, property,
        debts, income, monthly costs. Financial abuse thrives on you not knowing; this list is how
        you take that power back. Gather statements where you lawfully can (accounts in your name or
        joint), and note what you only suspect — your attorney can subpoena the rest.
      </p>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="num">{fmt(total("asset"))}</div><div className="lbl">Assets</div></div>
        <div className="stat"><div className="num">{fmt(total("debt"))}</div><div className="lbl">Debts</div></div>
        <div className="stat"><div className="num">{fmt(total("income"))}</div><div className="lbl">Monthly income</div></div>
        <div className="stat"><div className="num">{fmt(total("expense"))}</div><div className="lbl">Monthly expenses</div></div>
      </div>

      <div className="panel">
        <h2>Add an entry</h2>
        <div className="row">
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as FinancialItem["type"])}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              placeholder="e.g., Chase joint checking …1234, or 'his 401(k) — employer XYZ'"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Value ($ — monthly for income/expense)</span>
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label className="field">
            <span>Whose</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value as FinancialItem["owner"])}>
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={separateProperty}
            onChange={(e) => setSeparateProperty(e.target.checked)}
            style={{ width: "auto" }}
          />
          <span style={{ margin: 0 }}>I believe this is my separate property (owned before marriage, gift, inheritance)</span>
        </label>
        <label className="field">
          <span>Notes — account numbers you know, statements you have, suspicions to raise with your attorney</span>
          <textarea style={{ minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <button className="btn" onClick={() => void save()}>
          Add entry
        </button>
      </div>

      <table className="data">
        <thead>
          <tr>
            <th>Type</th>
            <th>Name</th>
            <th className="num">Value</th>
            <th>Whose</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(items || []).map((i) => (
            <tr key={i.id}>
              <td>{i.type}</td>
              <td>
                {i.name}
                {i.separateProperty ? " ✦" : ""}
              </td>
              <td className="num">{fmt(i.value || 0)}</td>
              <td>{i.owner}</td>
              <td className="small">{i.notes}</td>
              <td>
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    if (i.id != null && confirm("Delete this entry?")) void db.financials.delete(i.id);
                  }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small" style={{ marginTop: 8 }}>
        ✦ = claimed separate property. Red flags worth noting for your attorney: money moved to new
        accounts, sudden "loans" to family, crypto, cash businesses, paychecks that shrank recently.
      </p>
    </div>
  );
}
