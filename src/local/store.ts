/**
 * The dataset manifest and its storage, mirroring sorty/core/models.py and store.py
 *
 * Field names match the desktop manifest.json exactly, so an exported dataset opens
 * in desktop Sorty and the reverse
 */

import { slugify } from "./ids";
import { join, readText, walkFiles, writeFile } from "./fs";

export type ReviewStatus = "pending" | "valid" | "invalid";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface DatasetItem {
  item_id: string;
  label: string;
  local_path: string;
  source: string;
  source_url: string;
  title: string;
  review_status: ReviewStatus;
  deleted_at: number | null;
  predicted_label: string | null;
  // browser-only, the model's probability for predicted_label. Desktop Sorty drops it on save
  predicted_score: number | null;
  boxes: Box[];
}

export interface Dataset {
  dataset_id: string;
  prompt: string;
  subjects: string[];
  sources: string[];
  items: DatasetItem[];
  lock_splits: boolean;
  lock_review: boolean;
  created_at: number;
  updated_at: number;
}

export const UNKNOWN_SOURCE = "unknown";
export const MANIFEST_DIR = ".sorty";
export const DATASETS_DIR = "datasets";

// top-level dirs treated as train/test splits rather than classes
export const SPLIT_DIRS = new Set([
  "train",
  "test",
  "val",
  "valid",
  "validation",
]);

export const now = () => Date.now() / 1000;

export function datasetRoot(name: string): string {
  return join(DATASETS_DIR, slugify(name));
}

export function metaPath(root: string, file: string): string {
  return join(root, MANIFEST_DIR, file);
}

export function newItem(
  fields: Pick<DatasetItem, "item_id" | "label" | "local_path"> &
    Partial<DatasetItem>,
): DatasetItem {
  return {
    source: UNKNOWN_SOURCE,
    source_url: "",
    title: "",
    review_status: "pending",
    deleted_at: null,
    predicted_label: null,
    predicted_score: null,
    boxes: [],
    ...fields,
  };
}

export function newDataset(id: string, prompt: string): Dataset {
  const t = now();
  return {
    dataset_id: id,
    prompt,
    subjects: [],
    sources: [],
    items: [],
    lock_splits: false,
    lock_review: false,
    created_at: t,
    updated_at: t,
  };
}

export function touch(ds: Dataset): void {
  ds.updated_at = now();
}

export function isBinned(item: DatasetItem): boolean {
  return item.review_status === "invalid" && item.deleted_at !== null;
}

/** Append items not already present by id, returning the ids it added */
export function addItems(ds: Dataset, items: DatasetItem[]): string[] {
  const existing = new Set(ds.items.map((i) => i.item_id));
  const added: string[] = [];
  for (const item of items) {
    if (existing.has(item.item_id)) continue;
    ds.items.push(item);
    existing.add(item.item_id);
    added.push(item.item_id);
  }
  touch(ds);
  return added;
}

export async function hasManifest(root: string): Promise<boolean> {
  return (await readText(metaPath(root, "manifest.json"))) !== null;
}

export async function loadDataset(root: string): Promise<Dataset> {
  const raw = await readText(metaPath(root, "manifest.json"));
  if (raw === null) throw new Error(`No manifest found in ${root}`);
  const parsed = JSON.parse(raw) as Partial<Dataset>;
  const ds: Dataset = {
    ...newDataset(parsed.dataset_id ?? "", parsed.prompt ?? ""),
    ...parsed,
    items: (parsed.items ?? []).map((i) =>
      newItem({
        ...i,
        // desktop Sorty on Windows writes backslash paths
        local_path: i.local_path.replace(/\\/g, "/"),
      }),
    ),
  };
  // fold a pre-slug class list into deduped slugs, as store.py does
  ds.subjects = [...new Set(ds.subjects.map(slugify))];
  return ds;
}

// leading chars a spreadsheet reads as a formula, prefixed with ' to keep them as text
const defang = (v: string) => (/^[=+\-@]/.test(v) ? "'" + v : v);

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function saveDataset(ds: Dataset, root: string): Promise<void> {
  await writeFile(metaPath(root, "manifest.json"), JSON.stringify(ds, null, 2));
  const rows = [["filename", "label", "source"]];
  for (const item of ds.items) {
    rows.push([item.local_path, defang(item.label), defang(item.source)]);
  }
  await writeFile(
    metaPath(root, "labels.csv"),
    rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n",
  );
}

/** Every file path in a dataset, relative to its root, for cheap existence checks */
export async function filesOnDisk(root: string): Promise<Set<string>> {
  return new Set(await walkFiles(root));
}

/**
 * Drop items whose image is missing, returning how many were removed. keep retains
 * items whose file sits elsewhere (the recycle bin)
 */
export async function pruneMissing(
  ds: Dataset,
  root: string,
  keep?: (item: DatasetItem) => boolean,
): Promise<number> {
  const files = await filesOnDisk(root);
  const before = ds.items.length;
  ds.items = ds.items.filter(
    (i) => (keep !== undefined && keep(i)) || files.has(i.local_path),
  );
  const removed = before - ds.items.length;
  if (removed) touch(ds);
  return removed;
}

/**
 * Run fn holding the dataset's lock, so read-modify-write cycles never interleave
 * Web Locks also serialize across tabs, which share the same OPFS
 */
export function withDataset<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return navigator.locks.request(`sorty:${slugify(name)}`, fn);
}
