import { useEffect, useState } from "react";
import { buildCoercionReport, buildPrognosis, type CoercionReport } from "../coercion";
import { usePaneActive } from "../paneContext";

/**
 * The page that tells her she was not imagining it — using only her own records.
 *
 * Everything here is her evidence, dated, in her words or his. Nothing is
 * asserted that the records do not support, and nothing tells her how to feel.
 * The cycle timeline is the centre of it: one apology after one incident is a
 * bad week, but the same shape fourteen times, each gap measured in days, is a
 * machine — and that is the thing she cannot be talked out of later, because it
 * is her own file rather than anyone's opinion.
 */
export default function NotYou() {
  const active = usePaneActive();
  const [report, setReport] = useState<CoercionReport | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void buildCoercionReport().then((r) => {
      if (!cancelled) setReport(r);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const nothingYet = report && report.findings.length === 0;

  return (
    <div>
      <h1>It wasn't you</h1>
      <p className="muted">
        Everything on this page comes from your own records — your dates, your entries, his
        words. Nothing here is a guess.
      </p>

      {!report && <p className="muted">Reading your records…</p>}

      {nothingYet && (
        <div className="notice calm">
          There isn't enough in your file yet for this to show you anything real, and a page that
          invented findings would be worth nothing. Add incidents, or run a scan over your
          messages, and come back — it will fill in from what is actually there.
        </div>
      )}

      {report && report.cycles.length >= 2 && (
        <div className="panel" style={{ borderColor: "var(--accent)", borderWidth: 2 }}>
          <h2 style={{ marginTop: 0 }}>The cycle, in order</h2>
          <p className="small" style={{ marginTop: 0 }}>
            Each line is something you recorded, followed by the remorse that came after it, and
            how many days it took. This happened <strong>{report.cycles.length} times</strong>.
          </p>
          <ol className="small" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
            {report.cycles.slice(0, 12).map((c, i) => (
              <li key={i} style={{ marginBottom: 10 }}>
                <strong>{c.incidentDate}</strong> — {c.incidentTitle}
                <br />
                <span className="muted">
                  {c.apologyDate} ({c.daysLater} day{c.daysLater === 1 ? "" : "s"} later):
                </span>{" "}
                “{c.apologyText}”
              </li>
            ))}
          </ol>
          {report.cycles.length > 12 && (
            <p className="muted small">…and {report.cycles.length - 12} more.</p>
          )}
          <p className="small" style={{ marginBottom: 0 }}>
            If you ever thought <em>but he isn't always like that</em> — you were right, and that
            is exactly how the pattern works. The kindest moments arriving straight after the
            worst ones is the mechanism, not the exception.
          </p>
        </div>
      )}

      {report && buildPrognosis(report).length > 0 && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Will this change?</h2>
          <p className="small" style={{ marginTop: 0 }}>
            The honest answer is in your own file. Nobody can diagnose him from text messages, and
            you should be wary of anyone who tries — including this app. But what your records
            show about what he <em>did</em> predicts the future better than any label would.
          </p>
          {buildPrognosis(report).map((p) => (
            <div key={p.headline} style={{ marginBottom: 14 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{p.headline}</p>
              <p className="small" style={{ margin: "0 0 4px" }}>{p.detail}</p>
              <p className="muted small" style={{ margin: 0 }}>
                <strong>From your records:</strong> {p.basis}
              </p>
            </div>
          ))}
          <p className="muted small" style={{ marginBottom: 0 }}>
            None of this is a psychological diagnosis, and it should not be presented as one — in
            court it would be challenged immediately and it would cost you credibility. What is
            above is what your dated records actually show, which is the part that holds up.
          </p>
        </div>
      )}

      {report && report.findings.length > 0 && (
        <>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>What is in your file</h2>
            <p className="small" style={{ marginTop: 0 }}>
              {report.totalRecords.toLocaleString()} records
              {report.span ? `, from ${report.span.first} to ${report.span.last}` : ""}. These are
              recognised, named tactics — not personality, not bad luck, and not something you
              caused.
            </p>
          </div>

          {report.findings.map((f) => (
            <div className="panel" key={f.tactic.name}>
              <h2 style={{ marginTop: 0, marginBottom: 4 }}>
                {f.tactic.name}{" "}
                <span className="muted" style={{ fontSize: "0.8em", fontWeight: 400 }}>
                  — {f.count} time{f.count === 1 ? "" : "s"} in your records
                </span>
              </h2>
              <p className="small" style={{ marginTop: 0 }}>{f.tactic.what}</p>
              <p className="small">
                <strong>Why it made you doubt yourself.</strong> {f.tactic.why}
              </p>
              <button
                className="btn ghost sm"
                onClick={() => setOpen(open === f.tactic.name ? null : f.tactic.name)}
              >
                {open === f.tactic.name ? "Hide the entries" : "Show me my own entries"}
              </button>
              {open === f.tactic.name && (
                <ul className="small" style={{ lineHeight: 1.7, marginTop: 10 }}>
                  {f.examples.map((e, i) => (
                    <li key={i}>
                      <strong>{e.date || "no date"}</strong> — “{e.text}”{" "}
                      <span className="muted">({e.source})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <div className="notice calm">
            <strong>This is a record, not a memory.</strong> It was written down at the time, with
            dates, and it does not depend on anyone believing you — including you, on the days
            that is hard. If it would help to talk to someone who does this for a living: the
            National Domestic Violence Hotline is <strong>1-800-799-7233</strong>, or text{" "}
            <strong>START</strong> to <strong>88788</strong>. Free, confidential, any hour.
          </div>
        </>
      )}
    </div>
  );
}
