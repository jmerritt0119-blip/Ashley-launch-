// Screenshot OCR — turns photos of text threads into text, entirely on-device.
// tesseract.js is lazy-loaded so it costs nothing unless used; the OCR engine
// itself downloads on first use and needs a network connection that one time.

export interface OcrOutcome {
  /** Everything that could be read, joined. Never empty because of one failure. */
  text: string;
  /** How many pictures produced text. */
  read: number;
  /** The ones that did not, with a reason she can act on. */
  failed: { name: string; reason: string }[];
}

/** Beyond this, recognition costs memory and time without reading text better. */
const MAX_EDGE = 2000;

/** Recycle the engine this often — long-lived workers grow, and phones evict. */
const RECYCLE_EVERY = 25;

/**
 * Shrinks a picture before recognition, and normalises the format.
 *
 * Two jobs. A modern phone photo is 12 megapixels; recognising it at full size
 * costs many seconds and a large amount of memory per picture, which is what
 * makes a batch of a hundred fall over on a phone — and it reads no better,
 * because the text is enormous at that resolution.
 *
 * The second job matters more. iPhones save as HEIC, which the OCR engine
 * cannot decode at all — those pictures used to fail outright. Safari decodes
 * HEIC natively through createImageBitmap, so routing every picture through a
 * canvas converts it to PNG on the way in and makes her own camera roll
 * readable.
 *
 * Any failure here returns the original file rather than throwing: a picture
 * that cannot be shrunk may still be one the engine can read.
 */
async function prepare(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = (canvas as any).getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob: Blob | null =
      "convertToBlob" in canvas
        ? await (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" })
        : await new Promise((r) => (canvas as HTMLCanvasElement).toBlob(r, "image/png"));
    return blob || file;
  } catch {
    return file;
  }
}

/**
 * Reads a batch of pictures, and never throws away what it already read.
 *
 * This used to be a plain loop with one try/finally around the whole thing, so
 * a single unreadable picture — a HEIC, a video picked by mistake, a photo too
 * large for the engine on that phone — aborted the batch and discarded every
 * screenshot already recognised. Selecting a hundred and watching it stop at
 * eighty with nothing to show is indistinguishable from the app being broken,
 * and it costs her the one thing she cannot easily redo: the work of gathering
 * the evidence in the first place.
 *
 * So every picture is now isolated. One failing picture is named and skipped,
 * the engine is rebuilt in case it was left wedged, and the batch carries on.
 * The caller gets the text plus an honest account of what did not work.
 */
export async function ocrImages(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<OcrOutcome> {
  const { createWorker } = await import("tesseract.js");
  let worker = await createWorker("eng");
  const parts: string[] = [];
  const failed: OcrOutcome["failed"] = [];
  let read = 0;

  const restart = async () => {
    try {
      await worker.terminate();
    } catch {
      /* it may already be gone; a fresh one is what matters */
    }
    worker = await createWorker("eng");
  };

  try {
    for (let i = 0; i < files.length; i++) {
      onProgress?.(i + 1, files.length);
      // Let the browser paint the progress and stay responsive; without this a
      // long batch looks frozen and phones offer to close the tab.
      await new Promise((r) => setTimeout(r, 0));
      try {
        const { data } = await worker.recognize(await prepare(files[i]));
        const text = (data.text || "").trim();
        if (text) {
          parts.push(text);
          read++;
        } else {
          failed.push({ name: files[i].name || `picture ${i + 1}`, reason: "no text found in it" });
        }
      } catch (e: any) {
        failed.push({
          name: files[i].name || `picture ${i + 1}`,
          reason: e?.message || "couldn't be read",
        });
        // A failure can leave the engine in a bad state, which would then fail
        // every remaining picture for no reason. Rebuild before continuing.
        await restart();
      }
      if (i > 0 && i % RECYCLE_EVERY === 0) await restart();
    }
  } finally {
    try {
      await worker.terminate();
    } catch {
      /* nothing left to do about it */
    }
  }

  return { text: parts.join("\n\n"), read, failed };
}
