/**
 * Zip exports of a dataset and of its trained model, mirroring the desktop
 * /export and /model/export routes. Images are stored uncompressed since they
 * already are
 */

import { Zip, ZipPassThrough } from "fflate";
import { basename, join, readFile } from "./fs";
import { VISION_ONNX_URL } from "./embed";
import {
  MANIFEST_DIR,
  isBinned,
  filesOnDisk,
  metaPath,
  type Dataset,
  type DatasetItem,
} from "./store";

// mulberry32, so the same seed always gives the same split
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Assign every item "train" | "test" | "valid", per class. A class with at least
 * two images keeps one in train and one in test, a single-image class stays in train
 */
export function assignSplits(
  items: DatasetItem[],
  testPercent: number,
  validPercent: number,
  seed: number,
): Map<string, string> {
  const byLabel = new Map<string, DatasetItem[]>();
  for (const item of items) {
    byLabel.set(item.label, [...(byLabel.get(item.label) ?? []), item]);
  }
  const rand = seededRandom(seed);
  const assigned = new Map<string, string>();
  for (const label of [...byLabel.keys()].sort()) {
    const group = byLabel
      .get(label)!
      .sort((a, b) => (a.item_id < b.item_id ? -1 : 1));
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    const n = group.length;
    const nTest =
      n >= 2
        ? Math.min(Math.max(Math.round((n * testPercent) / 100), 1), n - 1)
        : 0;
    const nValid = Math.max(
      Math.min(Math.round((n * validPercent) / 100), n - nTest - 1),
      0,
    );
    group.forEach((item, pos) =>
      assigned.set(
        item.item_id,
        pos < nTest ? "test" : pos < nTest + nValid ? "valid" : "train",
      ),
    );
  }
  return assigned;
}

/** A valid/ or val/ split dir exports as validation/, the conventional name */
function exportName(localPath: string): string {
  const parts = localPath.split("/");
  if (parts.length >= 3 && ["val", "valid"].includes(parts[0].toLowerCase())) {
    parts[0] = "validation";
  }
  return parts.join("/");
}

async function buildZip(entries: [string, Blob | Uint8Array][]): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const zip = new Zip((err, data, final) => {
      if (err) return reject(err);
      chunks.push(data);
      if (final)
        resolve(new Blob(chunks as BlobPart[], { type: "application/zip" }));
    });
    (async () => {
      for (const [name, data] of entries) {
        const entry = new ZipPassThrough(name);
        zip.add(entry);
        const bytes =
          data instanceof Blob
            ? new Uint8Array(await data.arrayBuffer())
            : data;
        entry.push(bytes, true);
      }
      zip.end();
    })().catch(reject);
  });
}

export async function exportDataset(
  ds: Dataset,
  root: string,
  testPercent: number | null,
  seed: number,
): Promise<Blob> {
  const files = await filesOnDisk(root);
  const live = ds.items.filter((i) => !isBinned(i) && files.has(i.local_path));
  const testIds =
    testPercent === null
      ? null
      : new Set(
          [...assignSplits(live, testPercent, 0, seed)]
            .filter(([, s]) => s === "test")
            .map(([id]) => id),
        );

  const entries: [string, Blob | Uint8Array][] = [];
  for (const item of live) {
    const file = await readFile(join(root, item.local_path));
    if (!file) continue;
    const name =
      testIds === null
        ? exportName(item.local_path)
        : `${testIds.has(item.item_id) ? "test" : "train"}/${item.label}/${basename(item.local_path)}`;
    entries.push([name, file]);
  }
  if (testIds === null) {
    // rewrite manifest paths to the zip layout so a re-import lines up
    const copy: Dataset = structuredClone(ds);
    for (const item of copy.items) {
      if (!isBinned(item)) item.local_path = exportName(item.local_path);
    }
    entries.push([
      `${MANIFEST_DIR}/manifest.json`,
      new TextEncoder().encode(JSON.stringify(copy, null, 2)),
    ]);
  }
  return buildZip(entries);
}

/**
 * The head, its labels and report, and the image encoder it runs on. The encoder
 * takes 256x256 RGB in 0..1 (shortest side resized to 256, center crop), and its
 * output is L2-normalized before the head's z-scoring
 */
export async function exportModel(root: string): Promise<Blob | null> {
  const entries: [string, Blob | Uint8Array][] = [];
  for (const name of ["model.json", "labels.json", "report.json"]) {
    const file = await readFile(metaPath(root, name));
    if (file) entries.push([name, file]);
  }
  if (!entries.length) return null;
  const backbone = await fetch(VISION_ONNX_URL);
  if (backbone.ok)
    entries.push(["mobileclip_s0_vision.onnx", await backbone.blob()]);
  return buildZip(entries);
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
