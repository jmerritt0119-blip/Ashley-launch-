import { useCallback, useEffect, useState } from "react";
import { db, findDuplicateMessages } from "../db";
import { dismissRepairNotice, lastRepair, type RepairReport } from "../autoRepair";
import {
  canPromptInstall,
  ensurePersistence,
  listSnapshots,
  promptInstall,
  restoreSnapshot,
  storageReport,
  takeSnapshot,
  totalRows,
  watchInstallability,
  type SnapshotMeta,
  type StorageReport,
} from "../safety";

const when = (t: number) => {
  const d = new Date(t);
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hr ago`;
  return d.toLocaleDateString();
};

/**
 * Everything about whether her case is safe, in one place and in plain words.
 * She should never have to wonder whether it saved.
 */
export default function DataSafety({ compact = false }: { compact?: boolean }) {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([]);
  const [installable, setInstallable] = useState(canPromptInstall());
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dups, setDups] = useState<{ groups: number; removable: number[] } | null>(null);
  const [repair, setRepair] = useState<RepairReport | null>(null);

  const scanForDuplicates = async () => {
    setBusy("dups");
    const found = await findDuplicateMessages();
    setDups({ groups: found.groups, removable: found.removable });
    setNote(
      found.groups === 0
        ? "No duplicates — every message in your archive is there once."
        : `Found ${found.removable.length.toLocaleString()} duplicate copies across ${found.groups.toLocaleString()} messages. Nothing has been removed; the button below does that.`
    );
    setBusy("");
  };

  const removeDuplicates = async () => {
    if (!dups?.removable.length) return;
    if (
      !confirm(
        `Remove ${dups.removable.length.toLocaleString()} duplicate copies?\n\n` +
          "For each message that appears more than once, one copy is kept — the copy carrying " +
          "your stars and tags, if any. No message is lost: every distinct message stays.\n\n" +
          "A restore point is saved first, so this is reversible."
      )
    )
      return;
    setBusy("dups");
    await takeSnapshot("before removing duplicate messages");
    await db.messages.bulkDelete(dups.removable);
    setNote(
      `Removed ${dups.removable.length.toLocaleString()} duplicate copies. Every distinct message is still here, and a restore point was saved first.`
    );
    setDups(null);
    await refresh();
    setBusy("");
  };

  const refresh = useCallback(async () => {
    setReport(await storageReport());
    setSnaps(await listSnapshots());
    setRepair(await lastRepair());
  }, []);

  useEffect(() => {
    void refresh();
    return watchInstallability(() => setInstallable(true));
  }, [refresh]);

  const turnOnProtection = async () => {
    setBusy("protect");
    const ok = await ensurePersistence();
    setNote(
      ok
        ? "Protected. This browser will not clear your case to free up space."
        : "This browser wouldn't grant permanent storage. Install the app (below) and keep a backup — that covers it."
    );
    await refresh();
    setBusy("");
  };

  const backupNow = async () => {
    setBusy("snap");
    const s = await takeSnapshot("saved by hand");
    setNote(
      s
        ? `Restore point saved — ${totalRows(s.counts).toLocaleString()} records.`
        : "There's nothing saved yet to make a restore point from."
    );
    await refresh();
    setBusy("");
  };

  const doRestore = async (s: SnapshotMeta) => {
    if (
      !confirm(
        `Put back the restore point from ${when(s.createdAt)} (${totalRows(s.counts).toLocaleString()} records)?\n\n` +
          "Nothing on this device is deleted or overwritten. Anything missing is added back; anything already here stays as it is."
      )
    )
      return;
    setBusy("restore");
    try {
      await restoreSnapshot(s.id!);
      setNote("Restored. Anything that was missing has been put back.");
    } catch (e: any) {
      setNote("Couldn't restore: " + (e?.message || "unknown error"));
    }
    await refresh();
    setBusy("");
  };

  const atRisk = report && !report.persisted;
  const iosNotInstalled = report?.isIos && !report.installed;

  return (
    <div className="panel">
      <h2>Is my case safe?</h2>

      {repair && (
        <div className="notice calm">
          <strong>Your archive has been tidied automatically.</strong> The same message export had
          been uploaded more than once, so every text was stored several times over.{" "}
          {repair.removed.toLocaleString()} duplicate copies were removed and{" "}
          {repair.kept.toLocaleString()} messages remain — one of each.
          <br />
          Nothing was lost. Every distinct message is still here, any stars and tags you had added
          were carried onto the copy that stayed, and a restore point was saved first in case you
          ever want the old state back.
          <button
            className="chip"
            style={{ marginTop: 8 }}
            onClick={() => {
              void dismissRepairNotice();
              setRepair(null);
            }}
          >
            got it
          </button>
        </div>
      )}

      <ul className="small" style={{ lineHeight: 1.8, paddingLeft: 18, margin: "6px 0 12px" }}>
        <li>
          {report?.persisted ? "✅" : "⚠️"} <strong>Permanent storage:</strong>{" "}
          {report?.persisted
            ? "on — this browser will not clear your case to free up space."
            : "not granted yet. Turn it on below."}
        </li>
        <li>
          {report?.installed ? "✅" : iosNotInstalled ? "⚠️" : "○"} <strong>Installed as an app:</strong>{" "}
          {report?.installed
            ? "yes."
            : iosNotInstalled
              ? "no — and on an iPhone that matters. Safari erases a website's saved data after 7 days of not opening it. Once it's on your Home Screen, that rule no longer applies."
              : "not yet. Installing puts it on your home screen and makes it open like any other app."}
        </li>
        <li>
          {snaps.length ? "✅" : "○"} <strong>Restore points on this device:</strong>{" "}
          {snaps.length
            ? `${snaps.length}, most recent ${when(snaps[0].createdAt)}.`
            : "none yet — one is made automatically as soon as you add something."}
        </li>
        {report?.usedMb != null && (
          <li className="muted">
            Using {report.usedMb.toLocaleString()} MB
            {report.quotaMb ? ` of about ${report.quotaMb.toLocaleString()} MB available.` : "."}
          </li>
        )}
      </ul>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {atRisk && (
          <button className="btn" onClick={() => void turnOnProtection()} disabled={busy === "protect"}>
            {busy === "protect" ? "Asking…" : "Turn on permanent storage"}
          </button>
        )}
        {installable && !report?.installed && (
          <button
            className="btn"
            onClick={async () => {
              const ok = await promptInstall();
              setInstallable(canPromptInstall());
              if (ok) setNote("Installed. Open it from your home screen from now on.");
              await refresh();
            }}
          >
            Install this app
          </button>
        )}
        {iosNotInstalled && !installable && (
          <button className="btn" onClick={() => setShowIos(!showIos)}>
            How to install on iPhone
          </button>
        )}
        <button className="btn secondary" onClick={() => void backupNow()} disabled={busy === "snap"}>
          {busy === "snap" ? "Saving…" : "Make a restore point now"}
        </button>
        <button className="btn secondary" onClick={() => void scanForDuplicates()} disabled={busy === "dups"}>
          {busy === "dups" ? "Checking…" : "Check for duplicate messages"}
        </button>
        {!!dups?.removable.length && (
          <button className="btn" onClick={() => void removeDuplicates()} disabled={busy === "dups"}>
            Remove {dups.removable.length.toLocaleString()} duplicates
          </button>
        )}
      </div>

      {showIos && (
        <div className="notice calm" style={{ marginTop: 10 }}>
          <strong>On an iPhone or iPad:</strong> tap the <strong>Share</strong> button at the bottom
          of Safari (the square with the arrow pointing up), scroll down, tap{" "}
          <strong>Add to Home Screen</strong>, then <strong>Add</strong>. Open Phoenix from that icon
          from then on. On a Mac, in Safari it's <strong>File → Add to Dock</strong>; in Chrome or
          Edge it's the install icon at the right-hand end of the address bar.
        </div>
      )}

      {note && <div className="notice calm" style={{ marginTop: 10 }}>{note}</div>}

      {!compact && snaps.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            Restore points ({snaps.length})
          </summary>
          <p className="small muted" style={{ marginTop: 8 }}>
            Automatic copies of your written records, kept on this device. Restoring only ever adds
            back what is missing — it never deletes or overwrites anything you have now. Photos and
            videos aren't part of a restore point; the full backup in Settings and the cloud vault
            both carry those.
          </p>
          {snaps.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                padding: "6px 0",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span className="small" style={{ minWidth: 110 }}>
                {when(s.createdAt)}
              </span>
              <span className="small muted" style={{ flex: 1 }}>
                {totalRows(s.counts).toLocaleString()} records · {s.reason}
              </span>
              <button
                className="chip"
                onClick={() => void doRestore(s)}
                disabled={busy === "restore"}
              >
                put this back
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
