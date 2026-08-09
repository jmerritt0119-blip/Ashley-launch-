import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { SCANNER_VERSION } from "./scan";
import { applyChrome, loadSettings, quickExit, saveSettings, type Settings } from "./settings";
import { PaneActive } from "./paneContext";
import { onRepairProgress, type RepairProgress } from "./autoRepair";
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
import NotYou from "./components/NotYou";
import Evidence from "./components/Evidence";
import Financials from "./components/Financials";
import Timeline from "./components/Timeline";
import Dates from "./components/Dates";
import Scan from "./components/Scan";
import Packet from "./components/Packet";
import ForAttorney from "./components/ForAttorney";
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
  { key: "attorney", label: "For my attorney" },
  { key: "incidents", label: "Incidents" },
  { key: "custody", label: "Custody" },
  { key: "violations", label: "Violations" },
  { key: "protective", label: "Protective order" },
  { key: "messages", label: "Messages" },
  { key: "journal", label: "Journal" },
  { key: "patterns", label: "Patterns" },
  { key: "notyou", label: "It wasn\u2019t you" },
  { key: "evidence", label: "Evidence" },
  { key: "dates", label: "Dates" },
  { key: "timeline", label: "Timeline" },
  { key: "financials", label: "Financials" },
  { key: "documents", label: "Documents" },
  { key: "packet", label: "Printable packet" },
  { key: "safety", label: "Safety plan" },
  { key: "resources", label: "Resources" },
  { key: "settings", label: "Settings" },
];

/**
 * Five places instead of twenty.
 *
 * The flat nav had twenty buttons and ran off the side of the screen — "Dates"
 * was clipped and six more sat past the edge, including the safety plan. Asking
 * a frightened woman to scan twenty labels to find anything is a design that
 * serves the filing cabinet, not her.
 *
 * Nothing is removed or renamed; the same views are grouped by what she came
 * to do. Opening a section shows its pages beneath, so anything is at most two
 * taps away and the first tap is always one of five obvious choices.
 */
const SECTIONS: { key: string; label: string; views: string[] }[] = [
  { key: "home", label: "Home", views: ["dashboard"] },
  { key: "ask", label: "Ask the AI", views: ["advocate"] },
  {
    key: "add",
    label: "Add evidence",
    views: ["scan", "incidents", "messages", "evidence", "journal"],
  },
  {
    key: "case",
    label: "My case",
    views: [
      "notyou",
      "timeline",
      "patterns",
      "violations",
      "custody",
      "protective",
      "dates",
      "financials",
      "documents",
    ],
  },
  {
    key: "handoff",
    label: "For my attorney",
    views: ["attorney", "packet"],
  },
  { key: "help", label: "Safety & help", views: ["safety", "resources"] },
];

const LABELS: Record<string, string> = Object.fromEntries(
  VIEWS.map((v) => [v.key, v.label])
);

/**
 * Which section a view belongs to, so the right one stays lit.
 *
 * Returns "" for the views that live in the top bar (search, settings) rather
 * than falling back to Home — otherwise the nav highlights Home while she is
 * plainly looking at Settings, which is the app telling her something untrue
 * about where she is.
 */
function sectionOf(view: string): string {
  return SECTIONS.find((s) => s.views.includes(view))?.key ?? "";
}

/**
 * Says what the app is doing while it tidies a duplicated archive.
 *
 * Measured at roughly 80 seconds on an archive of 119,600 rows. Eighty seconds
 * of a message count silently changing is indistinguishable from the app being
 * broken, and she has had enough of that feeling.
 */
function RepairBanner() {
  const [p, setP] = useState<RepairProgress | null>(null);
  useEffect(() => onRepairProgress(setP), []);
  if (!p?.running) return null;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <div className="notice calm no-print" style={{ margin: "0 0 12px" }}>
      <strong>Tidying your archive…</strong> The same messages had been imported
      more than once. Removing the duplicates now
      {p.total ? ` — ${pct}% done` : ""}. This takes a minute or two the first
      time. <strong>Nothing is being lost</strong>, and a full backup was saved
      before it started. You can carry on using the app, or close it — it picks
      up where it left off.
    </div>
  );
}

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
      <div
        data-view={me}
        style={active ? undefined : { display: "none" }}
        aria-hidden={!active}
      >
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

  /**
   * Whether her archive was catalogued by an older, weaker scanner.
   *
   * Kept here rather than only on Home because the offer is worth nothing if
   * she never sees it — she can go days without returning to Home, and the
   * things a newer scanner finds are exactly the things she does not know are
   * missing. Only ever shown when there is something to re-scan.
   */
  const rescanDue = useLiveQuery(async () => {
    const scannedWith = Number((await db.kv.get("scannerVersion"))?.value ?? 0);
    if (!scannedWith || scannedWith >= SCANNER_VERSION) return false;
    return (await db.messages.count()) > 0;
  }, [], false);
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
        <button className="lock-btn" onClick={() => go("search")} title="Search the case file">
          🔍
        </button>
        <button className="lock-btn" onClick={() => go("settings")} title="Settings">
          ⚙
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
        {SECTIONS.map((sec) => (
          <button
            key={sec.key}
            className={sectionOf(view) === sec.key ? "active" : ""}
            onClick={() => go(sec.views[0])}
          >
            {sec.label}
            {rescanDue && sec.views.includes("scan") && (
              <span
                className="badge-dot"
                title="The scanner has improved — worth running it again over your messages"
                aria-label="something new to do here"
              />
            )}
          </button>
        ))}
      </nav>

      {/* The pages inside the open section. Hidden for sections with only one,
          so Home and Ask stay as quiet as they were. */}
      {(SECTIONS.find((s) => s.key === sectionOf(view))?.views.length ?? 0) > 1 && (
        <nav className="nav subnav no-print">
          {SECTIONS.find((s) => s.key === sectionOf(view))!.views.map((k) => (
            <button key={k} className={view === k ? "active" : ""} onClick={() => go(k)}>
              {LABELS[k]}
            </button>
          ))}
        </nav>
      )}

      <main className="main">
        <RepairBanner />
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
        <Pane on={view} me="notyou" mounted={mounted}>
          <NotYou />
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
        <Pane on={view} me="attorney" mounted={mounted}>
          <ForAttorney settings={settings} />
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
