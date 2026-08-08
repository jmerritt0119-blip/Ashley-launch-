import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, exportAllData, importAllData, wipeAllData } from "../db";
import { decryptJson, encryptJson, hashPin, randomSaltHex } from "../crypto";
import { MODEL_OPTIONS, type Settings } from "../settings";
import { biometricsSupported, enrollBiometric } from "../webauthn";
import { makeVaultCode, normalizeVaultCode, pullVault, pushVault, recoverPassphrase } from "../sync";
import { makeRecoveryKey } from "../crypto";
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
Go to https://phoenix-case-builder.netlify.app on that device, open Settings,
enter the vault code and your passphrase, and tap "Load my case onto this device."

IF YOU FORGET YOUR PASSPHRASE
Open Settings on any device, enter the vault code, tap "I forgot my passphrase,"
and enter the recovery key above. It will give your passphrase back to you.

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
      return setVaultMsg("Pick a passphrase of at least 8 characters first.");
    }
    const code = settings.vaultCode || makeVaultCode();
    const key = settings.vaultRecoveryKey || makeRecoveryKey();
    setVaultBusy(true);
    setVaultMsg("Encrypting everything on this device…");
    try {
      const savedAt = await pushVault(code, vaultPass, settings.vaultIncludeFiles, key);
      update({ vaultCode: code, vaultRecoveryKey: key });
      setRecoveryKey(key);
      await db.kv.put({ key: "vaultSavedAt", value: savedAt });
      setVaultMsg("Saved. Save your Recovery Kit below — it's how you get back in if you forget the passphrase.");
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
        `Recovered. Your passphrase is: ${pass} — it's filled in above, so now tap "Load my case onto this device."`
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

      <div className="panel">
        <h2>Your case on every device — and sharing it</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Turn this on and your case is saved to a private vault you can open on your phone, your
          laptop, or a new phone if this one is lost — and that you can hand to your attorney. It's
          locked before it leaves this device: the vault holds scrambled data only, and nobody
          without your passphrase can read it. Not us, not the company that stores it, not him.
        </p>

        <label className="field">
          <span>Vault passphrase — the only key. Write it down somewhere safe he can't reach.</span>
          <input
            type="password"
            placeholder="a phrase you'll remember, 8+ characters"
            value={vaultPass}
            onChange={(e) => setVaultPass(e.target.value)}
          />
        </label>
        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.vaultIncludeFiles}
            onChange={(e) => update({ vaultIncludeFiles: e.target.checked })}
            style={{ width: "auto" }}
          />
          <span style={{ margin: 0 }}>
            Include photo and video files (slower — turn off if syncing takes too long)
          </span>
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" disabled={vaultBusy} onClick={() => void turnOnVault()}>
            {settings.vaultCode ? "Save my case to the vault now" : "Turn on the vault"}
          </button>
          <button className="btn secondary" disabled={vaultBusy} onClick={() => void restoreVault()}>
            Load my case onto this device
          </button>
        </div>

        {settings.vaultCode && (
          <div className="notice calm" style={{ marginTop: 12 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>
              Your vault code
            </div>
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 20,
                letterSpacing: 1,
                fontWeight: 700,
              }}
            >
              {settings.vaultCode}
            </div>
            <p className="small" style={{ margin: "8px 0 0" }}>
              To open your case somewhere else — your laptop, a new phone, or your attorney's
              office — go to the same website there, open Settings, enter this code and your
              passphrase, and tap "Load my case onto this device."
            </p>
            {(recoveryKey || settings.vaultRecoveryKey) && (
              <>
                <div className="small" style={{ fontWeight: 700, margin: "12px 0 4px" }}>
                  Your recovery key — this is your way back in if you forget the passphrase
                </div>
                <div
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 14,
                    fontWeight: 700,
                    wordBreak: "break-word",
                  }}
                >
                  {recoveryKey || settings.vaultRecoveryKey}
                </div>
                <button
                  className="btn secondary sm"
                  style={{ marginTop: 8 }}
                  onClick={() =>
                    downloadKit(settings.vaultCode, recoveryKey || settings.vaultRecoveryKey)
                  }
                >
                  ⬇ Save my Recovery Kit
                </button>
              </>
            )}
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              Anyone with both the code and the passphrase can read everything, so send them
              separately (code by email, passphrase by phone) and only to people you choose.
              {vaultSaved?.value
                ? ` Last saved to the vault: ${new Date(vaultSaved.value).toLocaleString()}.`
                : ""}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button
                className="btn ghost sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(settings.vaultCode);
                  setVaultMsg("Vault code copied.");
                }}
              >
                Copy code
              </button>
              <button
                className="btn ghost sm"
                onClick={() => {
                  if (confirm("Stop using this vault on this device? Your records here are untouched.")) {
                    update({ vaultCode: "" });
                    setVaultMsg("Vault disconnected from this device.");
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        <label className="field" style={{ marginTop: 12 }}>
          <span>Opening a vault made on another device? Enter its code here first.</span>
          <input
            placeholder="ABCD-EFGH-JKLM-NPQR"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onBlur={(e) => setJoinCode(normalizeVaultCode(e.target.value))}
          />
        </label>

        <details className="panel" style={{ marginTop: 12, padding: 12 }}>
          <summary>I forgot my passphrase</summary>
          <p className="muted small">
            That's what the Recovery Kit is for. Enter your vault code above, then the recovery key
            from your kit here — it gives your passphrase back.
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
      </div>

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
    </div>
  );
}
