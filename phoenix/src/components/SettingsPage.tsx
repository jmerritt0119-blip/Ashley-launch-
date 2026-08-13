import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, exportAllData, importAllData, wipeAllData } from "../db";
import { decryptJson, encryptJson, hashPin, randomSaltHex } from "../crypto";
import { MODEL_OPTIONS, type Settings } from "../settings";
import { biometricsSupported, enrollBiometric } from "../webauthn";
import {
  makeVaultCode,
  normalizeVaultCode,
  passphraseOpensVault,
  pullVault,
  pushVault,
  recoverPassphrase,
} from "../sync";
import { makeRecoveryKey } from "../crypto";
import { buildLabel } from "../buildStamp";
import DataSafety from "./DataSafety";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export default function SettingsPage({ settings, update }: Props) {
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [status, setStatus] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const lastBackup = useLiveQuery(() => db.kv.get("lastBackupAt"), []);

  // ---- Cloud vault ----
  const [vaultPass, setVaultPass] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultMsg, setVaultMsg] = useState<string | null>(null);
  const vaultSaved = useLiveQuery(() => db.kv.get("vaultSavedAt"), []);

  const [recoveryKey, setRecoveryKey] = useState("");
  const [recoverInput, setRecoverInput] = useState("");

  const downloadKit = (code: string, key: string) => {
    const text = `PHOENIX RECOVERY KIT
Keep this somewhere safe that he cannot reach — a locked drawer, a trusted
person, a safe deposit box. A photo of this page counts. Anyone holding BOTH
lines below can open your case, so store it like you'd store a spare house key.

Vault code:   ${code}
Recovery key: ${key}

TO OPEN YOUR CASE ON ANOTHER DEVICE
Go to https://phoenix-case-builder.netlify.app on that device and open Settings.
Scroll to the line "I'm setting up a new phone or laptop — bring my case onto
it" and tap it to open that section. Enter the vault code and your passphrase,
then tap "Bring my case onto this device."

IF YOU FORGET YOUR PASSPHRASE
In that same section, enter the vault code, tap "I forgot the passphrase," and
enter the recovery key above. It will give your passphrase back to you.

Created ${new Date().toLocaleString()}
`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "phoenix-recovery-kit.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const turnOnVault = async () => {
    if (vaultPass.length < 8) {
      return setVaultMsg(
        settings.vaultCode
          ? "Type your backup passphrase in the box above first — the same one you chose when you turned this on."
          : "Pick a passphrase of at least 8 characters first."
      );
    }
    const code = settings.vaultCode || makeVaultCode();
    const key = settings.vaultRecoveryKey || makeRecoveryKey();
    setVaultBusy(true);
    // Every save encrypts under the passphrase just typed. Saving over an
    // existing vault with a mistyped one would not fail — it would succeed,
    // and strand the newest version of her case under a passphrase nobody
    // knows. So before overwriting, prove the typed passphrase opens what is
    // already there.
    if (settings.vaultCode) {
      setVaultMsg("Checking your passphrase against the backup…");
      const opens = await passphraseOpensVault(code, vaultPass).catch(() => null);
      if (opens === false) {
        setVaultBusy(false);
        return setVaultMsg(
          "That's not the passphrase this backup uses, so nothing was saved. " +
            'If you\'ve forgotten it, your Recovery Kit can give it back — see "I forgot the passphrase" below.'
        );
      }
    }
    setVaultMsg("Encrypting everything on this device…");
    try {
      const { savedAt, filesDropped } = await pushVault(
        code,
        vaultPass,
        settings.vaultIncludeFiles,
        key
      );
      update({ vaultCode: code, vaultRecoveryKey: key });
      setRecoveryKey(key);
      await db.kv.put({ key: "vaultSavedAt", value: savedAt });
      setVaultMsg(
        filesDropped
          ? "Saved — but it was too big with the photos and videos in it, so those stayed on this device. " +
            "Everything written is in there: your incidents, every message, what the scan found, and your journal. " +
            "Save your Recovery Kit below — it's how you get back in if you forget the passphrase."
          : "Saved. Save your Recovery Kit below — it's how you get back in if you forget the passphrase."
      );
    } catch (e: any) {
      setVaultMsg(e?.message || "Couldn't save to the vault.");
    } finally {
      setVaultBusy(false);
    }
  };

  const doRecover = async () => {
    const code = normalizeVaultCode(joinCode || settings.vaultCode || "");
    if (!code) return setVaultMsg("Enter the vault code from your Recovery Kit first.");
    if (!recoverInput.trim()) return setVaultMsg("Enter the recovery key from your Recovery Kit.");
    setVaultBusy(true);
    setVaultMsg("Checking your recovery key…");
    try {
      const pass = await recoverPassphrase(code, recoverInput);
      setVaultPass(pass);
      setVaultMsg(
        `Recovered. Your passphrase is: ${pass} — it's filled in above, so now tap "Bring my case onto this device."`
      );
    } catch (e: any) {
      setVaultMsg(e?.message || "Couldn't recover with that key.");
    } finally {
      setVaultBusy(false);
    }
  };

  const restoreVault = async () => {
    const code = normalizeVaultCode(joinCode || settings.vaultCode || "");
    if (!code) return setVaultMsg("Enter the vault code from the other device.");
    if (!vaultPass) return setVaultMsg("Enter the passphrase for that vault.");
    setVaultBusy(true);
    setVaultMsg("Opening the vault…");
    try {
      await pullVault(code, vaultPass);
      update({ vaultCode: code });
      setVaultMsg("Everything is here. Your records loaded onto this device.");
    } catch (e: any) {
      setVaultMsg(e?.message || "Couldn't open the vault.");
    } finally {
      setVaultBusy(false);
    }
  };

  useEffect(() => {
    void biometricsSupported().then(setBioAvailable);
  }, []);

  const enableBio = async () => {
    try {
      const credId = await enrollBiometric();
      update({ bioCredId: credId });
      setStatus("Face ID / Touch ID unlock enabled.");
    } catch {
      setStatus("Couldn't set up Face ID / Touch ID — you can keep using the PIN.");
    }
  };

  const setPin = async () => {
    if (pin1.length < 4) return setStatus("PIN must be at least 4 digits.");
    if (pin1 !== pin2) return setStatus("PINs don't match.");
    const salt = randomSaltHex();
    const hash = await hashPin(pin1, salt);
    update({ pinSalt: salt, pinHash: hash });
    setPin1("");
    setPin2("");
    setStatus("PIN set. The app will ask for it on open.");
  };

  const exportBackup = async () => {
    if (passphrase.length < 8) return setStatus("Use a passphrase of at least 8 characters for the backup.");
    setStatus("Building encrypted backup…");
    const data = await exportAllData();
    const encrypted = await encryptJson(data, passphrase);
    const blob = new Blob([JSON.stringify(encrypted)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phoenix-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await db.kv.put({ key: "lastBackupAt", value: Date.now() });
    setStatus("Encrypted backup downloaded. Store it somewhere he cannot access.");
  };

  const importBackup = async (file: File) => {
    try {
      if (passphrase.length === 0) return setStatus("Enter the backup's passphrase first, then choose the file.");
      setStatus("Restoring…");
      const payload = JSON.parse(await file.text());
      const data = payload.format === "phoenix-encrypted" ? await decryptJson(payload, passphrase) : payload;
      await importAllData(data);
      setStatus("Backup restored — entries were added to your current records.");
    } catch (e: any) {
      setStatus(`Restore failed: ${e?.message || "wrong passphrase or corrupted file"}`);
    }
  };

  const panic = async () => {
    if (!confirm("Erase EVERYTHING stored in this app on this device? This cannot be undone.")) return;
    const typed = prompt('Type DELETE to confirm:');
    if (typed !== "DELETE") return;
    await wipeAllData();
    window.location.reload();
  };

  return (
    <div>
      <h1>Settings & safety</h1>

      <div className="panel">
        <h2>Privacy on this device</h2>
        <div className="row">
          <label className="field">
            <span>Your first name (used in greetings and the packet — optional)</span>
            <input value={settings.displayName} onChange={(e) => update({ displayName: e.target.value })} />
          </label>
          <label className="field">
            <span>Your Texas county (so answers use your court's rules)</span>
            <input
              placeholder="e.g. Harris, Tarrant, Bexar"
              value={settings.county}
              onChange={(e) => update({ county: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Theme</span>
            <select
              value={settings.theme}
              onChange={(e) => update({ theme: e.target.value as Settings["theme"] })}
            >
              <option value="auto">Match my device (auto)</option>
              <option value="light">Light</option>
              <option value="dark">Dark (dim — less visible at night)</option>
            </select>
          </label>
        </div>
        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.discreet}
            onChange={(e) => update({ discreet: e.target.checked })}
            style={{ width: "auto" }}
          />
          <span style={{ margin: 0 }}>
            Discreet mode — browser tab shows "Recipe Box" with a neutral icon
          </span>
        </label>
        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.autoLock}
            onChange={(e) => update({ autoLock: e.target.checked })}
            style={{ width: "auto" }}
          />
          <span style={{ margin: 0 }}>Auto-lock when I switch away from this tab (requires a PIN)</span>
        </label>

        <hr className="hr" />
        <h3>{settings.pinHash ? "Change PIN" : "Set a PIN"}</h3>
        <div className="row">
          <label className="field">
            <span>New PIN (4+ digits)</span>
            <input type="password" inputMode="numeric" value={pin1} onChange={(e) => setPin1(e.target.value)} />
          </label>
          <label className="field">
            <span>Repeat PIN</span>
            <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn secondary" onClick={() => void setPin()}>
            Save PIN
          </button>
          {settings.pinHash && (
            <button
              className="btn ghost"
              onClick={() => update({ pinHash: null, pinSalt: null, bioCredId: null })}
            >
              Remove PIN
            </button>
          )}
        </div>
        {settings.pinHash && bioAvailable && (
          <div style={{ marginTop: 12 }}>
            {settings.bioCredId ? (
              <button className="btn ghost" onClick={() => update({ bioCredId: null })}>
                Disable Face ID / Touch ID unlock
              </button>
            ) : (
              <button className="btn secondary" onClick={() => void enableBio()}>
                Enable Face ID / Touch ID unlock
              </button>
            )}
            <p className="muted small" style={{ marginTop: 6 }}>
              Uses your device's own Face ID / Touch ID (Apple's platform authenticator). The PIN
              always keeps working as a fallback.
            </p>
          </div>
        )}
        <p className="muted small" style={{ marginTop: 8 }}>
          The PIN deters casual snooping on a shared device. It is not full encryption — if the
          device itself may be monitored, use a safer device.
        </p>
      </div>

      <div className="panel">
        <h2>AI connection</h2>
        <label className="field">
          <span>How The Advocate connects</span>
          <select
            value={settings.connection}
            onChange={(e) => update({ connection: e.target.value as "server" | "direct" })}
          >
            <option value="server">This site's server (recommended — key stays on the server)</option>
            <option value="direct">My own API key (stored only on this device)</option>
          </select>
        </label>
        {settings.connection === "direct" && (
          <label className="field">
            <span>Anthropic API key</span>
            <input
              type="password"
              placeholder="sk-ant-…"
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
            />
          </label>
        )}
        <label className="field">
          <span>Model</span>
          <select value={settings.model} onChange={(e) => update({ model: e.target.value })}>
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          {MODEL_OPTIONS.find((m) => m.id === settings.model)?.note}
        </p>
        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.shareContext}
            onChange={(e) => update({ shareContext: e.target.checked })}
            style={{ width: "auto" }}
          />
          <span style={{ margin: 0 }}>
            Share my case file with The Advocate (sends your logs to the AI when you chat, so it can
            cite your actual entries)
          </span>
        </label>
      </div>

      {/*
        One question, one action.

        This screen used to show everything at once: a passphrase box, a
        files checkbox, a "turn on" button sitting directly beside a "load onto
        this device" button that does the opposite, a code, a recovery key, and
        a field for entering someone else's code. Four secret-sounding nouns —
        vault, vault code, recovery key, passphrase — and a second, unrelated
        backup with its own passphrase further down the same page.

        Nobody could follow it, including the person who commissioned it. So it
        now asks one thing at a time: before it is on, the only choice is
        whether to turn it on. Everything else is behind a heading that says
        who it is for.
      */}
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>If you lose this phone</h2>

        {!settings.vaultCode ? (
          <>
            <p style={{ marginTop: 0 }}>
              Right now everything you have written is <strong>only on this phone</strong>. If it is
              lost, broken, taken, or wiped, your case goes with it.
            </p>
            <p className="small">
              This keeps a locked copy somewhere safe, so it survives. It is scrambled on this
              phone before it leaves, which means the company storing it cannot read it, we cannot
              read it, and he cannot read it. Only your passphrase opens it.
            </p>
            <label className="field">
              <span>
                Choose a passphrase — 8 characters or more. Write it somewhere he cannot reach.
              </span>
              <input
                type="password"
                placeholder="a phrase you will remember"
                value={vaultPass}
                onChange={(e) => setVaultPass(e.target.value)}
              />
            </label>
            <button
              className="btn"
              disabled={vaultBusy || vaultPass.length < 8}
              onClick={() => void turnOnVault()}
            >
              {vaultBusy ? "Working…" : "Turn on backup"}
            </button>
            <p className="muted small" style={{ marginBottom: 0 }}>
              It takes a minute or two the first time.
            </p>
          </>
        ) : (
          <>
            <div className="notice calm" style={{ marginTop: 0 }}>
              <strong>Backup is on.</strong>{" "}
              {vaultSaved?.value
                ? `Last saved ${new Date(vaultSaved.value).toLocaleString()}.`
                : "Nothing saved to it yet — tap Save now."}
            </div>
            {/*
              This box existed only in the "backup is off" branch, and the
              passphrase itself is deliberately never stored on the device. So
              in any fresh browser session "Save now" demanded a passphrase
              there was no box for, and saving became impossible exactly one
              reload after turning the backup on.
            */}
            <label className="field">
              <span>Your backup passphrase — the same one you chose when you turned this on</span>
              <input
                type="password"
                placeholder="needed each time you save"
                value={vaultPass}
                onChange={(e) => setVaultPass(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" disabled={vaultBusy} onClick={() => void turnOnVault()}>
                {vaultBusy ? "Saving…" : "Save now"}
              </button>
              {(recoveryKey || settings.vaultRecoveryKey) && (
                <button
                  className="btn secondary"
                  onClick={() =>
                    downloadKit(settings.vaultCode, recoveryKey || settings.vaultRecoveryKey)
                  }
                >
                  ⬇ Save my Recovery Kit
                </button>
              )}
            </div>
            <p className="small" style={{ marginBottom: 4 }}>
              <strong>Save the Recovery Kit and keep it somewhere he cannot reach.</strong> It is a
              small file holding the two things that get you back in — your code and a recovery key
              for the day you cannot remember the passphrase. Without it, a forgotten passphrase
              means the backup can never be opened by anyone, including us.
            </p>
            <p className="muted small">
              Your code: <strong style={{ fontFamily: "ui-monospace, monospace" }}>{settings.vaultCode}</strong>{" "}
              — anyone holding both this and your passphrase can read everything, so never send them
              together.
            </p>

            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }} className="small">
                Opening this on another phone, laptop, or at your attorney's office
              </summary>
              <p className="small" style={{ marginTop: 8 }}>
                On that device, go to the same website, open Settings, and use the section below.
                You will need the code and the passphrase.
              </p>
            </details>

            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer" }} className="small">
                Stop using this backup on this device
              </summary>
              <p className="small" style={{ marginTop: 8 }}>
                Your records on this phone stay exactly where they are — only the link to the backup
                is removed.
              </p>
              <button
                className="btn ghost sm"
                onClick={() => {
                  if (confirm("Stop using this backup on this device? Your records here are untouched.")) {
                    update({ vaultCode: "" });
                    setVaultMsg("Backup disconnected from this device.");
                  }
                }}
              >
                Disconnect
              </button>
            </details>
          </>
        )}
        {/*
          The one place this message rendered was inside the collapsed
          "new phone" section below — so "Saved.", every error, and the
          passphrase prompts were all invisible from the buttons that caused
          them. A button whose answer appears inside a closed drawer looks
          like a button that does nothing.
        */}
        {vaultMsg && <div className="notice calm">{vaultMsg}</div>}
      </div>

      {/* Deliberately its own panel: this is for a DIFFERENT device, and having
          it beside "turn on backup" is how someone ends up pressing the one
          that pulls instead of the one that pushes. */}
      <details className="panel">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>
          I'm setting up a new phone or laptop — bring my case onto it
        </summary>
        <p className="small">
          Use this only on a device that does not have your case yet. You need the code and
          passphrase from the phone that has it.
        </p>
        <label className="field">
          <span>The code from your Recovery Kit</span>
          <input
            placeholder="ABCD-EFGH-JKLM-NPQR"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onBlur={(e) => setJoinCode(normalizeVaultCode(e.target.value))}
          />
        </label>
        <label className="field">
          <span>The passphrase</span>
          <input
            type="password"
            value={vaultPass}
            onChange={(e) => setVaultPass(e.target.value)}
          />
        </label>
        <button className="btn" disabled={vaultBusy} onClick={() => void restoreVault()}>
          Bring my case onto this device
        </button>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer" }} className="small">
            I forgot the passphrase
          </summary>
          <p className="muted small" style={{ marginTop: 8 }}>
            That is what the Recovery Kit is for. Put your code in above, then the recovery key from
            the kit here.
          </p>
          <label className="field">
            <span>Recovery key (the words from your kit)</span>
            <input
              placeholder="cedar-harbor-mica-…"
              value={recoverInput}
              onChange={(e) => setRecoverInput(e.target.value)}
            />
          </label>
          <button className="btn secondary" disabled={vaultBusy} onClick={() => void doRecover()}>
            Get my passphrase back
          </button>
        </details>

        {vaultMsg && <div className="notice calm">{vaultMsg}</div>}
      </details>

      <DataSafety />

      <div className="panel">
        <h2>Backup & restore</h2>
        <p className="muted small">
          Everything lives only in this browser. If this device is lost — or its storage cleared —
          the records go with it. Export an encrypted backup regularly and keep it somewhere he
          cannot reach (a private cloud drive, or with someone you trust).
        </p>
        <p className="small" style={{ fontWeight: 700 }}>
          Last backup:{" "}
          {lastBackup?.value
            ? new Date(lastBackup.value).toLocaleDateString() +
              ` (${Math.max(0, Math.round((Date.now() - lastBackup.value) / 86400000))} days ago)`
            : "never"}
        </p>
        <label className="field">
          <span>Backup passphrase (needed again to restore — don't lose it)</span>
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn secondary" onClick={() => void exportBackup()}>
            Export encrypted backup
          </button>
          <label className="btn ghost" style={{ display: "inline-block", cursor: "pointer" }}>
            Restore from backup…
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importBackup(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ color: "var(--danger)" }}>Emergency erase</h2>
        <p className="muted small">
          Instantly and permanently deletes everything this app has stored on this device — all
          logs, messages, evidence files, chat history, and settings.
        </p>
        <button className="btn danger" onClick={() => void panic()}>
          Erase everything now
        </button>
      </div>

      {status && <div className="notice calm">{status}</div>}

      <p className="muted small" style={{ textAlign: "center", marginTop: 24 }}>
        Version {buildLabel()}
      </p>
    </div>
  );
}
