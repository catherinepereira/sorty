/**
 * Train a classifier and cross-validate it to find likely mislabeled images
 * Mirrors sorty/core/classify.py, with one substitution: desktop Sorty fine-tunes
 * the whole backbone on a GPU, the browser trains a softmax head on frozen
 * MobileCLIP features. Reports, runs.json, and predicted labels keep the desktop
 * shapes so the training panel reads them unchanged
 */

import { readText, writeFile } from "./fs";
import { BACKBONE, EMBED_DIM, embedItems } from "./embed";
import { yieldToUi, type Progress } from "./jobs";
import {
  datasetRoot,
  filesOnDisk,
  isBinned,
  loadDataset,
  metaPath,
  saveDataset,
  touch,
  withDataset,
  type Dataset,
  type DatasetItem,
} from "./store";
import type { ModelReport } from "../api";

const LR = 1e-3;
const WEIGHT_DECAY = 1e-4;
const BATCH = 32;
// a small dataset gives few batches per epoch, so training runs at least this many steps
const MIN_STEPS = 300;
const VAL_SPLIT = 0.2;

interface Head {
  backbone: string;
  labels: string[];
  mean: number[];
  std: number[];
  // row-major [class][feature]
  W: number[];
  b: number[];
}

function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

async function candidates(
  ds: Dataset,
  root: string,
  validOnly: boolean,
): Promise<DatasetItem[]> {
  const files = await filesOnDisk(root);
  return ds.items.filter(
    (i) =>
      !isBinned(i) &&
      files.has(i.local_path) &&
      (!validOnly || i.review_status === "valid"),
  );
}

interface Sample {
  item: DatasetItem;
  x: Float32Array;
}

async function samplesFor(
  root: string,
  items: DatasetItem[],
  p: Progress,
): Promise<Sample[]> {
  const feats = await embedItems(root, items, p);
  return items
    .filter((i) => feats.has(i.item_id))
    .map((item) => ({ item, x: feats.get(item.item_id)! }));
}

/** Epochs to run: the requested count, raised until it reaches MIN_STEPS */
function passesFor(n: number, epochs: number): number {
  return Math.max(epochs, Math.ceil(MIN_STEPS / Math.ceil(n / BATCH)));
}

/** Softmax regression on z-scored features, trained with Adam */
async function trainHead(
  samples: Sample[],
  labels: string[],
  epochs: number,
  onEpoch?: (epoch: number, passes: number) => void,
): Promise<Head> {
  const D = EMBED_DIM;
  const C = labels.length;
  const N = samples.length;
  const index = new Map(labels.map((l, i) => [l, i]));

  const mean = new Float64Array(D);
  const sq = new Float64Array(D);
  for (const { x } of samples) {
    for (let d = 0; d < D; d++) {
      mean[d] += x[d];
      sq[d] += x[d] * x[d];
    }
  }
  const std = new Float64Array(D);
  for (let d = 0; d < D; d++) {
    mean[d] /= N;
    std[d] = Math.sqrt(Math.max(sq[d] / N - mean[d] * mean[d], 0)) || 1;
  }
  const X = samples.map(({ x }) => {
    const z = new Float32Array(D);
    for (let d = 0; d < D; d++) z[d] = (x[d] - mean[d]) / std[d];
    return z;
  });
  const y = samples.map(({ item }) => index.get(item.label)!);

  const W = new Float32Array(C * D);
  const b = new Float32Array(C);
  const gW = new Float32Array(C * D);
  const gb = new Float32Array(C);
  const mW = new Float32Array(C * D);
  const vW = new Float32Array(C * D);
  const mb = new Float32Array(C);
  const vb = new Float32Array(C);
  const probs = new Float64Array(C);
  const [beta1, beta2, eps] = [0.9, 0.999, 1e-8];
  let t = 0;

  const order = Array.from({ length: N }, (_, i) => i);
  const passes = passesFor(N, epochs);
  for (let epoch = 1; epoch <= passes; epoch++) {
    shuffle(order);
    for (let start = 0; start < N; start += BATCH) {
      const batch = order.slice(start, start + BATCH);
      gW.fill(0);
      gb.fill(0);
      for (const n of batch) {
        const x = X[n];
        let max = -Infinity;
        for (let c = 0; c < C; c++) {
          let s = b[c];
          const row = c * D;
          for (let d = 0; d < D; d++) s += W[row + d] * x[d];
          probs[c] = s;
          if (s > max) max = s;
        }
        let total = 0;
        for (let c = 0; c < C; c++) {
          probs[c] = Math.exp(probs[c] - max);
          total += probs[c];
        }
        for (let c = 0; c < C; c++) {
          const g = probs[c] / total - (c === y[n] ? 1 : 0);
          gb[c] += g;
          const row = c * D;
          for (let d = 0; d < D; d++) gW[row + d] += g * x[d];
        }
      }
      t += 1;
      const scale = 1 / batch.length;
      const lrT =
        (LR * Math.sqrt(1 - Math.pow(beta2, t))) / (1 - Math.pow(beta1, t));
      for (let k = 0; k < W.length; k++) {
        const g = gW[k] * scale + WEIGHT_DECAY * W[k];
        mW[k] = beta1 * mW[k] + (1 - beta1) * g;
        vW[k] = beta2 * vW[k] + (1 - beta2) * g * g;
        W[k] -= (lrT * mW[k]) / (Math.sqrt(vW[k]) + eps);
      }
      for (let c = 0; c < C; c++) {
        const g = gb[c] * scale;
        mb[c] = beta1 * mb[c] + (1 - beta1) * g;
        vb[c] = beta2 * vb[c] + (1 - beta2) * g * g;
        b[c] -= (lrT * mb[c]) / (Math.sqrt(vb[c]) + eps);
      }
      if (t % 10 === 0) await yieldToUi();
    }
    onEpoch?.(epoch, passes);
  }
  return {
    backbone: BACKBONE,
    labels,
    mean: [...mean],
    std: [...std],
    W: [...W],
    b: [...b],
  };
}

