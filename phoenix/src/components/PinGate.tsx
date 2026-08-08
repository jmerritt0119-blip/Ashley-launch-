import { useState } from "react";
import { hashPin } from "../crypto";
import { quickExit, type Settings } from "../settings";

interface Props {
  settings: Settings;
  onUnlock: () => void;
}

export default function PinGate({ settings, onUnlock }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const tryUnlock = async () => {
    if (!settings.pinHash || !settings.pinSalt) {
      onUnlock();
      return;
    }
    const h = await hashPin(pin, settings.pinSalt);
    if (h === settings.pinHash) {
      onUnlock();
    } else {
      setError(true);
      setPin("");
    }
  };

  return (
    <div className="gate">
      <div className="modal">
        <h2 style={{ fontFamily: "var(--serif)" }}>
          <span style={{ color: "var(--ember)" }}>●</span> Locked
        </h2>
        <p className="muted">Enter your PIN to open your workspace.</p>
        <input
          className="pin-input"
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void tryUnlock();
          }}
        />
        {error && (
          <p className="small" style={{ color: "var(--danger)", marginTop: 8 }}>
            That PIN didn't match.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "center" }}>
          <button className="btn" onClick={() => void tryUnlock()}>
            Unlock
          </button>
          <button className="btn ghost" onClick={quickExit}>
            Exit to weather
          </button>
        </div>
      </div>
    </div>
  );
}
