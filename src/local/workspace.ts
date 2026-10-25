/**
 * The workspace: named datasets under datasets/ in OPFS, mirroring sorty/workspace.py
 * Deleting a dataset is permanent, a browser has no OS recycle bin to send it to
 */

import { copyDir, join, listDir, remove } from "./fs";
import { FALLBACK_SLUG, slugify } from "./ids";
import { fileUrl } from "./media";
import { badRequest, notFound } from "./errors";
import {
  DATASETS_DIR,
  datasetRoot,
  hasManifest,
  isBinned,
  loadDataset,
  newDataset,
  saveDataset,
  filesOnDisk,
} from "./store";
import type { DatasetSummary } from "../types";

export async function listDatasets(): Promise<DatasetSummary[]> {
  const out: DatasetSummary[] = [];
  for (const entry of await listDir(DATASETS_DIR)) {
    if (entry.kind !== "directory") continue;
    const root = join(DATASETS_DIR, entry.name);
    if (!(await hasManifest(root))) continue;
    const ds = await loadDataset(root);
    const files = await filesOnDisk(root);
    const cover = ds.items.find((i) => !isBinned(i) && files.has(i.local_path));
    const count = (s: string) =>
      ds.items.filter((i) => i.review_status === s).length;
    out.push({
      name: entry.name,
      total: ds.items.length,
      valid: count("valid"),
      pending: count("pending"),
      subjects: ds.subjects.length,
      thumbnail: cover ? await fileUrl(join(root, cover.local_path)) : "",
    });
  }
  return out;
}

function checkName(name: string): string {
  const slug = slugify(name);
  // a name with no slug-able characters falls back to the placeholder, refuse it
  // unless "unlabeled" is what was typed
  if (slug === FALLBACK_SLUG && name.trim().toLowerCase() !== FALLBACK_SLUG) {
    throw badRequest("Dataset name has no usable characters.");
  }
  return slug;
}

export async function createDataset(
  name: string,
  prompt = "",
): Promise<string> {
  const slug = checkName(name);
  const root = datasetRoot(slug);
  if (await hasManifest(root)) {
    throw badRequest(`A dataset named '${slug}' already exists.`);
  }
  await saveDataset(newDataset(slug, prompt), root);
  return slug;
}

export async function renameDataset(
  oldName: string,
  newName: string,
): Promise<string> {
  const oldRoot = datasetRoot(oldName);
  if (!(await hasManifest(oldRoot)))
    throw badRequest(`No dataset named '${oldName}'.`);
  const slug = checkName(newName);
  if (slug === slugify(oldName)) return slug;
  const newRoot = datasetRoot(slug);
  if (await hasManifest(newRoot)) {
    throw badRequest(`A dataset named '${slug}' already exists.`);
  }
  await copyDir(oldRoot, newRoot);
  const ds = await loadDataset(newRoot);
  ds.dataset_id = slug;
  await saveDataset(ds, newRoot);
  await remove(oldRoot);
  return slug;
}

export async function deleteDataset(name: string): Promise<void> {
  const root = datasetRoot(name);
  if (!(await hasManifest(root))) throw notFound(`No dataset named '${name}'.`);
  await remove(root);
}
