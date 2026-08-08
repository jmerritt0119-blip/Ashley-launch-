// One-shot, in-memory handoffs between views. Navigation never reloads the
// page, so plain module state is enough — and huge scan payloads (a whole
// message export) would overflow sessionStorage anyway.
export const handoff: {
  /** Text for the Deep Scan view to load and start scanning immediately. */
  scanText: string | null;
  /** A question for The Advocate to send immediately on open. */
  ask: string | null;
} = {
  scanText: null,
  ask: null,
};
