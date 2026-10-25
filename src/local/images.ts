/**
 * Decode, measure, and edit images with the browser's codecs, replacing PIL
 *
 * createImageBitmap applies EXIF orientation by default, so coordinates here match
 * what the browser shows, the same reason annotate.py runs exif_transpose first
 */

import { readFile, writeFile } from "./fs";
import { forget } from "./media";

// ~50MP covers any photo, refuse bigger so a hostile file can't exhaust memory
export const MAX_PIXELS = 50_000_000;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export function extensionFor(url: string): string {
  const path = url.split("?")[0].replace(/\/+$/, "");
  const dot = path.lastIndexOf(".");
  const ext = dot > path.lastIndexOf("/") ? path.slice(dot).toLowerCase() : "";
  return IMAGE_EXTS.has(ext) ? ext : ".jpg";
}

export async function decode(blob: Blob): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(blob);
  if (bmp.width * bmp.height > MAX_PIXELS) {
    bmp.close();
    throw new Error("Image exceeds the pixel cap");
  }
  return bmp;
}

export async function dimensions(
  path: string,
): Promise<{ width: number; height: number } | null> {
  const file = await readFile(path);
  if (!file) return null;
  try {
    const bmp = await decode(file);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch {
    return null;
  }
}

function mimeFor(path: string): string {
  const ext = extensionFor(path);
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  // canvases can't encode GIF, PNG keeps it lossless and browsers sniff the bytes
  if (ext === ".gif") return "image/png";
  return "image/jpeg";
}

async function rewrite(
  path: string,
  width: number,
  height: number,
  draw: (ctx: OffscreenCanvasRenderingContext2D) => void,
): Promise<void> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const blob = await canvas.convertToBlob({
    type: mimeFor(path),
    quality: 0.92,
  });
  await writeFile(path, blob);
  forget(path);
}

/** Crop in place. Throws when the box falls outside the image */
export async function cropFile(
  path: string,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<void> {
  const file = await readFile(path);
  if (!file) throw new Error("The image file is missing.");
  const bmp = await decode(file);
  try {
    if (
      left < 0 ||
      top < 0 ||
      left + width > bmp.width ||
      top + height > bmp.height
    ) {
      throw new RangeError("Crop box is outside the image.");
    }
    await rewrite(path, width, height, (ctx) =>
      ctx.drawImage(bmp, left, top, width, height, 0, 0, width, height),
    );
  } finally {
    bmp.close();
  }
}

/**
 * Flip in place, returning the size it had for mirroring boxes. Axis "y" mirrors
 * left-right, "x" flips top-bottom, matching annotate.py
 */
export async function flipFile(
  path: string,
  axis: "x" | "y",
): Promise<{ width: number; height: number }> {
  const file = await readFile(path);
  if (!file) throw new Error("The image file is missing.");
  const bmp = await decode(file);
  const size = { width: bmp.width, height: bmp.height };
  try {
    await rewrite(path, size.width, size.height, (ctx) => {
      if (axis === "y") {
        ctx.translate(size.width, 0);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(0, size.height);
        ctx.scale(1, -1);
      }
      ctx.drawImage(bmp, 0, 0);
    });
  } finally {
    bmp.close();
  }
  return size;
}
