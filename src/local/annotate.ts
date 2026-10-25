/**
 * Per-image edits: status, relabel, split moves, duplicate, crop, flip, and boxes
 * Mirrors sorty/annotate.py. Relabeling moves the file into the new label's folder
 * so storage and manifest keep the <label>/<label>_<id>.<ext> layout. Callers save
 */

import { basename, copyFile, join, moveFile, split } from "./fs";
import { slugify, makeId } from "./ids";
import { cropFile, flipFile } from "./images";
import { forget } from "./media";
import { badRequest, notFound } from "./errors";
import {
  SPLIT_DIRS,
  touch,
  type Box,
  type Dataset,
  type DatasetItem,
  type ReviewStatus,
} from "./store";

export function findItem(ds: Dataset, id: string): DatasetItem {
  const item = ds.items.find((i) => i.item_id === id);
  if (!item) throw notFound("No such item");
  return item;
}

function suffix(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

/** The item's train/test dir in a <split>/<class>/ layout, else "" */
function splitPrefix(localPath: string): string {
  const parts = split(localPath);
  return parts.length >= 3 && SPLIT_DIRS.has(parts[0].toLowerCase())
    ? parts[0]
    : "";
}

/** The item's split, with val/, valid/, and validation/ all read as "valid" */
export function itemSplit(localPath: string): string | null {
  const prefix = splitPrefix(localPath).toLowerCase();
  if (!prefix) return null;
  return prefix === "val" || prefix === "validation" ? "valid" : prefix;
}

async function move(root: string, from: string, to: string) {
  forget(join(root, from));
  await moveFile(join(root, from), join(root, to));
}

export async function moveItemsToSplit(
  ds: Dataset,
  root: string,
  ids: string[],
  splitName: string | null,
): Promise<number> {
  if (splitName !== null && !["train", "test", "valid"].includes(splitName)) {
    throw badRequest(
      `Unknown split '${splitName}'. Choose train, test, or valid.`,
    );
  }
  const wanted = new Set(ids);
  let moved = 0;
  for (const item of ds.items) {
    if (!wanted.has(item.item_id) || itemSplit(item.local_path) === splitName)
      continue;
    const rel = join(splitName ?? "", item.label, basename(item.local_path));
    await move(root, item.local_path, rel);
    item.local_path = rel;
    moved += 1;
  }
  if (moved) touch(ds);
  return moved;
}

/** Point an item at a class, moving its file and rewriting label and path together */
export async function moveItemToLabel(
  root: string,
  item: DatasetItem,
  label: string,
): Promise<void> {
  const rel = join(
    splitPrefix(item.local_path),
    label,
    `${label}_${item.item_id}${suffix(item.local_path)}`,
  );
  await move(root, item.local_path, rel);
  item.label = label;
  item.local_path = rel;
}

/** Copy an item and its file under a new id, e.g. to crop two regions of one photo */
export async function duplicateItem(
  ds: Dataset,
  root: string,
  id: string,
): Promise<DatasetItem> {
  const source = findItem(ds, id);
  const existing = new Set(ds.items.map((i) => i.item_id));
  let n = 1;
  let newId = await makeId(`${source.item_id}:copy${n}`);
  while (existing.has(newId)) {
    n += 1;
    newId = await makeId(`${source.item_id}:copy${n}`);
  }
  const rel = join(
    splitPrefix(source.local_path),
    source.label,
    `${source.label}_${newId}${suffix(source.local_path)}`,
  );
  if (!(await copyFile(join(root, source.local_path), join(root, rel)))) {
    throw badRequest("The image file is missing.");
  }
  const copy: DatasetItem = {
    ...structuredClone(source),
    item_id: newId,
    local_path: rel,
    deleted_at: null,
  };
  ds.items.splice(ds.items.indexOf(source) + 1, 0, copy);
  touch(ds);
  return copy;
}

/** Replace an item's boxes, clamped to the image and dropping any clamped to nothing */
export function setBoxes(
  ds: Dataset,
  id: string,
  boxes: Box[],
  width: number,
  height: number,
): void {
  const item = findItem(ds, id);
  const kept: Box[] = [];
  for (const box of boxes) {
    if (!box.label) throw badRequest("Every box needs a class label.");
    const x = Math.max(0, Math.min(box.x, width));
    const y = Math.max(0, Math.min(box.y, height));
    const w = Math.min(box.w, width - x);
    const h = Math.min(box.h, height - y);
    if (w >= 1 && h >= 1) kept.push({ x, y, w, h, label: box.label });
  }
  item.boxes = kept;
  touch(ds);
}

function cropBoxes(
  boxes: Box[],
  left: number,
  top: number,
  width: number,
  height: number,
): Box[] {
  const kept: Box[] = [];
  for (const box of boxes) {
    const x0 = Math.max(box.x, left);
    const y0 = Math.max(box.y, top);
    const x1 = Math.min(box.x + box.w, left + width);
    const y1 = Math.min(box.y + box.h, top + height);
    if (x1 - x0 >= 1 && y1 - y0 >= 1) {
      kept.push({
        x: x0 - left,
        y: y0 - top,
        w: x1 - x0,
        h: y1 - y0,
        label: box.label,
      });
    }
  }
  return kept;
}

function flipBoxes(
  boxes: Box[],
  axis: "x" | "y",
  width: number,
  height: number,
): Box[] {
  return boxes.map((b) =>
    axis === "y"
      ? { ...b, x: width - b.x - b.w }
      : { ...b, y: height - b.y - b.h },
  );
}

export async function cropItem(
  ds: Dataset,
  root: string,
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<void> {
  const item = findItem(ds, id);
  if (width < 1 || height < 1)
    throw badRequest("Crop box must be at least 1x1 pixels.");
  try {
    await cropFile(join(root, item.local_path), left, top, width, height);
  } catch (e) {
    throw badRequest(e instanceof Error ? e.message : String(e));
  }
  item.boxes = cropBoxes(item.boxes, left, top, width, height);
  touch(ds);
}

function checkAxis(axis: string): asserts axis is "x" | "y" {
  if (axis !== "x" && axis !== "y")
    throw badRequest(`Unknown axis '${axis}'. Choose x or y.`);
}

export async function flipItem(
  ds: Dataset,
  root: string,
  id: string,
  axis: string,
): Promise<void> {
  checkAxis(axis);
  const item = findItem(ds, id);
  let size;
  try {
    size = await flipFile(join(root, item.local_path), axis);
  } catch (e) {
    throw badRequest(e instanceof Error ? e.message : String(e));
  }
  item.boxes = flipBoxes(item.boxes, axis, size.width, size.height);
  touch(ds);
}

/** Flip many items, skipping missing ids and files so a stale selection still runs */
export async function flipItems(
  ds: Dataset,
  root: string,
  ids: string[],
  axis: string,
): Promise<number> {
  checkAxis(axis);
  const wanted = new Set(ids);
  let flipped = 0;
  for (const item of ds.items) {
    if (!wanted.has(item.item_id)) continue;
    try {
      const size = await flipFile(join(root, item.local_path), axis);
      item.boxes = flipBoxes(item.boxes, axis, size.width, size.height);
      flipped += 1;
    } catch {
      // missing or unreadable file, skip it like the desktop app does
    }
  }
  if (flipped) touch(ds);
  return flipped;
}

export function setStatus(ds: Dataset, id: string, status: ReviewStatus): void {
  findItem(ds, id).review_status = status;
  touch(ds);
}

export function setStatusMany(
  ds: Dataset,
  ids: string[],
  status: ReviewStatus,
): number {
  const wanted = new Set(ids);
  let changed = 0;
  for (const item of ds.items) {
    if (wanted.has(item.item_id)) {
      item.review_status = status;
      changed += 1;
    }
  }
  if (changed) touch(ds);
  return changed;
}

export async function setLabel(
  ds: Dataset,
  root: string,
  id: string,
  newClass: string,
): Promise<void> {
  const item = findItem(ds, id);
  const label = slugify(newClass.trim());
  if (label !== item.label) {
    await moveItemToLabel(root, item, label);
    if (!ds.subjects.includes(label)) ds.subjects.push(label);
  }
  touch(ds);
}

export async function moveToClass(
  ds: Dataset,
  root: string,
  ids: string[],
  subject: string,
): Promise<number> {
  const label = slugify(subject.trim());
  if (!ds.subjects.includes(label)) ds.subjects.push(label);
  const wanted = new Set(ids);
  let moved = 0;
  for (const item of ds.items) {
    if (!wanted.has(item.item_id)) continue;
    if (label !== item.label) await moveItemToLabel(root, item, label);
    moved += 1;
  }
  if (moved) touch(ds);
  return moved;
}
