/**
 * Near-duplicate detection, exact copies included
 * Two signals, since each misses what the other catches: a difference hash survives
 * resizing and recompression, embedding similarity survives light crops.
 * Desktop Sorty's find_duplicate_groups hashes pixels and only finds exact copies
 */

import { join, readFile } from "./fs";
import { embedItems } from "./embed";
import { yieldToUi, type Progress } from "./jobs";
import type { DatasetItem } from "./store";

// Calibrated on 160 iNaturalist birds. Resized and recompressed copies (down to 100 px,
// JPEG quality 40) differ by at most 10 hash bits and distinct photos by at least 13.
// A 90% crop keeps MobileCLIP similarity at 0.97 or more, distinct photos stay under it
export const MAX_HASH_DISTANCE = 10;
export const MIN_SIMILARITY = 0.95;

/** 64-bit difference hash: one bit per left-to-right brightness step on a 9x8 thumbnail */
async function dHash(file: File): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(file, {
      resizeWidth: 9,
      resizeHeight: 8,
      resizeQuality: "medium",
    });
    const ctx = new OffscreenCanvas(9, 8).getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const px = ctx.getImageData(0, 0, 9, 8).data;
    const gray = (x: number, y: number) => {
      const k = (y * 9 + x) * 4;
      return px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114;
    };
    const bits = new Uint8Array(64);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++)
        bits[y * 8 + x] = gray(x, y) > gray(x + 1, y) ? 1 : 0;
    }
    return bits;
  } catch {
    return null;
  }
}

function hamming(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let k = 0; k < 64; k++) if (a[k] !== b[k]) n++;
  return n;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let d = 0; d < a.length; d++) s += a[d] * b[d];
  return s;
}

/** Groups of 2+ near-identical images, across classes, in item order */
export async function findDuplicateGroups(
  root: string,
  items: DatasetItem[],
  p: Progress,
): Promise<DatasetItem[][]> {
  const feats = await embedItems(root, items, p);
  const live = items.filter((i) => feats.has(i.item_id));
  const vecs = live.map((i) => feats.get(i.item_id)!);

  p.start(live.length, "Hashing images");
  const hashes: (Uint8Array | null)[] = [];
  for (const item of live) {
    const file = await readFile(join(root, item.local_path));
    hashes.push(file ? await dHash(file) : null);
    p.advance();
    await yieldToUi();
  }

  // union-find over indices into live
  const parent = live.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const same = (i: number, j: number) => {
    const [a, b] = [hashes[i], hashes[j]];
    if (a && b && hamming(a, b) <= MAX_HASH_DISTANCE) return true;
    return dot(vecs[i], vecs[j]) >= MIN_SIMILARITY;
  };

  p.start(live.length, "Comparing images");
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      if (same(i, j)) parent[find(j)] = find(i);
    }
    p.advance();
    if (i % 50 === 0) await yieldToUi();
  }

  const groups = new Map<number, DatasetItem[]>();
  live.forEach((item, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), item]);
  });
  return [...groups.values()].filter((g) => g.length >= 2);
}
