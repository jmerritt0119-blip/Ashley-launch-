import { useEffect, useRef, useState } from "react";
import { hashPin } from "../crypto";
import { quickExit, type Settings } from "../settings";
import { verifyBiometric } from "../webauthn";

interface Props {
  settings: Settings;
  onUnlock: () => void;
}

export default function PinGate({ settings, onUnlock }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const triedBio = useRef(false);

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

  const tryBio = async () => {
    if (!settings.bioCredId || bioBusy) return;
    setBioBusy(true);
    const ok = await verifyBiometric(settings.bioCredId);
    setBioBusy(false);
    if (ok) onUnlock();
  };

  // Offer Face ID / Touch ID immediately when enabled.
  useEffect(() => {
    if (settings.bioCredId && !triedBio.current) {
      triedBio.current = true;
      void tryBio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={() => void tryUnlock()}>
            Unlock
          </button>
          {settings.bioCredId && (
            <button className="btn secondary" disabled={bioBusy} onClick={() => void tryBio()}>
              {bioBusy ? "Checking…" : "Use Face ID / Touch ID"}
            </button>
          )}
          <button className="btn ghost" onClick={quickExit}>
            Exit to weather
          </button>
        </div>
      </div>
    </div>
  );
}
