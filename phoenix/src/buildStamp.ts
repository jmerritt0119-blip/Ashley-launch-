/**
 * Which build is actually running in her browser.
 *
 * The deploy workflow overwrites this file with the exact commit being shipped,
 * then checks the live JavaScript bundle for that same commit. Without it, a
 * deploy could report success while the browser was still being served an older
 * build: the check on the live site looked for the word "Phoenix", and that
 * lives in index.html, which is identical between every version. The site
 * answering is not the same fact as the fix having arrived.
 *
 * The value is inert — a string shown in Settings. It reads nothing and writes
 * nothing, so it cannot touch anything she has entered.
 */
// The `: string` annotations are load-bearing. The deploy rewrites these two
// values, and without them TypeScript narrows each to its literal, which turns
// the comparison below into a compile error the moment a real commit is stamped.
export const BUILD_SHA: string = "dev";
export const BUILD_TIME: string = "";

/**
 * Publishes the full commit onto <html data-build="…"> at startup.
 *
 * This is what makes the deploy check honest. Everything else here only ever
 * uses the first seven characters, and a minifier folds `"abc…".slice(0, 7)`
 * down to the seven-character result — so the whole commit would vanish from
 * the shipped JavaScript and the check would have nothing to match. A side
 * effect cannot be folded away, so the full value survives.
 */
if (typeof document !== "undefined") {
  document.documentElement.dataset.build = BUILD_SHA;
}

/** Short form for display: "a1b2c3d" — enough to identify a build exactly. */
export function buildLabel(): string {
  if (!BUILD_SHA || BUILD_SHA === "dev") return "development build";
  const when = BUILD_TIME ? new Date(BUILD_TIME) : null;
  const date =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "";
  return date ? `${BUILD_SHA.slice(0, 7)} · ${date}` : BUILD_SHA.slice(0, 7);
}
