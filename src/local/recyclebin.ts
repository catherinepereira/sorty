/**
 * A restorable recycle bin over a dataset, mirroring sorty/recyclebin.py
 *
 * Deleting moves the file to .sorty/recyclebin/<local_path> and flags the item, so
 * nothing is destroyed until the bin is emptied
 */

import { join, moveFile, remove } from "./fs";
import { forget } from "./media";
import {
  MANIFEST_DIR,
  isBinned,
  now,
  touch,
  type Dataset,
  type DatasetItem,
} from "./store";

export function binPath(root: string, item: DatasetItem): string {
  return join(root, MANIFEST_DIR, "recyclebin", item.local_path);
}

export function listBin(ds: Dataset): DatasetItem[] {
  return ds.items.filter(isBinned);
}

export async function deleteToBin(
  ds: Dataset,
  root: string,
  ids: string[],
): Promise<number> {
  const wanted = new Set(ids);
  let moved = 0;
  for (const item of ds.items) {
    if (!wanted.has(item.item_id) || isBinned(item)) continue;
    const src = join(root, item.local_path);
    forget(src);
    await moveFile(src, binPath(root, item));
    item.review_status = "invalid";
    item.deleted_at = now();
    moved += 1;
  }
  if (moved) touch(ds);
  return moved;
}

export async function restore(
  ds: Dataset,
  root: string,
  ids: string[],
): Promise<number> {
  const wanted = new Set(ids);
  let restored = 0;
  for (const item of ds.items) {
    if (!wanted.has(item.item_id) || !isBinned(item)) continue;
    forget(binPath(root, item));
    await moveFile(binPath(root, item), join(root, item.local_path));
    item.review_status = "pending";
    item.deleted_at = null;
    restored += 1;
  }
  if (restored) touch(ds);
  return restored;
}

export function deleteBySource(
  ds: Dataset,
  root: string,
  source: string,
): Promise<number> {
  const ids = ds.items
    .filter((i) => !isBinned(i) && i.source === source)
    .map((i) => i.item_id);
  return deleteToBin(ds, root, ids);
}

export async function emptyBin(ds: Dataset, root: string): Promise<number> {
  const binned = listBin(ds);
  for (const item of binned) {
    forget(binPath(root, item));
    await remove(binPath(root, item));
  }
  const ids = new Set(binned.map((i) => i.item_id));
  ds.items = ds.items.filter((i) => !ids.has(i.item_id));
  if (binned.length) touch(ds);
  return binned.length;
}
