import { useEffect, useRef, useState } from "react";
import { db } from "../db";
import { analyzePatterns, fillMissingTimes, type PatternReport } from "../patterns";
import { messagesFromCsv } from "../parseMessages";
import { usePaneActive } from "../paneContext";
import { downloadText } from "../exportCsv";
import type { Settings } from "../settings";

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
};

export default function Patterns({ settings, go }: { settings: Settings; go: (v: string) => void }) {
  const active = usePaneActive();
  const [r, setR] = useState<PatternReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => setR(await analyzePatterns(settings.hisNames));

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void analyzePatterns(settings.hisNames).then((res) => {
      if (!cancelled) setR(res);
    });
    return () => {
      cancelled = true;
    };
  }, [active, settings.hisNames]);

  const onFile = async (f: File) => {
    setBusy(true);
    setFillNote("Reading the file…");
    try {
      const parsed = messagesFromCsv(await f.text());
      const res = await fillMissingTimes(parsed, (d, t) =>
        setFillNote(`Filling in times… ${d} of ${t}`)
      );
      setFillNote(
        `Added times to ${res.filled.toLocaleString()} message${res.filled === 1 ? "" : "s"}. ` +
          `${res.alreadyHad.toLocaleString()} already had one and were left alone. ` +
          (res.unmatched
            ? `${res.unmatched.toLocaleString()} messages here weren't in this file — untouched. `
            : "") +
          "Nothing was added, removed, or changed apart from filling in blank times."
      );
      await load();
    } catch (e: any) {
      setFillNote("Couldn't read that file: " + (e?.message || "unknown error") + ". Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const saveReport = async () => {
    if (!r) return;
    const lines = [
      `PATTERN SUMMARY — generated ${new Date().toLocaleDateString()}`,
      "",
      `Messages on record: ${r.total.toLocaleString()}${r.hisTotal !== r.total ? ` (${r.hisTotal.toLocaleString()} from him)` : ""}`,
      r.busiestMonth
        ? `Heaviest month of contact from him: ${monthLabel(r.busiestMonth.month)} — ${r.busiestMonth.his.toLocaleString()} messages`
        : "",
      r.nightCount ? `Messages from him between 11pm and 5am: ${r.nightCount.toLocaleString()}` : "",
      "",
      r.bursts.length ? "RUNS OF MESSAGES WITH NO REPLY FROM ME" : "",
      ...r.bursts.map(
        (b) => `  ${b.date}, ${b.from}–${b.to}: ${b.count} messages in a row. First: "${b.sample}"`
      ),
      "",
      r.aroundDates.length ? "CONTACT SPIKES AROUND KEY DATES" : "",
      ...r.aroundDates.map(
        (a) =>
          `  ${a.date} (${a.title}): ${a.after} messages in the following week, against a usual week of about ${a.usual}.`
      ),
      "",
      "Every figure above was counted from my own message records.",
    ].filter((l) => l !== "");
    const now = Date.now();
    await db.documents.add({
      title: `Pattern summary (${new Date().toISOString().slice(0, 10)})`,
      content: lines.join("\n"),
      createdAt: now,
      updatedAt: now,
    });
    setFillNote("Saved the pattern summary to Documents.");
  };

  const maxMonth = Math.max(1, ...(r?.monthly || []).map((m) => Math.max(m.his, m.hers)));

  return (
    <div>
      <h1>Patterns</h1>
      <p className="muted">
        One cruel message is an incident. Forty messages between 1am and 4am is a pattern — and a
        pattern is what proves harassment and control. These are counted from your own records; no
        estimates, and nothing leaves this device.
      </p>

      {!r && <p className="muted">Reading your messages…</p>}

      {r && r.notes.length > 0 && (
        <div className="notice calm">
          {r.notes.map((n, i) => (
            <p key={i} style={{ margin: i ? "8px 0 0" : 0 }}>
              {n}
            </p>
          ))}
          {r.timed < r.total && (
            <div style={{ marginTop: 10 }}>
              <button className="btn secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
                Fill in missing times from my export
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onFile(f);
                }}
              />
              <p className="muted small" style={{ marginBottom: 0, marginTop: 6 }}>
                Pick the same export you imported before. This only writes a time onto messages that
                are missing one — it never adds a message, never removes one, and never touches your
                text, stars or tags.
              </p>
            </div>
          )}
        </div>
      )}

      {fillNote && <div className="notice calm">{fillNote}</div>}

      {r && r.total === 0 && (
        <p className="muted">
          No messages yet.{" "}
          <a style={{ cursor: "pointer" }} onClick={() => go("scan")}>
            Upload an export
          </a>{" "}
          and this fills in.
        </p>
      )}

      {r && r.bursts.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--danger)", borderWidth: 2 }}>
          <h2 style={{ color: "var(--danger)" }}>
            {r.bursts.length} time{r.bursts.length === 1 ? "" : "s"} he sent a run of messages you
            never answered
          </h2>
          <p className="small">
            A back-and-forth is a conversation. A run of messages with no reply is something else,
            and it is the shape courts recognise as harassment. Each of these ended only when he
            stopped.
          </p>
          {r.bursts.map((b, i) => (
            <div className="item-card sev-5" key={i}>
              <div className="head">
                <span className="date">{b.date}</span>
                <span className="title">
                  {b.count} messages between {b.from} and {b.to}
                </span>
              </div>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                First one: "{b.sample}"
              </p>
            </div>
          ))}
        </div>
      )}

      {r && r.nightCount > 0 && (
        <div className="panel">
          <h2>{r.nightCount.toLocaleString()} messages from him between 11pm and 5am</h2>
          <p className="small">
            Contact at these hours is hard to explain as ordinary co-parenting, and it goes directly
            to whether the contact was meant to wear you down.
          </p>
          {r.nightExamples.map((m, i) => (
            <div className="item-card" key={i}>
              <div className="head">
                <span className="date">
                  {m.date} {m.time}
                </span>
              </div>
              <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{m.text}</p>
            </div>
          ))}
        </div>
      )}

      {r && r.aroundDates.length > 0 && (
        <div className="panel">
          <h2>His contact spiked around these dates</h2>
          <p className="small">
            Compared against his ordinary week across the whole record. Escalation tied to a legal
            step is exactly what a judge is being asked to weigh.
          </p>
          {r.aroundDates.map((a, i) => (
            <div className="item-card" key={i}>
              <div className="head">
                <span className="date">{a.date}</span>
                <span className="title">{a.title}</span>
              </div>
              <p className="small" style={{ margin: "6px 0 0" }}>
                <strong>{a.after}</strong> messages in the week that followed, against a usual week
                of about <strong>{a.usual}</strong>.
              </p>
            </div>
          ))}
        </div>
      )}

      {r && r.monthly.length > 1 && (
        <div className="panel">
          <h2>Contact over time</h2>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", minHeight: 130, paddingTop: 8 }}>
              {r.monthly.map((m) => (
                <div key={m.month} style={{ textAlign: "center", minWidth: 34 }}>
                  <div
                    title={`${m.his} from him`}
                    style={{
                      height: Math.round((m.his / maxMonth) * 100) + 2,
                      background: "var(--danger)",
                      borderRadius: "3px 3px 0 0",
                    }}
                  />
                  <div
                    title={`${m.hers} from you`}
                    style={{
                      height: Math.round((m.hers / maxMonth) * 100) + 1,
                      background: "var(--line)",
                    }}
                  />
                  <div className="small muted" style={{ fontSize: 10, marginTop: 4 }}>
                    {monthLabel(m.month)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
            Darker bar is his, lighter is yours. Tallest month:{" "}
            {r.busiestMonth ? `${monthLabel(r.busiestMonth.month)}, ${r.busiestMonth.his.toLocaleString()} from him` : "—"}.
          </p>
        </div>
      )}

      {r && r.total > 0 && (
        <div className="panel">
          <h2>Take it with you</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => void saveReport()}>
              Save this summary to Documents
            </button>
            <button
              className="btn secondary"
              onClick={() =>
                downloadText(
                  `pattern-summary-${new Date().toISOString().slice(0, 10)}.txt`,
                  `Messages: ${r.total}\nFrom him: ${r.hisTotal}\nNight messages (11pm–5am): ${r.nightCount}\nUnanswered runs: ${r.bursts.length}\n\n` +
                    r.bursts.map((b) => `${b.date} ${b.from}-${b.to}: ${b.count} messages`).join("\n"),
                  "text/plain;charset=utf-8"
                )
              }
            >
              Download as a file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