export function softmax(logits: Float64Array): Float64Array {
  const max = Math.max(...logits);
  const out = logits.map((s) => Math.exp(s - max));
  const total = out.reduce((a, b) => a + b, 0);
  return out.map((v) => v / total);
}

/** The most likely class index and its probability */
export function argmax(probs: Float64Array): { index: number; score: number } {
  let index = 0;
  for (let c = 1; c < probs.length; c++) if (probs[c] > probs[index]) index = c;
  return { index, score: probs[index] };
}

function predict(
  head: Head,
  x: Float32Array,
): { index: number; score: number } {
  const D = EMBED_DIM;
  const logits = new Float64Array(head.labels.length);
  for (let c = 0; c < head.labels.length; c++) {
    let s = head.b[c];
    const row = c * D;
    for (let d = 0; d < D; d++) {
      s += head.W[row + d] * ((x[d] - head.mean[d]) / head.std[d]);
    }
    logits[c] = s;
  }
  return argmax(softmax(logits));
}

export type Prediction = { label: string; score: number };

/** Write predictions onto the manifest, clearing them on items without one */
export function savePredictions(
  name: string,
  predicted: Map<string, Prediction>,
): Promise<{ predicted: number; mismatched: number }> {
  const root = datasetRoot(name);
  return withDataset(name, async () => {
    const current = await loadDataset(root);
    for (const item of current.items) {
      const pred = predicted.get(item.item_id);
      item.predicted_label = pred?.label ?? null;
      item.predicted_score = pred ? round(pred.score, 4) : null;
    }
    touch(current);
    await saveDataset(current, root);
    const mismatched = current.items.filter(
      (i) => i.predicted_label !== null && i.predicted_label !== i.label,
    ).length;
    return { predicted: predicted.size, mismatched };
  });
}

const round = (n: number, places: number) =>
  Math.round(n * 10 ** places) / 10 ** places;

function buildReport(
  epochs: number,
  nTrain: number,
  preds: number[],
  targets: number[],
  labels: string[],
  validOnly: boolean,
): ModelReport {
  const counts = new Map<string, { tp: number; fp: number; fn: number }>();
  const bump = (cls: string, key: "tp" | "fp" | "fn") => {
    const c = counts.get(cls) ?? { tp: 0, fp: 0, fn: 0 };
    c[key] += 1;
    counts.set(cls, c);
  };
  const matrix = labels.map(() => labels.map(() => 0));
  preds.forEach((pred, i) => {
    const target = targets[i];
    matrix[target][pred] += 1;
    if (pred === target) bump(labels[target], "tp");
    else {
      bump(labels[pred], "fp");
      bump(labels[target], "fn");
    }
  });
  const perClass: ModelReport["per_class"] = {};
  for (const [cls, { tp, fp, fn }] of counts) {
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 =
      precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[cls] = {
      precision: round(precision, 3),
      recall: round(recall, 3),
      f1: round(f1, 3),
    };
  }
  const correct = preds.filter((p, i) => p === targets[i]).length;
  return {
    model: BACKBONE,
    epochs,
    lr: LR,
    val_split: VAL_SPLIT,
    n_train: nTrain,
    n_val: targets.length,
    overall_accuracy: round(correct / targets.length, 4),
    per_class: perClass,
    trained_at: Date.now() / 1000,
    confusion: { labels, matrix },
    valid_only: validOnly,
  };
}

