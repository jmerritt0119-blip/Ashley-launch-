// Local (device-only) settings. Nothing here ever leaves the browser except
// the API key, which is sent only to Anthropic when the user talks to the AI.

export interface Settings {
  pinHash: string | null;
  pinSalt: string | null;
  autoLock: boolean;
  bioCredId: string | null;
  discreet: boolean;
  theme: "light" | "dark" | "auto";
  connection: "server" | "direct";
  apiKey: string;
  model: string;
  shareContext: boolean;
  safetyAcknowledged: boolean;
  displayName: string;
  /** Texas county — lets The Advocate use the right court's local practice. */
  county: string;
  /**
   * Which sender names/numbers in an imported thread are HIM. Without this the
   * app can't tell his words from hers in a phone-number-only export — and his
   * words are the ones that carry weight in court.
   */
  hisNames: string;
  /**
   * Everyone else the case turns on, by name: a new partner he moved in, her
   * children, his family, a witness.
   *
   * These are not senders — they are people talked ABOUT. A name here is the
   * difference between "she is moving in on the 3rd" reading as ordinary
   * chatter and reading as the dated arrival of a new partner in the home, and
   * between a child's name being scenery and being the child the case is about.
   * The scanner cannot infer that from a message archive; a first name in a
   * text carries no role.
   */
  otherNames: string;
  /** Cloud vault: multi-device + attorney sharing. Empty = not enabled. */
  vaultCode: string;
  vaultRecoveryKey: string;
  vaultIncludeFiles: boolean;
}

export const MODEL_OPTIONS: { id: string; label: string; note: string }[] = [
  {
    id: "claude-opus-5",
    label: "Claude Opus 5 (recommended)",
    note: "Frontier-level reasoning — the default brain for The Advocate.",
  },
  {
    id: "claude-fable-5",
    label: "Claude Fable 5 (maximum)",
    note: "Anthropic's most capable model. Higher cost; requires API access to it.",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5 (faster)",
    note: "Near-Opus quality at lower cost and latency.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5 (quickest)",
    note: "Light and fast for simple questions.",
  },
];

const KEY = "phx_settings_v1";

const DEFAULTS: Settings = {
  pinHash: null,
  pinSalt: null,
  autoLock: false,
  bioCredId: null,
  discreet: false,
  theme: "auto",
  connection: "server",
  apiKey: "",
  model: "claude-opus-5",
  shareContext: true,
  safetyAcknowledged: false,
  displayName: "",
  county: "",
  hisNames: "",
  otherNames: "",
  vaultCode: "",
  vaultRecoveryKey: "",
  vaultIncludeFiles: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

const DISCREET_TITLE = "Recipe Box";
const REAL_TITLE = "Phoenix — Case Builder";
const DISCREET_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8D%B2%3C/text%3E%3C/svg%3E";
const REAL_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%94%A5%3C/text%3E%3C/svg%3E";

export function resolveTheme(s: Settings): "light" | "dark" {
  if (s.theme === "auto") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return s.theme;
}

export function applyChrome(s: Settings): void {
  document.title = s.discreet ? DISCREET_TITLE : REAL_TITLE;
  const link = document.getElementById("favicon") as HTMLLinkElement | null;
  if (link) link.href = s.discreet ? DISCREET_ICON : REAL_ICON;
  document.documentElement.dataset.theme = resolveTheme(s);
}

/** Immediately replace this tab with an innocuous page, leaving no back entry. */
export function quickExit(): void {
  try {
    window.location.replace("https://www.google.com/search?q=weather+forecast");
  } catch {
    window.location.href = "https://www.google.com";
  }
}
