/**
 * Zero-shot label check: score every image against "a photo of a <class>" for each
 * class and predict the best match. Needs no training, so it works right after a fetch
 */

import { prettyClass } from "../classname";
import { argmax, savePredictions, softmax, type Prediction } from "./classify";
import { embedItems, embedTexts } from "./embed";
import type { Progress } from "./jobs";
import { datasetRoot, isBinned, loadDataset } from "./store";

// CLIP's learned temperature, the scale the model card's zero-shot example uses
const LOGIT_SCALE = 100;

export async function checkLabels(
  name: string,
  p: Progress,
): Promise<{ predicted: number; mismatched: number }> {
  const root = datasetRoot(name);
  const ds = await loadDataset(root);
  const items = ds.items.filter((i) => !isBinned(i));
  const labels = [...new Set([...ds.subjects, ...items.map((i) => i.label)])];
  if (labels.length < 2) throw new Error("Add at least two classes first.");

  const classVecs = await embedTexts(
    labels.map((l) => `a photo of a ${prettyClass(l)}.`),
    p,
  );
  const feats = await embedItems(root, items, p);
  const predicted = new Map<string, Prediction>();
  for (const [id, x] of feats) {
    const logits = new Float64Array(labels.length);
    classVecs.forEach((t, c) => {
      let s = 0;
      for (let d = 0; d < t.length; d++) s += t[d] * x[d];
      logits[c] = LOGIT_SCALE * s;
    });
    const { index, score } = argmax(softmax(logits));
    predicted.set(id, { label: labels[index], score });
  }
  return savePredictions(name, predicted);
}