/** One training run over the dataset, saving the head and report for export */
export async function trainFull(
  name: string,
  epochs: number,
  validOnly: boolean,
  p: Progress,
): Promise<ModelReport> {
  const root = datasetRoot(name);
  const ds = await loadDataset(root);
  const samples = shuffle(
    await samplesFor(root, await candidates(ds, root, validOnly), p),
  );
  if (!samples.length) throw new Error("No images found.");
  const labels = [...new Set(samples.map((s) => s.item.label))].sort();
  const nVal = Math.max(1, Math.floor(samples.length * VAL_SPLIT));
  const val = samples.slice(0, nVal);
  const train = samples.slice(nVal);
  if (!train.length)
    throw new Error(`Not enough images to split (${samples.length} total).`);

  const passes = passesFor(train.length, epochs);
  p.start(passes, "Training");
  const head = await trainHead(train, labels, epochs, (e) =>
    p.advance(`Epoch ${e}/${passes}`),
  );
  const index = new Map(labels.map((l, i) => [l, i]));
  const preds = val.map((s) => predict(head, s.x).index);
  const targets = val.map((s) => index.get(s.item.label)!);
  const report = buildReport(
    passes,
    train.length,
    preds,
    targets,
    labels,
    validOnly,
  );

  await writeFile(metaPath(root, "model.json"), JSON.stringify(head));
  await writeFile(
    metaPath(root, "labels.json"),
    JSON.stringify(labels, null, 2),
  );
  await writeFile(
    metaPath(root, "report.json"),
    JSON.stringify(report, null, 2),
  );
  const runs = await loadRuns(root);
  runs.push(report);
  await writeFile(metaPath(root, "runs.json"), JSON.stringify(runs, null, 2));
  return report;
}

export async function loadRuns(root: string): Promise<ModelReport[]> {
  const raw = await readText(metaPath(root, "runs.json"));
  return raw ? JSON.parse(raw) : [];
}

function foldIndices(n: number, k: number): number[][] {
  const folds: number[][] = [];
  let start = 0;
  for (let f = 0; f < k; f++) {
    const size = Math.floor(n / k) + (f < n % k ? 1 : 0);
    folds.push(Array.from({ length: size }, (_, i) => start + i));
    start += size;
  }
  return folds;
}

/**
 * Out-of-fold prediction, so every image is predicted by a head that never trained
 * on it. Images whose class is absent from their fold's training split are skipped
 */
export async function crossval(
  name: string,
  folds: number,
  epochs: number,
  validOnly: boolean,
  p: Progress,
): Promise<{ predicted: number; mismatched: number }> {
  const root = datasetRoot(name);
  const ds = await loadDataset(root);
  const samples = shuffle(
    await samplesFor(root, await candidates(ds, root, validOnly), p),
  );
  if (samples.length < folds) {
    throw new Error(
      `Need at least ${folds} images for ${folds}-fold, found ${samples.length}.`,
    );
  }
  const labels = [...new Set(samples.map((s) => s.item.label))].sort();
  const predicted = new Map<string, Prediction>();
  p.start(folds, "Cross-validating");
  for (const [f, fold] of foldIndices(samples.length, folds).entries()) {
    const inFold = new Set(fold);
    const train = samples.filter((_, i) => !inFold.has(i));
    const trainClasses = new Set(train.map((s) => s.item.label));
    const head = await trainHead(train, labels, epochs);
    for (const i of fold) {
      const s = samples[i];
      if (!trainClasses.has(s.item.label)) continue;
      const { index, score } = predict(head, s.x);
      predicted.set(s.item.item_id, { label: labels[index], score });
    }
    p.advance(`Fold ${f + 1}/${folds}`);
  }
  return savePredictions(name, predicted);
}

export async function modelInfo(root: string) {
  const raw = await readText(metaPath(root, "report.json"));
  const runs = (await loadRuns(root)).sort(
    (a, b) => (b.trained_at ?? 0) - (a.trained_at ?? 0),
  );
  return {
    trained: (await readText(metaPath(root, "model.json"))) !== null,
    report: raw ? (JSON.parse(raw) as ModelReport) : null,
    runs,
  };
}
