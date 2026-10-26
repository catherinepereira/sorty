/**
 * The app's backend, run in the browser. Each method mirrors a route of desktop
 * Sorty's FastAPI service (sorty/api.py) with the same request and response
 * shapes, backed by OPFS storage in src/local/
 */

import type {
  Box,
  DatasetDetail,
  DatasetSummary,
  DatasetSummaryStats,
  Item,
  JobState,
  Status,
} from "./types";
import { ApiError, badRequest, notFound } from "./local/errors";
import { join } from "./local/fs";
import { fileUrl } from "./local/media";
import * as jobs from "./local/jobs";
import * as annotate from "./local/annotate";
import * as classes from "./local/classes";
import * as recyclebin from "./local/recyclebin";
import * as workspace from "./local/workspace";
import { REGISTRY } from "./local/sources";
import { addImages } from "./local/generate";
import { findDuplicateGroups } from "./local/clean";
import { crossval, modelInfo, trainFull } from "./local/classify";
import { checkLabels } from "./local/labelcheck";
import { addUploads, importZip, type Upload } from "./local/importer";
import { fileInfo, refreshManifest, summarize } from "./local/summary";
import { BACKBONE } from "./local/embed";
import {
  assignSplits,
  exportDataset,
  exportModel,
  saveBlob,
} from "./local/exporter";
import { slugify } from "./local/ids";
import {
  datasetRoot,
  filesOnDisk,
  hasManifest,
  isBinned,
  loadDataset,
  saveDataset,
  touch,
  withDataset,
  type Dataset,
  type DatasetItem,
} from "./local/store";

// mirrors report.json as written by training
export interface ModelReport {
  model: string;
  epochs: number;
  lr: number;
  val_split: number;
  n_train: number;
  n_val: number;
  overall_accuracy: number;
  per_class: Record<string, { precision: number; recall: number; f1: number }>;
  trained_at: number;
  // absent on reports from before these fields existed
  confusion?: { labels: string[]; matrix: number[][] };
  valid_only?: boolean;
}

export { ApiError };
export type { Upload };

type ItemDetail = Item & {
  width: number | null;
  height: number | null;
  bytes: number | null;
  ingested: number | null;
};

async function load(name: string): Promise<{ ds: Dataset; root: string }> {
  const root = datasetRoot(name);
  if (!(await hasManifest(root))) throw notFound(`No dataset named '${name}'`);
  return { ds: await loadDataset(root), root };
}

/** Load, change, and save a dataset under its lock */
function edit<T>(
  name: string,
  fn: (ds: Dataset, root: string) => Promise<T> | T,
): Promise<T> {
  return withDataset(name, async () => {
    const { ds, root } = await load(name);
    const result = await fn(ds, root);
    await saveDataset(ds, root);
    return result;
  });
}

async function itemView(item: DatasetItem, root: string): Promise<Item> {
  const binned = isBinned(item);
  const parts = item.local_path.split("/");
  return {
    id: item.item_id,
    label: item.label,
    status: item.review_status,
    url: await fileUrl(
      binned ? recyclebin.binPath(root, item) : join(root, item.local_path),
    ),
    binned,
    source: item.source,
    source_url: item.source_url,
    title: item.title,
    local_path: item.local_path,
    directory: parts.slice(0, -1).join("/") || ".",
    filename: parts[parts.length - 1],
    predicted: item.predicted_label,
    predicted_score: item.predicted_score,
    split: annotate.itemSplit(item.local_path),
    boxes: item.boxes,
  };
}

async function itemDetail(
  item: DatasetItem,
  root: string,
): Promise<ItemDetail> {
  return {
    ...(await itemView(item, root)),
    ...(await fileInfo(root, item.local_path)),
  };
}

function checkReviewLock(ds: Dataset) {
  if (ds.lock_review) throw badRequest("Reviewing is locked for this dataset.");
}

function checkSplitLock(ds: Dataset) {
  if (ds.lock_splits) throw badRequest("Splits are locked for this dataset.");
}

