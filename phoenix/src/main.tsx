import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { autoSnapshot, ensurePersistence } from "./safety";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Offline support + installability (Add to Home Screen on iPhone).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// Ask the browser to protect this site's storage from automatic eviction —
// her records must survive storage-pressure cleanup.
void ensurePersistence();

// A rolling restore point, taken on open and again when the app is put away.
// It costs nothing when nothing has changed and is the difference between a
// mistake being an inconvenience and being the end of a case.
void autoSnapshot();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) void autoSnapshot();
});
