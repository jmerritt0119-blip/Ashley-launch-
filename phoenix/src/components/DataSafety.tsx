import { useCallback, useEffect, useState } from "react";
import { db, findDuplicateMessages, findTimestampOnlyMessages } from "../db";
import { dismissRepairNotice, lastRepair, onRepairProgress, type RepairReport } from "../autoRepair";
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
  const [stamps, setStamps] = useState<{ ids: number[]; total: number } | null>(null);
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

  /**
   * Finds messages that imported with a timestamp instead of their words.
   *
   * Worth its own button because scanning them is the most expensive possible
   * way to learn nothing: a full run over an archive of dates costs the same as
   * a real one and returns an empty catalog, which reads as "there is nothing
   * in your messages."
   */
  const checkForTimestampRows = async () => {
    setBusy("stamps");
    const found = await findTimestampOnlyMessages();
    setStamps(found);
    setNote(
      found.ids.length === 0
        ? "Every message in your archive has real words in it. Nothing to clean up."
        : `${found.ids.length.toLocaleString()} of your ${found.total.toLocaleString()} saved messages came in with only a date where the words should be — an import fault, now fixed. They cannot be scanned and nothing can be found in them. Nothing has been removed; the button below does that.`
    );
    setBusy("");
  };

  const removeTimestampRows = async () => {
    if (!stamps?.ids.length) return;
    if (
      !confirm(
        `Remove ${stamps.ids.length.toLocaleString()} messages that saved with only a date?\n\n` +
          "These hold no words — nothing you or anyone else wrote. They came from a fault in " +
          "reading the export file, which is now fixed.\n\n" +
          "Remove them, then add your export again and it will come in properly.\n\n" +
          "A restore point is saved first, so this is reversible."
      )
    )
      return;
    setBusy("stamps");
    await takeSnapshot("before removing messages that imported as dates");
    const CHUNK = 2000;
    for (let i = 0; i < stamps.ids.length; i += CHUNK) {
      await db.messages.bulkDelete(stamps.ids.slice(i, i + CHUNK));
    }
    setNote(
      `Removed ${stamps.ids.length.toLocaleString()} empty messages. Add your export again — it will import with the actual messages this time, and every message will be marked with who sent it.`
    );
    setStamps(null);
    await refresh();
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
    const stopWatchingInstall = watchInstallability(() => setInstallable(true));
    // The repair usually finishes AFTER this panel has already read its state,
    // so without this she sits through an eighty-second cleanup and is told
    // nothing about it until she happens to reload.
    const stopWatchingRepair = onRepairProgress((p) => {
      if (!p.running) void refresh();
    });
    return () => {
      stopWatchingInstall();
      stopWatchingRepair();
    };
  }, [refresh]);

  /**
   * Asks the browser to protect her storage — quietly, and only as a follow-up.
   *
   * This used to be a button of its own, and it was a button that could not
   * succeed. Safari does not grant persistence on request at all, and Chrome
   * only grants it once the site is installed or heavily used. So the common
   * outcome of pressing "Turn on permanent storage" was being told it did not
   * work, which reads as the app being broken when it is the browser behaving
   * exactly as designed.
   *
   * The thing that actually works is installing to the Home Screen, so that is
   * the only action offered now. This runs silently after an install, when the
   * browser will usually say yes.
   */
  const askForPersistence = async () => {
    await ensurePersistence();
    await refresh();
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

  // "Safe" means the browser will not quietly bin her case. Installing to the
  // home screen achieves that on every platform; a granted persistence flag
  // achieves it on the ones that hand it out. Either is enough.
  const safe = !!report && (report.installed || report.persisted);

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

      {/* One answer, in one line, before any detail. */}
      {report && (safe ? (
        <div className="notice calm">
          <strong>Yes — your case is safe on this device.</strong> It's on your home screen, and
          nothing here gets cleared to free up space.
        </div>
      ) : (
        <div className="notice">
          <strong>There's one thing to do, and it takes about ten seconds.</strong>
          <p className="small" style={{ margin: "6px 0" }}>
            Right now Phoenix is running as a website, and phones delete website data to save
            space. {report.isIos
              ? "On an iPhone that's automatic: Safari erases it after 7 days of not opening it."
              : "Your phone can clear it at any point when storage runs low."}{" "}
            Putting it on your home screen stops that completely — it's the same app, it just stops
            being treated as a throwaway web page.
          </p>
          {installable ? (
            <button
              className="btn"
              onClick={async () => {
                const ok = await promptInstall();
                setInstallable(canPromptInstall());
                if (ok) {
                  setNote("Done. Open it from your home screen from now on.");
                  // Browsers that refuse persistence to a plain website will
                  // usually grant it once installed, so ask again now.
                  await askForPersistence();
                }
                await refresh();
              }}
            >
              Put Phoenix on my home screen
            </button>
          ) : (
            <button className="btn" onClick={() => setShowIos(!showIos)}>
              Show me how — {report.isIos ? "iPhone" : "this device"}
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
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
        <button
          className="btn secondary"
          onClick={() => void checkForTimestampRows()}
          disabled={busy === "stamps"}
        >
          {busy === "stamps" ? "Checking…" : "Check my messages have their words"}
        </button>
        {!!stamps?.ids.length && (
          <button className="btn" onClick={() => void removeTimestampRows()} disabled={busy === "stamps"}>
            Remove {stamps.ids.length.toLocaleString()} empty messages
          </button>
        )}
      </div>

      {/* The detail is still here for anyone who wants it, just not in her way. */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer" }} className="small muted">
          The details
        </summary>
        <ul className="small" style={{ lineHeight: 1.8, paddingLeft: 18, margin: "6px 0 0" }}>
          <li>
            {report?.installed ? "✅" : "○"} <strong>On the home screen:</strong>{" "}
            {report?.installed ? "yes." : "not yet."}
          </li>
          <li>
            {report?.persisted ? "✅" : "○"} <strong>Storage marked permanent:</strong>{" "}
            {report?.persisted
              ? "yes."
              : "not yet — most browsers only grant this once the app is on the home screen, and it's granted automatically then."}
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
      </details>

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