function checkTrain(body: { model: string; epochs: number }) {
  if (body.model !== BACKBONE) {
    throw badRequest(`Unknown model '${body.model}'. Choose ${BACKBONE}.`);
  }
  if (!(body.epochs >= 1 && body.epochs <= 50)) {
    throw badRequest("Epochs must be between 1 and 50.");
  }
}

const DEMO_URL = `${import.meta.env.BASE_URL}demo/pnw-birds.zip`;
const DEMO_SEEDED = "sorty.demoSeeded";

async function importDemo(): Promise<string> {
  const resp = await fetch(DEMO_URL);
  if (!resp.ok) throw notFound("The demo dataset is missing from this build");
  void navigator.storage.persist?.();
  return importZip(new File([await resp.blob()], "pnw-birds.zip"));
}

let seeding: Promise<void> | null = null;

/**
 * Give a first visit the PNW birds demo. Runs once per browser, so deleting the demo
 * keeps it gone, and a workspace that already has datasets is left alone
 */
function seedDemo(): Promise<void> {
  // the lock covers two tabs opening at once, the promise covers StrictMode's double effect
  return (seeding ??= navigator.locks.request("sorty:demo", async () => {
    try {
      if (localStorage.getItem(DEMO_SEEDED)) return;
      if (!(await workspace.listDatasets()).length) await importDemo();
      localStorage.setItem(DEMO_SEEDED, "1");
    } catch (e) {
      console.warn("Could not load the demo dataset", e);
    }
  }));
}

