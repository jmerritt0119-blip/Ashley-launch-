/**
 * Make the app run the version that is actually deployed.
 *
 * Four times in one day a fix was deployed, verified against the live host, and
 * still not running in the browser looking at it — because the page had been
 * open, or the service worker had the old bundle cached, and nothing told
 * anyone. The visible symptom was a scan splitting her archive into 103 parts
 * when the deployed code says 28: an old number, produced by old code, with no
 * hint that the code was old.
 *
 * "Reload the page" is not a fix. It is a thing to remember, and the person
 * using this app has a custody case to think about instead.
 *
 * So the app checks for itself. index.html carries the hashed name of the
 * bundle it wants; the running page knows which bundle it loaded. If those
 * differ, a newer build exists.
 *
 * Two rules make this safe:
 *
 *  - Only at startup, never mid-session. Reloading during a scan would throw
 *    away a run in progress, and a run can be half an hour long. At startup
 *    nothing is in flight.
 *  - Once per version. The new bundle name is recorded before reloading, so a
 *    reload that somehow does not take cannot become a loop.
 */
const SEEN_KEY = "phx_reloaded_for_build";

/** The /assets/index-HASH.js this page is actually running. */
function runningBundle(): string | null {
  for (const el of Array.from(document.querySelectorAll("script[src]"))) {
    const path = new URL((el as HTMLScriptElement).src, location.href).pathname;
    if (/^\/assets\/index-[^/]+\.js$/.test(path)) return path;
  }
  return null;
}

/** The one the server is serving right now. */
async function publishedBundle(): Promise<string | null> {
  // no-store, not no-cache: this request must not be answered from any cache,
  // which is the entire point of asking.
  const res = await fetch(`/index.html?fresh=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(/\/assets\/index-[^"']+\.js/);
  return m ? m[0] : null;
}

export async function useNewestBuild(): Promise<void> {
  try {
    const running = runningBundle();
    if (!running) return;
    const published = await publishedBundle();
    if (!published || published === running) return;
    if (sessionStorage.getItem(SEEN_KEY) === published) return;
    sessionStorage.setItem(SEEN_KEY, published);

    // Drop every cached asset, then let the service worker fetch the new one.
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update().catch(() => {});
    }
    location.reload();
  } catch {
    /* An update check must never be the reason the app fails to open. */
  }
}
