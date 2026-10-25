/**
 * Dataset stats and per-image file info, mirroring sorty/summary.py and refresh.py
 */

import { join, readFile, walkFiles } from "./fs";
import { makeId } from "./ids";
import { IMAGE_EXTS, dimensions } from "./images";
import {
  MANIFEST_DIR,
  SPLIT_DIRS,
  isBinned,
  newItem,
  pruneMissing,
  touch,
  type Dataset,
} from "./store";
import type { DatasetSummaryStats } from "../types";

export async function summarize(
  ds: Dataset,
  root: string,
): Promise<DatasetSummaryStats> {
  const live = ds.items.filter((i) => !isBinned(i));
  const perClass = new Map(ds.subjects.map((s) => [s, 0]));
  const perSource = new Map<string, number>();
  let bytes = 0;
  for (const item of live) {
    perClass.set(item.label, (perClass.get(item.label) ?? 0) + 1);
    perSource.set(item.source, (perSource.get(item.source) ?? 0) + 1);
    bytes += (await readFile(join(root, item.local_path)))?.size ?? 0;
  }
  const sorted = (m: Map<string, number>) =>
    [...m]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, count]) => ({ name, count }));
  return {
    total: live.length,
    subjects: ds.subjects.length,
    per_class: sorted(perClass),
    per_source: sorted(perSource),
    bytes_total: bytes,
  };
}

export async function fileInfo(root: string, localPath: string) {
  const path = join(root, localPath);
  const file = await readFile(path);
  const dims = file ? await dimensions(path) : null;
  return {
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    bytes: file?.size ?? null,
    // OPFS has no creation time, the last write is the closest stand-in
    ingested: file ? file.lastModified / 1000 : null,
  };
}

/**
 * Add stored images missing from the manifest, drop items whose file is gone
 * A top-level split dir holds class folders one level down
 */
export async function refreshManifest(
  ds: Dataset,
  root: string,
): Promise<{ added: number; pruned: number }> {
  const known = new Set(ds.items.map((i) => i.local_path));
  let added = 0;
  for (const rel of await walkFiles(root)) {
    const parts = rel.split("/");
    if (parts[0] === MANIFEST_DIR || parts.length < 2) continue;
    if (!IMAGE_EXTS.has(rel.slice(rel.lastIndexOf(".")).toLowerCase()))
      continue;
    let label = parts[0];
    if (SPLIT_DIRS.has(parts[0].toLowerCase())) {
      // loose files in a split dir have no class to land in
      if (parts.length < 3) continue;
      label = parts[1];
    }
    if (known.has(rel)) continue;
    ds.items.push(
      newItem({ item_id: await makeId(rel), label, local_path: rel }),
    );
    known.add(rel);
    added += 1;
    if (!ds.subjects.includes(label)) ds.subjects.push(label);
  }
  const pruned = await pruneMissing(ds, root, isBinned);
  if (added || pruned) touch(ds);
  return { added, pruned };
}
