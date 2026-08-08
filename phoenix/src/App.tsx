import { useCallback, useEffect, useRef, useState } from "react";
import { applyChrome, loadSettings, quickExit, saveSettings, type Settings } from "./settings";
import PinGate from "./components/PinGate";
import SafetyNotice from "./components/SafetyNotice";
import Dashboard from "./components/Dashboard";
import Incidents from "./components/Incidents";
import Custody from "./components/Custody";
import Messages from "./components/Messages";
import Evidence from "./components/Evidence";
import Financials from "./components/Financials";
import Timeline from "./components/Timeline";
import Dates from "./components/Dates";
import Scan from "./components/Scan";
import Packet from "./components/Packet";
import Advocate from "./components/Advocate";
import Resources from "./components/Resources";
import SettingsPage from "./components/SettingsPage";

const VIEWS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Home" },
  { key: "incidents", label: "Incidents" },
  { key: "custody", label: "Custody" },
  { key: "messages", label: "Messages" },
  { key: "scan", label: "Deep scan" },
  { key: "evidence", label: "Evidence" },
  { key: "financials", label: "Financials" },
  { key: "dates", label: "Dates" },
  { key: "timeline", label: "Timeline" },
  { key: "advocate", label: "Advocate" },
  { key: "packet", label: "Packet" },
  { key: "resources", label: "Resources" },
  { key: "settings", label: "Settings" },
];

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [locked, setLocked] = useState<boolean>(() => !!loadSettings().pinHash);
  const [view, setView] = useState("dashboard");
  const lastEsc = useRef(0);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      applyChrome(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyChrome(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the device's light/dark preference live when theme is "auto".
  useEffect(() => {
    if (settings.theme !== "auto" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyChrome(settings);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings]);

  const prepWithAdvocate = useCallback((prompt: string) => {
    sessionStorage.setItem("phx_advocate_prefill", prompt);
    setView("advocate");
  }, []);

  // Esc pressed twice within 800ms → leave immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const now = Date.now();
        if (now - lastEsc.current < 800) quickExit();
        lastEsc.current = now;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Optional auto-lock when the tab is hidden.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && settings.autoLock && settings.pinHash) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [settings.autoLock, settings.pinHash]);

  if (locked && settings.pinHash) {
    return <PinGate settings={settings} onUnlock={() => setLocked(false)} />;
  }

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <span className="flame">{settings.discreet ? "▣" : "🔥"}</span>
          <span>{settings.discreet ? "Notes" : "Phoenix"}</span>
          {!settings.discreet && <span className="sub">case builder for survivors</span>}
        </div>
        <div className="spacer" />
        {settings.pinHash && (
          <button className="lock-btn" onClick={() => setLocked(true)} title="Lock the app">
            Lock
          </button>
        )}
        <button
          className="quick-exit"
          onClick={quickExit}
          title="Instantly leave — replaces this page with a weather search (or press Esc twice)"
        >
          ✕ Exit
        </button>
      </header>

      <nav className="nav no-print">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            className={view === v.key ? "active" : ""}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {view === "dashboard" && <Dashboard go={setView} displayName={settings.displayName} />}
        {view === "incidents" && <Incidents />}
        {view === "custody" && <Custody />}
        {view === "messages" && <Messages />}
        {view === "evidence" && <Evidence />}
        {view === "financials" && <Financials />}
        {view === "dates" && <Dates prepWithAdvocate={prepWithAdvocate} />}
        {view === "scan" && <Scan settings={settings} goSettings={() => setView("settings")} />}
        {view === "timeline" && <Timeline />}
        {view === "advocate" && <Advocate settings={settings} goSettings={() => setView("settings")} />}
        {view === "packet" && <Packet displayName={settings.displayName} />}
        {view === "resources" && <Resources />}
        {view === "settings" && <SettingsPage settings={settings} update={update} />}
      </main>

      {!settings.safetyAcknowledged && (
        <SafetyNotice onAcknowledge={() => update({ safetyAcknowledged: true })} />
      )}
    </div>
  );
}
