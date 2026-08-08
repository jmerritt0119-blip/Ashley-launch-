// Visual QA: serve dist/, seed demo data, screenshot key views.
// Usage: node tools/screenshot.mjs <outDir>
import { chromium } from "playwright-core";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";

const OUT = process.argv[2] || "/tmp/shots";
const DIST = new URL("../dist", import.meta.url).pathname;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

const server = createServer(async (req, res) => {
  let path = req.url.split("?")[0];
  if (path === "/") path = "/index.html";
  try {
    const data = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    const data = await readFile(join(DIST, "index.html"));
    res.writeHead(200, { "content-type": "text/html" });
    res.end(data);
  }
});
await new Promise((r) => server.listen(4199, r));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1180, height: 860 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

await page.goto("http://localhost:4199/", { waitUntil: "networkidle" });

// Seed demo data through the app's own Dexie instance.
await page.evaluate(async () => {
  const open = indexedDB.open("phx_notes");
  await new Promise((resolve) => {
    // Let the app create the schema first; it already has by now.
    open.onsuccess = resolve;
    open.onerror = resolve;
  });
  const db = open.result;
  const put = (store, rows) =>
    new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      rows.forEach((r) => os.add(r));
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  const now = Date.now();
  await put("incidents", [
    { date: "2026-07-14", time: "20:40", title: "Showed up 3 hours late to exchange, smelled of alcohol", narrative: 'Scheduled exchange was 6:00pm. He arrived 8:40pm. When I asked, he said "You don\'t get to keep her from me. Remember what happened last time."', categories: ["children / custody", "threats / intimidation"], severity: 4, location: "My apartment lobby", witnesses: "Doorman (Luis)", policeReport: "", medical: "", childrenPresent: true, createdAt: now },
    { date: "2026-06-30", time: "", title: "Emptied the joint savings account", narrative: "Checked the account for daycare payment — $8,400 transferred out to an account I don't recognize. No discussion, no notice.", categories: ["financial abuse"], severity: 3, location: "", witnesses: "", policeReport: "", medical: "", childrenPresent: false, createdAt: now },
    { date: "2026-06-08", time: "22:15", title: "Threw a chair, blocked the bedroom door", narrative: "Argument about the divorce filing escalated. He threw the kitchen chair at the wall and stood in the doorway for 40 minutes refusing to let me leave the room.", categories: ["physical", "coercive control"], severity: 5, location: "Kitchen / hallway", witnesses: "", policeReport: "26-118842", medical: "Photos of wall damage taken", childrenPresent: true, createdAt: now },
  ]);
  await put("messages", [
    { date: "2026-07-15", sender: "Him", text: "You'll regret the lawyer. I promise you that.", source: "paste", tags: ["threat"], starred: true, createdAt: now },
    { date: "2026-07-02", sender: "Him", text: "Nobody is going to believe you. You're crazy and everyone knows it.", source: "paste", tags: ["control"], starred: true, createdAt: now },
  ]);
  await put("dates", [
    { date: "2026-08-21", time: "09:00", title: "Temporary orders hearing — Dept. 3", type: "hearing", location: "County Family Court", notes: "Bring evidence binder + witness list", createdAt: now },
  ]);
  await put("evidence", [
    { date: "2026-06-09", title: "Wall damage after chair incident", kind: "photo", notes: "Taken morning after; originals in iCloud album", tags: [], createdAt: now },
  ]);
  localStorage.setItem("phx_settings_v1", JSON.stringify({ safetyAcknowledged: false, displayName: "Ashley", theme: "light", connection: "server", model: "claude-opus-5", shareContext: true, discreet: false, autoLock: false, pinHash: null, pinSalt: null, bioCredId: null, apiKey: "" }));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);

// 1. Safety notice (first-run)
await page.screenshot({ path: `${OUT}/1-safety.png` });
await page.click("text=I understand — let's get to work");
await page.waitForTimeout(500);

// 2. Dashboard
await page.screenshot({ path: `${OUT}/2-dashboard.png` });

// 3. Incidents
await page.click(".nav >> text=Incidents");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/3-incidents.png` });

// 4. Advocate
await page.click(".nav >> text=Advocate");
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/4-advocate.png` });

// 5. Dark dashboard
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("phx_settings_v1"));
  s.theme = "dark";
  localStorage.setItem("phx_settings_v1", JSON.stringify(s));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/5-dark.png` });

// 6. Mobile dashboard (iPhone-ish)
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto("http://localhost:4199/", { waitUntil: "networkidle" });
await mobile.waitForTimeout(500);
await mobile.screenshot({ path: `${OUT}/6-mobile.png` });

await browser.close();
server.close();
console.log("done");