export const api = {
  // no contact email here, a browser can't set the User-Agent sources would read it from
  sources: () => Object.keys(REGISTRY),

  listDatasets: async (): Promise<DatasetSummary[]> => {
    await seedDemo();
    return workspace.listDatasets();
  },
  loadDemo: async () => ({ name: await importDemo() }),
  createDataset: async (name: string) => {
    // ask the browser not to evict datasets under storage pressure
    void navigator.storage.persist?.();
    return { name: await workspace.createDataset(name) };
  },
  importZip: async (file: File) => {
    void navigator.storage.persist?.();
    return { name: await importZip(file) };
  },
  getDataset: async (name: string): Promise<DatasetDetail> => {
    const { ds, root } = await load(name);
    const live = ds.items.filter((i) => !isBinned(i));
    const stats = { total: live.length, pending: 0, valid: 0, invalid: 0 };
    for (const i of live) stats[i.review_status] += 1;
    return {
      name: ds.dataset_id,
      prompt: ds.prompt,
      subjects: ds.subjects,
      sources: ds.sources,
      stats,
      locks: { splits: ds.lock_splits, review: ds.lock_review },
      items: await Promise.all(live.map((i) => itemView(i, root))),
    };
  },
  renameDataset: async (name: string, newName: string) => ({
    name: await workspace.renameDataset(name, newName),
  }),
  deleteDataset: async (name: string) => {
    await workspace.deleteDataset(name);
    return { deleted: true };
  },
  getBin: async (name: string): Promise<Item[]> => {
    const { ds, root } = await load(name);
    return Promise.all(recyclebin.listBin(ds).map((i) => itemView(i, root)));
  },
  getSummary: async (name: string): Promise<DatasetSummaryStats> => {
    const { ds, root } = await load(name);
    return summarize(ds, root);
  },
  deleteClass: (name: string, className: string) =>
    edit(name, async (ds, root) => ({
      removed: await classes.deleteClass(ds, root, className),
    })),
  renameClass: (name: string, oldName: string, newName: string) =>
    edit(name, async (ds, root) => ({
      moved: await classes.renameClass(ds, root, oldName, newName),
    })),
  mergeClasses: (name: string, sources: string[], target: string) =>
    edit(name, async (ds, root) => ({
      moved: await classes.mergeClasses(ds, root, sources, target),
    })),
  getItem: async (name: string, id: string): Promise<ItemDetail> => {
    const { ds, root } = await load(name);
    return itemDetail(annotate.findItem(ds, id), root);
  },

  setLabel: async (name: string, id: string, subject: string) => {
    const { item, root } = await edit(name, async (ds, root) => {
      await annotate.setLabel(ds, root, id, subject);
      return { item: annotate.findItem(ds, id), root };
    });
    return { item: await itemView(item, root) };
  },
  duplicateItem: async (name: string, id: string) => {
    const { copy, root } = await edit(name, async (ds, root) => ({
      copy: await annotate.duplicateItem(ds, root, id),
      root,
    }));
    return { item: await itemView(copy, root) };
  },
  cropItem: async (
    name: string,
    id: string,
    box: { left: number; top: number; width: number; height: number },
  ) => {
    const { item, root } = await edit(name, async (ds, root) => {
      await annotate.cropItem(
        ds,
        root,
        id,
        box.left,
        box.top,
        box.width,
        box.height,
      );
      return { item: annotate.findItem(ds, id), root };
    });
    return { item: await itemDetail(item, root) };
  },
  flipItem: async (name: string, id: string, axis: "x" | "y") => {
    const { item, root } = await edit(name, async (ds, root) => {
      await annotate.flipItem(ds, root, id, axis);
      return { item: annotate.findItem(ds, id), root };
    });
    return { item: await itemDetail(item, root) };
  },
  setBoxes: async (
    name: string,
    id: string,
    boxes: Box[],
    width: number,
    height: number,
  ) => {
    const { item, root } = await edit(name, (ds, root) => {
      annotate.setBoxes(ds, id, boxes, width, height);
      return { item: annotate.findItem(ds, id), root };
    });
    return { item: await itemView(item, root) };
  },
  flipItems: (name: string, ids: string[], axis: "x" | "y") =>
    edit(name, async (ds, root) => ({
      flipped: await annotate.flipItems(ds, root, ids, axis),
    })),
  setStatus: async (name: string, id: string, status: Status) => {
    const { item, root } = await edit(name, (ds, root) => {
      checkReviewLock(ds);
      annotate.setStatus(ds, id, status);
      return { item: annotate.findItem(ds, id), root };
    });
    return { item: await itemView(item, root) };
  },
  moveToClass: (name: string, ids: string[], subject: string) =>
    edit(name, async (ds, root) => ({
      moved: await annotate.moveToClass(ds, root, ids, subject),
    })),
  setStatusMany: (name: string, ids: string[], status: Status) =>
    edit(name, (ds) => {
      checkReviewLock(ds);
      return { changed: annotate.setStatusMany(ds, ids, status) };
    }),

  del: (name: string, ids: string[]) =>
    edit(name, async (ds, root) => ({
      binned: await recyclebin.deleteToBin(ds, root, ids),
    })),
  restore: (name: string, ids: string[]) =>
    edit(name, async (ds, root) => ({
      restored: await recyclebin.restore(ds, root, ids),
    })),
  emptyBin: (name: string) =>
    edit(name, async (ds, root) => ({
      removed: await recyclebin.emptyBin(ds, root),
    })),

  generate: async (
    name: string,
    body: {
      subjects?: string[];
      sources: string[];
      count: number;
      target_total: boolean;
    },
  ) => {
    await load(name);
    return {
      job_id: jobs.submit((p) =>
        addImages(
          name,
          body.subjects ?? [],
          body.sources,
          body.count,
          body.target_total,
          p,
        ),
      ),
    };
  },
  upload: async (name: string, uploads: Upload[], target: string | null) => {
    await load(name);
    return {
      job_id: jobs.submit((p) => addUploads(name, uploads, target, p)),
    };
  },
  checkLabels: async (name: string) => {
    await load(name);
    return { job_id: jobs.submit((p) => checkLabels(name, p)) };
  },
  dedup: async (name: string) => {
    const { ds, root } = await load(name);
    return {
      job_id: jobs.submit(async (p) => {
        const live = ds.items.filter((i) => !isBinned(i));
        // groups keep each duplicate set on its own row, the flat list drives the filter
        const groups = (await findDuplicateGroups(root, live, p)).map((g) =>
          g.map((i) => i.item_id),
        );
        const flagged = groups.flat();
        p.start(live.length, `Flagged ${flagged.length}`);
        p.advance(undefined, live.length);
        return { flagged, groups };
      }),
    };
  },
  crossval: async (
    name: string,
    body: { model: string; folds: number; epochs: number; valid_only: boolean },
  ) => {
    await load(name);
    checkTrain(body);
    if (!(body.folds >= 2 && body.folds <= 10)) {
      throw badRequest("Folds must be between 2 and 10.");
    }
    return {
      job_id: jobs.submit((p) =>
        crossval(name, body.folds, body.epochs, body.valid_only, p),
      ),
    };
  },
  train: async (
    name: string,
    body: { model: string; epochs: number; valid_only: boolean },
  ) => {
    await load(name);
    checkTrain(body);
    return {
      job_id: jobs.submit((p) =>
        trainFull(name, body.epochs, body.valid_only, p),
      ),
    };
  },
  modelInfo: async (name: string) => {
    const { root } = await load(name);
    return modelInfo(root);
  },

  createSplits: (
    name: string,
    body: { test_percent: number; valid_percent: number; seed: number },
  ) =>
    edit(name, async (ds, root) => {
      checkSplitLock(ds);
      if (!(body.test_percent >= 1 && body.test_percent <= 90)) {
        throw badRequest("Test share must be between 1 and 90 percent.");
      }
      if (
        !(body.valid_percent >= 0 && body.valid_percent <= 50) ||
        body.test_percent + body.valid_percent > 90
      ) {
        throw badRequest(
          "Valid share must be 0 to 50 percent, and leave room for train.",
        );
      }
      const files = await filesOnDisk(root);
      const live = ds.items.filter(
        (i) => !isBinned(i) && files.has(i.local_path),
      );
      const assigned = assignSplits(
        live,
        body.test_percent,
        body.valid_percent,
        body.seed,
      );
      const counts = { train: 0, test: 0, valid: 0 };
      for (const split of ["train", "test", "valid"] as const) {
        const ids = [...assigned]
          .filter(([, s]) => s === split)
          .map(([id]) => id);
        await annotate.moveItemsToSplit(ds, root, ids, split);
        counts[split] = ids.length;
      }
      return counts;
    }),
  moveSplit: (name: string, ids: string[], split: string) =>
    edit(name, async (ds, root) => {
      checkSplitLock(ds);
      return {
        moved: await annotate.moveItemsToSplit(
          ds,
          root,
          ids,
          split === "none" ? null : split,
        ),
      };
    }),
  setLocks: (name: string, locks: { splits?: boolean; review?: boolean }) =>
    edit(name, (ds) => {
      if (locks.splits !== undefined) ds.lock_splits = locks.splits;
      if (locks.review !== undefined) ds.lock_review = locks.review;
      touch(ds);
      return { splits: ds.lock_splits, review: ds.lock_review };
    }),

  setSubjects: (name: string, subjects: string[]) =>
    edit(name, (ds) => {
      ds.subjects = [...new Set(subjects.map(slugify))];
      touch(ds);
      return { subjects: ds.subjects };
    }),
  deleteSource: (name: string, source: string) =>
    edit(name, async (ds, root) => ({
      binned: await recyclebin.deleteBySource(ds, root, source),
    })),
  refresh: (name: string) =>
    edit(name, (ds, root) => refreshManifest(ds, root)),

  exportDataset: async (
    name: string,
    opts: { test_percent?: number; seed: number },
  ) => {
    const { ds, root } = await load(name);
    const testPercent = opts.test_percent ?? null;
    if (testPercent !== null && !(testPercent >= 1 && testPercent <= 90)) {
      throw badRequest("Test share must be between 1 and 90 percent.");
    }
    saveBlob(
      await exportDataset(ds, root, testPercent, opts.seed),
      `${name}.zip`,
    );
  },
  exportModel: async (name: string) => {
    const { root } = await load(name);
    const blob = await exportModel(root);
    if (!blob) throw notFound("No trained model to export");
    saveBlob(blob, `${name}-model.zip`);
  },

  job: async (id: string): Promise<JobState> => jobs.view(id),
};
