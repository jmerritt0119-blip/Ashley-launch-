import { useEffect, useState } from "react";
import { db } from "../db";
import { assessProtectiveOrder, buildAffidavit, type PoAssessment } from "../protectiveOrder";
import { usePaneActive } from "../paneContext";
import { handoff } from "../handoff";
import { downloadText } from "../exportCsv";
import type { Settings } from "../settings";

const MARK = { strong: "✅", some: "◐", none: "○" } as const;

export default function ProtectiveOrder({
  settings,
  go,
}: {
  settings: Settings;
  go: (v: string) => void;
}) {
  const active = usePaneActive();
  const [a, setA] = useState<PoAssessment | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void assessProtectiveOrder().then((res) => {
      if (!cancelled) setA(res);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const makeAffidavit = async () => {
    const text = await buildAffidavit(settings.displayName, settings.county);
    const now = Date.now();
    await db.documents.add({
      title: `Draft statement of facts (${new Date().toISOString().slice(0, 10)})`,
      content: text,
      createdAt: now,
      updatedAt: now,
    });
    setNote("Saved to Documents as a draft. Read every line and correct anything that isn't exact.");
  };

  return (
    <div>
      <h1>Protective order</h1>
      <p className="muted">
        In Texas a court must issue a protective order when it finds two things: that family
        violence happened, and that it is likely to happen again. This page checks your own records
        against those two findings — offline, from what you have written, with nothing invented.
      </p>

      <div className="notice warn">
        This is not legal advice and it decides nothing. It shows you where your record is strong
        and where it is thin, so you walk into a lawyer's office knowing what you have. Every county
        has a protective order office, and legal aid is free for survivors —{" "}
        <strong>Texas Advocacy Project 1-800-374-HOPE</strong>.
      </div>

      {!a && <p className="muted">Reading your records…</p>}

      {a && (
        <>
          <div className="panel">
            <h2>{a.summary}</h2>
            {a.mostRecent && (
              <p className="muted small">Most recent qualifying incident on record: {a.mostRecent}.</p>
            )}
          </div>

          {a.urgent.length > 0 && (
            <div className="panel" style={{ borderColor: "var(--danger)", borderWidth: 2 }}>
              <h2 style={{ color: "var(--danger)" }}>
                {a.urgent.length} highest-risk indicator{a.urgent.length === 1 ? "" : "s"} in your
                records
              </h2>
              <p className="small">
                These are the facts most strongly associated with serious harm, and the ones a judge
                weighs most heavily when deciding whether to act before a hearing. Say these first
                when you talk to anyone.
              </p>
              <ul className="small" style={{ lineHeight: 1.7 }}>
                {a.urgent.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
              <p className="small" style={{ fontWeight: 700, marginBottom: 0 }}>
                In danger right now: 911. Any hour: 1-800-799-7233, or text START to 88788.
              </p>
            </div>
          )}

          <div className="panel">
            <h2>What your record supports</h2>
            {a.findings.map((f) => (
              <div className="item-card" key={f.key}>
                <div className="head">
                  <span className="title">
                    {MARK[f.strength]} {f.label}
                  </span>
                </div>
                <p className="small" style={{ margin: "6px 0" }}>
                  {f.detail}
                </p>
                {f.examples.length > 0 && (
                  <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                    {f.examples.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {a.gaps.length > 0 && (
            <div className="panel">
              <h2>What would make it stronger</h2>
              <ul className="small" style={{ lineHeight: 1.8 }}>
                {a.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
              <p className="muted small" style={{ marginBottom: 0 }}>
                None of these are required. Each one is a piece that doesn't depend on your word
                alone, which is what makes a case hard to argue with.
              </p>
            </div>
          )}

          <div className="panel">
            <h2>Take it further</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => void makeAffidavit()}>
                Build a draft statement of facts
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  handoff.ask =
                    "Walk me through applying for a protective order in Texas" +
                    (settings.county ? ` in ${settings.county} County` : "") +
                    ": where I go, what I file, what it costs, what happens at the hearing, and what the order can include for me and my daughter. Use what you know about my records.";
                  go("advocate");
                }}
              >
                Ask what happens step by step
              </button>
              <button
                className="btn secondary"
                onClick={async () => {
                  const text = await buildAffidavit(settings.displayName, settings.county);
                  downloadText(
                    `draft-statement-${new Date().toISOString().slice(0, 10)}.txt`,
                    text,
                    "text/plain;charset=utf-8"
                  );
                }}
              >
                Download it as a file
              </button>
            </div>
            <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
              The draft is assembled word-for-word from entries you wrote — nothing is added to it.
              It is a starting point for an attorney, not a document to sign as it stands. An
              inaccurate sworn statement damages a real case, so read every line.
            </p>
            {note && <div className="notice calm" style={{ marginTop: 10 }}>{note}</div>}
          </div>
        </>
      )}
    </div>
  );
}
