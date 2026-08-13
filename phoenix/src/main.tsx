import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { autoSnapshot, ensurePersistence } from "./safety";
import { autoRepair } from "./autoRepair";
import { useNewestBuild } from "./freshBuild";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Offline support + installability (Add to Home Screen on iPhone).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    // updateViaCache: "none" so the worker script itself is never served from
    // cache — otherwise the thing responsible for updating the app is the one
    // piece that never updates.
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}

// Run the version that is actually deployed.
//
// A deploy that is verified live and still not running in the browser looking
// at it is worse than no deploy: it produces old behaviour with no sign that
// the code is old. Checked at startup only, so a scan in progress is never
// interrupted.
if (import.meta.env.PROD) void useNewestBuild();

// Ask the browser to protect this site's storage from automatic eviction —
// her records must survive storage-pressure cleanup.
void ensurePersistence();

// A rolling restore point, taken on open and again when the app is put away.
// It costs nothing when nothing has changed and is the difference between a
// mistake being an inconvenience and being the end of a case.
void autoSnapshot();

// Collapse duplicate messages left by importing the same export more than
// once. Cheap when there is nothing to do, and it means she opens the app to a
// correct archive rather than to a chore.
void autoRepair();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) void autoSnapshot();
});
