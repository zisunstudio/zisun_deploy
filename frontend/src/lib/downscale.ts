"use client";

/**
 * Shrink a photograph in the browser before it is uploaded.
 *
 * The founder photographs on a phone and the files arrive at 8-11 MB each -
 * 62 MB for eight pictures. Nothing needs that. The storefront never renders
 * wider than 1200 CSS pixels, so a 2400px master is already twice what the
 * largest screen asks for, and next/image derives every smaller size from it.
 *
 * Three things get better at once: she stops uploading 8 MB over mobile data,
 * storage stops growing 8 MB at a time, and - the one customers feel - the
 * image optimizer no longer has to download and decode an 8 MB JPEG the first
 * time each width is requested, which is what made a cold variant take
 * seconds to appear.
 *
 * Quality is deliberately generous (0.9 at 2400px): this is the master copy
 * of a fashion photograph, and the customer-facing compression happens later
 * in next/image. Shrinking the *pixels* is what saves the bytes here, not
 * crushing the quality.
 */
export const MAX_EDGE = 2400;
const QUALITY = 0.9;

/** Files this is worth doing to. Video and SVG pass through untouched. */
const RESIZABLE = ["image/jpeg", "image/png", "image/webp"];

export interface Downscaled {
  file: File | Blob;
  contentType: string;
  before: number;
  after: number;
  resized: boolean;
}

export async function downscaleImage(file: File): Promise<Downscaled> {
  const untouched: Downscaled = { file, contentType: file.type, before: file.size, after: file.size, resized: false };
  if (!RESIZABLE.includes(file.type) || typeof createImageBitmap !== "function") return untouched;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_EDGE) {
      bitmap.close?.();
      return untouched;
    }
    const scale = MAX_EDGE / longest;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return untouched; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    // PNG is kept as PNG only when it may carry transparency; a photograph
    // saved as PNG becomes JPEG, which is where the largest saving is.
    const out = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, out, QUALITY));
    if (!blob || blob.size >= file.size) return untouched;   // never make it bigger

    return { file: blob, contentType: out, before: file.size, after: blob.size, resized: true };
  } catch {
    // An unreadable or exotic image uploads as it is. Never block her work
    // over an optimisation.
    return untouched;
  }
}

export const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
