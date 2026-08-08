import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import {
  exportDatesCsv,
  exportEvidenceCsv,
  exportEvidenceFilesZip,
  exportFinancialsCsv,
  exportIncidentsCsv,
  exportMessagesCsv,
} from "../exportCsv";

interface Props {
  displayName: string;
}

export default function Packet({ displayName }: Props) {
  const [zipStatus, setZipStatus] = useState<string | null>(null);

  const downloadEvidenceFiles = async () => {
    try {
      setZipStatus("Packaging your evidence…");
      const n = await exportEvidenceFilesZip((done, total) =>
        setZipStatus(`Packaging ${Math.min(done + 1, total)} of ${total}…`)
      );
      setZipStatus(
        n === 0
          ? "No files are stored in the vault yet — only indexed entries."
          : `${n} file${n === 1 ? "" : "s"} packaged. The .zip is in your Files app (Downloads) — share it from there.`
      );
    } catch (e: any) {
      setZipStatus(e?.message || "Couldn't build the zip. Try again.");
    }
  };

  const data = useLiveQuery(async () => {
    const [incidents, starred, evidence, financials] = await Promise.all([
      db.incidents.orderBy("date").toArray(),
      db.messages.filter((m) => m.starred).toArray(),
      db.evidence.orderBy("date").toArray(),
      db.financials.toArray(),
    ]);
    starred.sort((a, b) => (a.date < b.date ? -1 : 1));
    return { incidents, starred, evidence, financials };
  }, []);

  const fmt = (n: number) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const total = (t: string) =>
    (data?.financials || []).filter((i) => i.type === t).reduce((a, i) => a + (i.value || 0), 0);

  return (
    <div>
      <div className="no-print">
        <h1>Attorney packet</h1>
        <p className="muted">
          A clean, chronological compilation of your record — incident log, starred messages,
          evidence index, and financial summary — formatted for handing to an attorney at a
          consultation. Print it (or save as PDF from the print dialog).
        </p>
        <button className="btn" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <div className="panel" style={{ marginTop: 14 }}>
          <h2>Data files for your attorney</h2>
          <p className="muted small">
            Spreadsheets your attorney's office can sort, filter, and load into their tools. Entries
            carry stable reference numbers (INC-001, MSG-0001, E-001) that match the printed packet.
          </p>
          <div className="quick-actions">
            <button className="btn secondary sm" onClick={() => void exportIncidentsCsv()}>
              ⬇ Incident log (.csv)
            </button>
            <button className="btn secondary sm" onClick={() => void exportMessagesCsv()}>
              ⬇ Full message archive (.csv)
            </button>
            <button className="btn secondary sm" onClick={() => void exportEvidenceCsv()}>
              ⬇ Evidence index (.csv)
            </button>
            <button className="btn secondary sm" onClick={() => void exportFinancialsCsv()}>
              ⬇ Financial summary (.csv)
            </button>
            <button className="btn secondary sm" onClick={() => void exportDatesCsv()}>
              ⬇ Key dates (.csv)
            </button>
          </div>
          <hr className="hr" />
          <h2>Evidence files (photos, videos, recordings)</h2>
          <p className="muted small">
            One .zip containing every file in your vault, each named with the exhibit number used
            above (E-001, E-002…), plus an index of what each one shows. Send unencrypted — your
            attorney has to be able to open it — then delete it from your Files app afterward if
            anyone else can reach your phone.
          </p>
          <button className="btn secondary" onClick={() => void downloadEvidenceFiles()}>
            ⬇ All evidence files (.zip)
          </button>
          {zipStatus && <div className="notice calm" style={{ marginTop: 10 }}>{zipStatus}</div>}
          <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
            The complete encrypted backup in Settings is for you, not for counsel — only your
            passphrase opens it.
          </p>
        </div>
        <hr className="hr" />
      </div>

      {/* ---- printable body ---- */}
      <div className="panel">
        <h1 style={{ marginBottom: 4 }}>Case preparation packet</h1>
        <p className="muted">
          {displayName ? `Prepared by ${displayName} · ` : ""}Generated {new Date().toLocaleDateString()} · Prepared by
          the client for review with counsel. Working notes — not a court filing, not legal advice.
        </p>
        <p className="small muted">
          Contents: {data?.incidents.length ?? 0} documented incidents ·{" "}
          {data?.starred.length ?? 0} flagged messages · {data?.evidence.length ?? 0} evidence items ·{" "}
          {data?.financials.length ?? 0} financial entries.
        </p>
      </div>

      <div className="panel">
        <h2>I. Incident chronology</h2>
        {(data?.incidents || []).map((i, idx) => (
          <div className="item-card" key={i.id}>
            <div className="head">
              <span className="tag">INC-{String(idx + 1).padStart(3, "0")}</span>
              <span className="date">
                {i.date}
                {i.time ? ` · ${i.time}` : ""}
              </span>
              <span className="title">{i.title}</span>
              <span className="small">severity {i.severity}/5</span>
            </div>
            <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{i.narrative}</p>
            <p className="small muted" style={{ margin: 0 }}>
              {[
                i.categories.length ? `Categories: ${i.categories.join(", ")}` : "",
                i.childrenPresent ? "Children present" : "",
                i.location ? `Location: ${i.location}` : "",
                i.witnesses ? `Witnesses: ${i.witnesses}` : "",
                i.policeReport ? `Police report: ${i.policeReport}` : "",
                i.medical ? `Medical: ${i.medical}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ))}
        {data && data.incidents.length === 0 && <p className="muted">No incidents logged.</p>}
      </div>

      <div className="panel page-break">
        <h2>II. Flagged messages (chronological)</h2>
        {(data?.starred || []).map((m) => (
          <div className="item-card" key={m.id}>
            <div className="head">
              <span className="date">{m.date}</span>
              <span className="title">{m.sender}</span>
              {m.tags.length > 0 && <span className="small muted">[{m.tags.join(", ")}]</span>}
            </div>
            <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>"{m.text}"</p>
          </div>
        ))}
        {data && data.starred.length === 0 && (
          <p className="muted">No messages starred yet — star the significant ones on the Messages page.</p>
        )}
        <p className="small muted">
          Note for counsel: full message archive retained by client; originals preserved on device /
          carrier records available by subpoena.
        </p>
      </div>

      <div className="panel page-break">
        <h2>III. Evidence index</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Date</th>
              <th>Item</th>
              <th>Type</th>
              <th>Notes / location of original</th>
            </tr>
          </thead>
          <tbody>
            {(data?.evidence || []).map((e, idx) => (
              <tr key={e.id}>
                <td>E-{String(idx + 1).padStart(3, "0")}</td>
                <td>{e.date}</td>
                <td>{e.title}</td>
                <td>{e.kind}</td>
                <td className="small">
                  {e.notes}
                  {e.fileName ? ` (file: ${e.fileName})` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.evidence.length === 0 && <p className="muted">No evidence indexed.</p>}
      </div>

      <div className="panel page-break">
        <h2>IV. Financial summary</h2>
        <p>
          Assets {fmt(total("asset"))} · Debts {fmt(total("debt"))} · Monthly income {fmt(total("income"))} ·
          Monthly expenses {fmt(total("expense"))}
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>Type</th>
              <th>Item</th>
              <th className="num">Value</th>
              <th>Whose</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {(data?.financials || []).map((i) => (
              <tr key={i.id}>
                <td>{i.type}</td>
                <td>
                  {i.name}
                  {i.separateProperty ? " (claimed separate)" : ""}
                </td>
                <td className="num">{fmt(i.value || 0)}</td>
                <td>{i.owner}</td>
                <td className="small">{i.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.financials.length === 0 && <p className="muted">No financial entries.</p>}
      </div>
    </div>
  );
}
