import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { applyChrome, loadSettings, quickExit, saveSettings, type Settings } from "./settings";
import { PaneActive } from "./paneContext";
import PinGate from "./components/PinGate";
import SafetyNotice from "./components/SafetyNotice";
import Dashboard from "./components/Dashboard";
import Incidents from "./components/Incidents";
import Custody from "./components/Custody";
import Violations from "./components/Violations";
import ProtectiveOrder from "./components/ProtectiveOrder";
import Messages from "./components/Messages";
import Journal from "./components/Journal";
import Patterns from "./components/Patterns";
import Evidence from "./components/Evidence";
import Financials from "./components/Financials";
import Timeline from "./components/Timeline";
import Dates from "./components/Dates";
import Scan from "./components/Scan";
import Packet from "./components/Packet";
import Advocate from "./components/Advocate";
import Documents from "./components/Documents";
import SafetyPlan from "./components/SafetyPlan";
import Search from "./components/Search";
import Resources from "./components/Resources";
import SettingsPage from "./components/SettingsPage";

const VIEWS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Home" },
  { key: "advocate", label: "Ask the AI" },
  { key: "scan", label: "Upload & scan" },
  { key: "incidents", label: "Incidents" },
  { key: "custody", label: "Custody" },
  { key: "violations", label: "Violations" },
  { key: "protective", label: "Protective order" },
  { key: "messages", label: "Messages" },
  { key: "journal", label: "Journal" },
  { key: "patterns", label: "Patterns" },
  { key: "evidence", label: "Evidence" },
  { key: "dates", label: "Dates" },
  { key: "timeline", label: "Timeline" },
  { key: "financials", label: "Financials" },
  { key: "documents", label: "Documents" },
  { key: "packet", label: "Packet" },
  { key: "safety", label: "Safety plan" },
  { key: "resources", label: "Resources" },
  { key: "settings", label: "Settings" },
];

/**
 * Renders a view once it has been visited, then keeps it alive off-screen.
 * `hidden` is set through inline display so a view's own layout rules can't
 * accidentally reveal it, and printing only ever sees the visible pane.
 */
function Pane({
  on,
  me,
  mounted,
  children,
}: {
  on: string;
  me: string;
  mounted: string[];
  children: ReactNode;
}) {
  if (!mounted.includes(me)) return null;
  const active = on === me;
  return (
    <PaneActive.Provider value={active}>
      <div style={active ? undefined : { display: "none" }} aria-hidden={!active}>
        {children}
      </div>
    </PaneActive.Provider>
  );
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [locked, setLocked] = useState<boolean>(() => !!loadSettings().pinHash);
  const [view, setView] = useState("dashboard");
  /**
   * Views are mounted on first visit and then kept alive, hidden rather than
   * destroyed. Tearing a view down on every tab switch threw away whatever was
   * half-typed in it — a partly written incident, a paste waiting to be
   * imported. Nothing she has typed may disappear because she looked at
   * something else. (Forms additionally mirror to disk via useDraft, so even
   * closing the browser is survivable.)
   */
  const [mounted, setMounted] = useState<string[]>(["dashboard"]);
  const lastEsc = useRef(0);

  const go = useCallback((next: string) => {
    setMounted((m) => (m.includes(next) ? m : [...m, next]));
    setView(next);
  }, []);

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

  const prepWithAdvocate = useCallback(
    (prompt: string) => {
      sessionStorage.setItem("phx_advocate_prefill", prompt);
      go("advocate");
    },
    [go]
  );

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
          <span className="flame">
            {settings.discreet ? (
              "▣"
            ) : (
              <svg viewBox="0 0 24 30" fill="currentColor" aria-hidden="true">
                <path d="M12 0C13 6 19 9 19 17c0 5-3.4 9-7 9s-7-4-7-9C5 12 8.5 8.5 9.5 5c1 2 2.5 3.5 2.5 6.5C13.5 9.5 12.5 4.5 12 0zm0 26c1.9 0 3.5-2 3.5-4.5 0-3-2-4.5-3.5-7-1.5 2.5-3.5 4-3.5 7C8.5 24 10.1 26 12 26z" />
              </svg>
            )}
          </span>
          <span>{settings.discreet ? "Notes" : "Phoenix"}</span>
          {!settings.discreet && <span className="sub">case builder for survivors</span>}
        </div>
        <div className="spacer" />
        <button className="lock-btn" onClick={() => setView("search")} title="Search the case file">
          🔍
        </button>
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
          <button key={v.key} className={view === v.key ? "active" : ""} onClick={() => go(v.key)}>
            {v.label}
          </button>
        ))}
      </nav>

      <main className="main">
        <Pane on={view} me="dashboard" mounted={mounted}>
          <Dashboard go={go} displayName={settings.displayName} settings={settings} />
        </Pane>
        <Pane on={view} me="incidents" mounted={mounted}>
          <Incidents />
        </Pane>
        <Pane on={view} me="custody" mounted={mounted}>
          <Custody />
        </Pane>
        <Pane on={view} me="violations" mounted={mounted}>
          <Violations go={go} />
        </Pane>
        <Pane on={view} me="protective" mounted={mounted}>
          <ProtectiveOrder settings={settings} go={go} />
        </Pane>
        <Pane on={view} me="messages" mounted={mounted}>
          <Messages />
        </Pane>
        <Pane on={view} me="journal" mounted={mounted}>
          <Journal go={go} />
        </Pane>
        <Pane on={view} me="patterns" mounted={mounted}>
          <Patterns settings={settings} go={go} />
        </Pane>
        <Pane on={view} me="evidence" mounted={mounted}>
          <Evidence />
        </Pane>
        <Pane on={view} me="financials" mounted={mounted}>
          <Financials />
        </Pane>
        <Pane on={view} me="dates" mounted={mounted}>
          <Dates prepWithAdvocate={prepWithAdvocate} />
        </Pane>
        <Pane on={view} me="scan" mounted={mounted}>
          <Scan
            settings={settings}
            goSettings={() => go("settings")}
            update={update}
            active={view === "scan"}
          />
        </Pane>
        <Pane on={view} me="timeline" mounted={mounted}>
          <Timeline />
        </Pane>
        <Pane on={view} me="advocate" mounted={mounted}>
          <Advocate
            settings={settings}
            goSettings={() => go("settings")}
            active={view === "advocate"}
          />
        </Pane>
        <Pane on={view} me="documents" mounted={mounted}>
          <Documents />
        </Pane>
        <Pane on={view} me="packet" mounted={mounted}>
          <Packet displayName={settings.displayName} />
        </Pane>
        <Pane on={view} me="safety" mounted={mounted}>
          <SafetyPlan />
        </Pane>
        <Pane on={view} me="search" mounted={mounted}>
          <Search go={go} settings={settings} />
        </Pane>
        <Pane on={view} me="resources" mounted={mounted}>
          <Resources />
        </Pane>
        <Pane on={view} me="settings" mounted={mounted}>
          <SettingsPage settings={settings} update={update} />
        </Pane>
      </main>

      {!settings.safetyAcknowledged && (
        <SafetyNotice onAcknowledge={() => update({ safetyAcknowledged: true })} />
      )}
    </div>
  );
}
