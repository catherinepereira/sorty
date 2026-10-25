/**
 * Delete, rename, and merge whole classes, mirroring sorty/classes.py
 *
 * The desktop app sends removed class folders to the OS recycle bin. A browser has
 * none, so deleting a class removes its folder for good
 */

import { join, mkdirs, remove } from "./fs";
import { slugify } from "./ids";
import { moveItemToLabel } from "./annotate";
import { badRequest } from "./errors";
import { touch, type Dataset, type DatasetItem } from "./store";

function itemsFor(ds: Dataset, className: string): DatasetItem[] {
  const label = slugify(className);
  return ds.items.filter((i) => i.label === label);
}

export async function deleteClass(
  ds: Dataset,
  root: string,
  className: string,
): Promise<number> {
  const label = slugify(className);
  const doomed = new Set(itemsFor(ds, className).map((i) => i.item_id));
  ds.items = ds.items.filter((i) => !doomed.has(i.item_id));
  ds.subjects = ds.subjects.filter((s) => s !== label);
  await remove(join(root, label));
  touch(ds);
  return doomed.size;
}

export async function renameClass(
  ds: Dataset,
  root: string,
  oldName: string,
  newName: string,
): Promise<number> {
  const newLabel = slugify(newName.trim());
  const oldLabel = slugify(oldName);
  if (newLabel === oldLabel) return itemsFor(ds, oldName).length;
  if (ds.subjects.includes(newLabel)) {
    throw badRequest(
      `A class named '${newLabel}' already exists. Merge instead.`,
    );
  }
  await mkdirs(join(root, newLabel));
  let moved = 0;
  for (const item of itemsFor(ds, oldName)) {
    await moveItemToLabel(root, item, newLabel);
    moved += 1;
  }
  ds.subjects = ds.subjects.map((s) => (s === oldLabel ? newLabel : s));
  await remove(join(root, oldLabel));
  touch(ds);
  return moved;
}

export async function mergeClasses(
  ds: Dataset,
  root: string,
  sourceNames: string[],
  targetName: string,
): Promise<number> {
  const target = slugify(targetName);
  if (!ds.subjects.includes(target)) ds.subjects.push(target);
  await mkdirs(join(root, target));

  let moved = 0;
  for (const name of sourceNames) {
    const label = slugify(name);
    if (label === target) continue;
    for (const item of itemsFor(ds, name)) {
      await moveItemToLabel(root, item, target);
      moved += 1;
    }
    ds.subjects = ds.subjects.filter((s) => s !== label);
    await remove(join(root, label));
  }

  // dedupe by id so a merge never leaves two manifest entries pointing at one file
  const kept = new Set<string>();
  ds.items = ds.items.filter((i) => {
    if (kept.has(i.item_id)) return false;
    kept.add(i.item_id);
    return true;
  });
  touch(ds);
  return moved;
}
