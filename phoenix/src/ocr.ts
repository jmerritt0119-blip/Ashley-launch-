// Screenshot OCR — turns photos of text threads into text, entirely on-device.
// tesseract.js is lazy-loaded so it costs nothing unless used; the OCR engine
// itself downloads on first use and needs a network connection that one time.

export async function ocrImages(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    let out = "";
    for (let i = 0; i < files.length; i++) {
      onProgress?.(i + 1, files.length);
      const { data } = await worker.recognize(files[i]);
      const text = (data.text || "").trim();
      if (text) out += (out ? "\n\n" : "") + text;
    }
    return out;
  } finally {
    await worker.terminate();
  }
}
