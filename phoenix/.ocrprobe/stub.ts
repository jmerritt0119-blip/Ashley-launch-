// A stand-in for the OCR engine so the batch logic can be tested without it.
let live = 0;
export const stats = { created: 0, terminated: 0, recognised: 0, maxLive: 0 };
(globalThis as any).__ocrStats = stats;
export async function createWorker(_lang: string) {
  stats.created++; live++; stats.maxLive = Math.max(stats.maxLive, live);
  let wedged = false;
  return {
    async recognize(blob: Blob) {
      stats.recognised++;
      if (wedged) throw new Error("worker is wedged");
      const n = (globalThis as any).__names.shift();
      if (n === "BAD") { wedged = true; throw new Error("unsupported image"); }
      if (n === "EMPTY") return { data: { text: "   " } };
      return { data: { text: `text from ${n} (${blob.type}, ${blob.size} bytes)` } };
    },
    async terminate() { stats.terminated++; live--; },
  };
}
