import { useEffect, useState } from "react";
import { exportAllData, importAllData, wipeAllData } from "../db";
import { decryptJson, encryptJson, hashPin, randomSaltHex } from "../crypto";
import { MODEL_OPTIONS, type Settings } from "../settings";
import { biometricsSupported, enrollBiometric } from "../webauthn";

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
        <h2>Backup & restore</h2>
        <p className="muted small">
          Everything lives only in this browser. If this device is lost — or its storage cleared —
          the records go with it. Export an encrypted backup regularly and keep it somewhere he
          cannot reach (a private cloud drive, or with someone you trust).
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
