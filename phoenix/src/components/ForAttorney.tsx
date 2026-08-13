import { useEffect, useState } from "react";
import {
  attorneyEmailText,
  buildCaseIndexHtml,
  buildSeverityReportHtml,
  packetStats,
  type PacketStats,
} from "../attorneyPacket";
import { exportEverythingZip } from "../exportCsv";
import { usePaneActive } from "../paneContext";
import type { Settings } from "../settings";

/**
 * Getting the case to her lawyer, in one press.
 *
 * Everything needed for this already existed, spread over three pages and nine
 * buttons. Someone exhausted and frightened does not compare nine buttons. So
 * there is one, and what to do next only appears once she has pressed it.
 *
 * She can also look at exactly what her lawyer will open, before she sends it.
 * Handing over a year of the worst thing that ever happened to you, sight
 * unseen, is its own small cruelty.
 */
export default function ForAttorney({ settings }: { settings: Settings }) {
  const active = usePaneActive();
  const [stats, setStats] = useState<PacketStats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [built, setBuilt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void packetStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const build = async () => {
    setBuilt(null);
    setBusy("Gathering everything…");
    try {
      const { files, bytes } = await exportEverythingZip(
        (d, t) => setBusy(`Packaging ${Math.min(d + 1, t)} of ${t}…`),
        { name: settings.displayName, county: settings.county }
      );
      const mb = Math.max(0.1, Math.round((bytes / 1_048_576) * 10) / 10);
      setBuilt(`${files} files · ${mb} MB — it's in your Downloads (the Files app on a phone).`);
    } catch (e: any) {
      setBuilt("ERROR: " + (e?.message || "unknown error"));
    } finally {
      setBusy(null);
    }
  };

  const openDoc = (html: string) => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const preview = async () => {
    openDoc(await buildCaseIndexHtml(settings.displayName, settings.county));
  };

  /**
   * The record sorted worst first, as a PDF, for the hearing folder.
   * The document carries its own "Save as PDF" button — the browser's print
   * dialog produces a real PDF on any device, and nothing leaves it.
   */
  const severityPdf = async () => {
    openDoc(await buildSeverityReportHtml(settings.displayName, settings.county));
  };

  const email = stats ? attorneyEmailText(settings.displayName, stats) : "";
  const failed = built?.startsWith("ERROR:");

  return (
    <div>
      <h1>For my attorney</h1>
      <p className="muted">
        Your whole case in one file, organised the way a lawyer reads it. One button.
      </p>

      <div className="panel" style={{ borderColor: "var(--accent)", borderWidth: 2, textAlign: "center" }}>
        <button
          className="btn"
          onClick={() => void build()}
          disabled={!!busy}
          style={{ fontSize: "1.15rem", padding: "16px 28px" }}
        >
          {busy || "⬇  Build my case file"}
        </button>
        {stats && (
          <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
            {stats.incidents} incidents · {stats.messages.toLocaleString()} messages (
            {stats.flagged} flagged) · {stats.journal} journal entries
            {stats.violations ? ` · ${stats.violations} order violations` : ""}
            {stats.evidence ? ` · ${stats.evidence} evidence items` : ""}
            {stats.earliest ? ` · ${stats.earliest} to ${stats.latest}` : ""}
          </p>
        )}
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button className="btn secondary" onClick={() => void preview()}>
            See exactly what they'll get
          </button>
          <button className="btn secondary" onClick={() => void severityPdf()}>
            The worst of it, as a PDF
          </button>
        </div>
        <p className="muted small" style={{ marginBottom: 0, marginTop: 8 }}>
          Both open in a new tab. Nothing is sent anywhere — they're built on this device. The PDF
          is every rated incident, flagged message and violation, worst first, each with the
          reference number that ties it back to the full record.
        </p>
      </div>

      {built && !failed && (
        <>
          <div className="notice calm">
            <strong>Done.</strong> {built} Nothing was removed from here — this is a copy.
          </div>

          <div className="panel">
            <h2>Now send it</h2>
            <p className="small">
              Email it to your attorney as an attachment, or upload it to their client portal.
              Send it as it is — it isn't encrypted, because they have to be able to open it.
            </p>
            <p className="small" style={{ marginBottom: 6 }}>
              <strong>Copy this into the email.</strong> It tells them to open{" "}
              <code>OPEN-ME.html</code> first, which is the difference between them working from
              your record and setting it aside.
            </p>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "var(--panel-2, rgba(128,128,128,0.08))",
                padding: 12,
                borderRadius: 8,
                fontSize: "0.88rem",
                overflowX: "auto",
              }}
            >
              {email}
            </pre>
            <button
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(email);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "✓ Copied" : "Copy this message"}
            </button>
            <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
              Afterwards, delete the file from your Downloads if anyone else can reach your phone or
              laptop. Your case stays in this app either way.
            </p>
          </div>
        </>
      )}

      {failed && (
        <div className="notice warn">
          {built} Nothing was lost — your case is untouched. Try again, and if it keeps failing tell
          your attorney you'll bring it on a USB stick.
        </div>
      )}

      <details className="panel">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>What's inside, and why</summary>
        <ul className="small" style={{ lineHeight: 1.9, marginTop: 10 }}>
          <li>
            <strong>OPEN-ME.html</strong> — your whole case in their browser. Searchable,
            filterable, every entry numbered. Nothing to install, no account. This is what they'll
            actually work from.
          </li>
          <li>
            <strong>COVER-LETTER.txt</strong> — what the file is, how the numbering works, and an
            honest note on what's proven and what's your account. Lawyers trust a record more when
            it states its own limits.
          </li>
          <li>
            <strong>CHRONOLOGY.txt</strong> — everything in date order, for printing or pasting into
            a filing.
          </li>
          <li>
            <strong>records/</strong> — every record as a spreadsheet they can sort and filter.
          </li>
          <li>
            <strong>records/EVIDENCE-INTEGRITY.csv</strong> — the fingerprint taken when each file
            entered your records, and when. This is the answer to "she could have made these up."
          </li>
          <li>
            <strong>files/</strong> — your photos, video and recordings, numbered to match.
          </li>
        </ul>
        <p className="muted small" style={{ marginBottom: 0 }}>
          The cover letter also lists what they can obtain that you can't — carrier records, police
          reports, medical records, financial disclosure. Handing a lawyer that list saves a meeting.
        </p>
      </details>
    </div>
  );
}
