/**
 * The generate pipeline: subjects to downloaded, manifested images. Mirrors
 * sorty/core/pipeline.py
 *
 * Unlike the desktop version, the manifest is only touched at the end, under the
 * dataset lock, so edits made in the grid while a fetch runs are kept
 */

import { join, mkdirs, writeFile } from "./fs";
import { makeId, slugify } from "./ids";
import { MAX_IMAGE_BYTES, decode, extensionFor } from "./images";
import { fetchAll, type SourceRecord } from "./sources";
import { yieldToUi, type Progress } from "./jobs";
import {
  addItems,
  datasetRoot,
  isBinned,
  loadDataset,
  newItem,
  pruneMissing,
  saveDataset,
  withDataset,
  type DatasetItem,
} from "./store";

// how many extra pages to scan past the first before giving up on a subject
const MAX_ADD_PAGES = 4;
// cushion added to each fetch window so dedup against known URLs still leaves enough
const PAGE_CUSHION = 10;
// parallel downloads, a courtesy cap toward the source hosts
const DOWNLOAD_CONCURRENCY = 4;

export interface GenerateResult {
  records: number;
  added: number;
  saved: number;
  failed: number;
  dropped: number;
}

interface Fresh {
  item: DatasetItem;
  download: string;
}

async function recordsToItems(
  subject: string,
  records: SourceRecord[],
): Promise<Fresh[]> {
  const label = slugify(subject);
  const out: Fresh[] = [];
  for (const rec of records) {
    const id = await makeId(rec.url);
    out.push({
      download: rec.download_url,
      item: newItem({
        item_id: id,
        label,
        source: rec.source,
        source_url: rec.url,
        title: rec.title,
        local_path: `${label}/${label}_${id}${extensionFor(rec.url)}`,
      }),
    });
  }
  return out;
}

/**
 * Collect up to targets[subject] new items per subject, paging until full or dry
 * Each subject advances its own offset by the records it consumed
 */
async function gatherFresh(
  targets: Map<string, number>,
  sources: string[],
  knownUrls: Set<string>,
): Promise<Fresh[]> {
  const seen = new Set(knownUrls);
  const found = new Map<string, Fresh[]>();
  const offsets = new Map<string, number>();
  for (const s of targets.keys()) {
    found.set(s, []);
    offsets.set(s, 0);
  }
  let hungry = [...targets].filter(([, want]) => want > 0).map(([s]) => s);

  for (let page = 0; page <= MAX_ADD_PAGES && hungry.length; page++) {
    const pages = await Promise.all(
      hungry.map((s) =>
        fetchAll(
          s,
          sources,
          targets.get(s)! - found.get(s)!.length + PAGE_CUSHION,
          offsets.get(s)!,
        ),
      ),
    );
    const stillHungry: string[] = [];
    for (const [i, subject] of hungry.entries()) {
      const want = targets.get(subject)!;
      const pageItems = await recordsToItems(subject, pages[i].flat());
      offsets.set(subject, offsets.get(subject)! + pageItems.length);
      if (!pageItems.length) continue; // the sources ran dry for this subject
      const list = found.get(subject)!;
      for (const fresh of pageItems) {
        if (list.length >= want) break;
        if (seen.has(fresh.item.source_url)) continue;
        seen.add(fresh.item.source_url);
        list.push(fresh);
      }
      if (list.length < want) stillHungry.push(subject);
    }
    hungry = stillHungry;
  }
  return [...targets.keys()].flatMap((s) => found.get(s)!);
}

/** Download one image into place, refusing non-images and oversized bodies */
async function download(url: string, path: string): Promise<boolean> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return false;
    const length = Number(resp.headers.get("content-length") ?? 0);
    if (length > MAX_IMAGE_BYTES) return false;
    const blob = await resp.blob();
    if (blob.size > MAX_IMAGE_BYTES) return false;
    // a decode check, so an HTML error page saved as .jpg never enters the dataset
    (await decode(blob)).close();
    await writeFile(path, blob);
    return true;
  } catch {
    return false;
  }
}

export async function addImages(
  name: string,
  subjects: string[],
  sources: string[],
  count: number,
  targetTotal: boolean,
  p: Progress,
): Promise<GenerateResult> {
  const root = datasetRoot(name);
  const ds = await loadDataset(root);
  const targetsList = subjects.length ? subjects : ds.subjects;
  const useSources = sources.length ? sources : ds.sources;

  const live = (subject: string) => {
    const label = slugify(subject);
    return ds.items.filter((i) => i.deleted_at === null && i.label === label)
      .length;
  };
  const targets = new Map(
    targetsList.map((s) => [
      s,
      targetTotal ? Math.max(0, count - live(s)) : count,
    ]),
  );

  // binned items keep their URL here so a rejected image is never re-suggested
  const knownUrls = new Set(ds.items.map((i) => i.source_url));
  p.set("Searching sources for more images");
  const fresh = await gatherFresh(targets, useSources, knownUrls);

  const records = fresh.length;
  p.start(records, "Downloading new images");
  const saved: DatasetItem[] = [];
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < fresh.length) {
      const { item, download: url } = fresh[next++];
      if (await download(url, join(root, item.local_path))) saved.push(item);
      else failed += 1;
      const note = failed ? ` (${failed} failed to download)` : "";
      p.advance(`Saved ${saved.length}/${records}${note}`);
      await yieldToUi();
    }
  };
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));

  // keep the gathered order, workers finish out of order
  const order = new Map(fresh.map((f, i) => [f.item.item_id, i]));
  saved.sort((a, b) => order.get(a.item_id)! - order.get(b.item_id)!);

  const dropped = await withDataset(name, async () => {
    const current = await loadDataset(root);
    for (const s of targetsList) {
      const label = slugify(s);
      if (!current.subjects.includes(label)) current.subjects.push(label);
      await mkdirs(join(root, label));
    }
    for (const s of useSources) {
      if (!current.sources.includes(s)) current.sources.push(s);
    }
    addItems(current, saved);
    const n = await pruneMissing(current, root, isBinned);
    await saveDataset(current, root);
    return n;
  });

  return {
    records,
    added: saved.length + failed,
    saved: saved.length,
    failed,
    dropped,
  };
}
