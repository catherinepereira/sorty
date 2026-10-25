/**
 * Bring your own images: files and folders into an existing dataset, and zip archives
 * as a new dataset. A zip can be a Sorty export (desktop or browser) or any
 * class-per-folder layout, optionally inside train/test/valid split folders
 */

import { unzip, type Unzipped } from "fflate";
import { basename, join, remove, writeFile } from "./fs";
import { makeId, slugify } from "./ids";
import { IMAGE_EXTS, MAX_IMAGE_BYTES, decode } from "./images";
import { yieldToUi, type Progress } from "./jobs";
import { refreshManifest } from "./summary";
import { createDataset } from "./workspace";
import {
  MANIFEST_DIR,
  SPLIT_DIRS,
  addItems,
  datasetRoot,
  hasManifest,
  isBinned,
  loadDataset,
  newItem,
  saveDataset,
  withDataset,
  type DatasetItem,
} from "./store";

export const UPLOAD_SOURCE = "upload";

/** A picked or dropped file, with its path relative to the picked folder ("robin/a.jpg") */
export interface Upload {
  path: string;
  file: File;
}

const isImageName = (name: string) =>
  IMAGE_EXTS.has(name.slice(name.lastIndexOf(".")).toLowerCase());

async function isImage(blob: Blob): Promise<boolean> {
  if (blob.size > MAX_IMAGE_BYTES) return false;
  try {
    (await decode(blob)).close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Add files to a dataset, into target or, when target is null, into the class named
 * by each file's folder. A file already in the dataset under the same class and
 * name is skipped
 */
export async function addUploads(
  name: string,
  uploads: Upload[],
  target: string | null,
  p: Progress,
): Promise<{ added: number; skipped: number; failed: number }> {
  const root = datasetRoot(name);
  const known = new Set(
    (await loadDataset(root)).items.map((i) => i.local_path),
  );
  const fresh: DatasetItem[] = [];
  let skipped = 0;
  let failed = 0;

  p.start(uploads.length, "Adding images");
  for (const { path, file } of uploads) {
    const dirs = path.split("/").slice(0, -1);
    const folder = dirs[dirs.length - 1];
    const label = target ?? (folder ? slugify(folder) : null);
    const localPath = label ? `${label}/${basename(path)}` : "";
    if (!label || !isImageName(path) || known.has(localPath)) {
      skipped += 1;
    } else if (await isImage(file)) {
      await writeFile(join(root, localPath), file);
      known.add(localPath);
      fresh.push(
        newItem({
          item_id: await makeId(localPath),
          label,
          local_path: localPath,
          source: UPLOAD_SOURCE,
          title: file.name,
        }),
      );
    } else {
      failed += 1;
    }
    p.advance(`Added ${fresh.length}/${uploads.length}`);
    await yieldToUi();
  }

  await withDataset(name, async () => {
    const current = await loadDataset(root);
    for (const item of fresh) {
      if (!current.subjects.includes(item.label))
        current.subjects.push(item.label);
    }
    addItems(current, fresh);
    await saveDataset(current, root);
  });
  return { added: fresh.length, skipped, failed };
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) =>
    unzip(
      data,
      {
        filter: (f) =>
          !f.name.endsWith("/") &&
          !f.name.startsWith("__MACOSX/") &&
          (isImageName(f.name) ||
            f.name.endsWith(`${MANIFEST_DIR}/manifest.json`)),
      },
      (err, out) => (err ? reject(err) : resolve(out)),
    ),
  );
}

/**
 * Archive paths relative to the dataset root. A single wrapping folder
 * ("birds/robin/a.jpg") is dropped, and without a manifest each class folder is
 * slugified the way fetched classes are
 */
function datasetPaths(names: string[]): Map<string, string> {
  const tops = new Set(names.map((n) => n.split("/")[0]));
  const [top] = tops;
  const wrapped =
    tops.size === 1 &&
    top !== MANIFEST_DIR &&
    !SPLIT_DIRS.has(top.toLowerCase()) &&
    names.every((n) => n.split("/").length >= 3);
  const stripped = names.map((n) =>
    wrapped ? n.split("/").slice(1).join("/") : n,
  );
  const hasManifest = stripped.includes(`${MANIFEST_DIR}/manifest.json`);
  return new Map(
    names.map((n, i) => {
      const parts = stripped[i].split("/");
      if (!hasManifest && parts.length >= 2) {
        const cls = SPLIT_DIRS.has(parts[0].toLowerCase()) ? 1 : 0;
        if (cls < parts.length - 1) parts[cls] = slugify(parts[cls]);
      }
      return [n, parts.join("/")];
    }),
  );
}

async function freeName(base: string): Promise<string> {
  const slug = slugify(base);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? slug : `${slug}-${n}`;
    if (!(await hasManifest(datasetRoot(candidate)))) return candidate;
  }
}

/** Unpack a zip into a new dataset named after the file, returning its name */
export async function importZip(file: File): Promise<string> {
  const entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()));
  const names = Object.keys(entries);
  if (!names.some(isImageName))
    throw new Error("That zip has no images in it.");

  const name = await createDataset(
    await freeName(file.name.replace(/\.zip$/i, "")),
  );
  const root = datasetRoot(name);
  try {
    const paths = datasetPaths(names);
    for (const [entry, rel] of paths) {
      await writeFile(join(root, rel), entries[entry]);
    }
    const ds = await loadDataset(root);
    ds.dataset_id = name;
    // exports leave the recycle bin out, so binned entries have no file to point at
    ds.items = ds.items.filter((i) => !isBinned(i));
    await refreshManifest(ds, root);
    await saveDataset(ds, root);
  } catch (e) {
    await remove(root);
    throw e;
  }
  return name;
}
