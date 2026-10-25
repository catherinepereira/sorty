/**
 * MobileCLIP S0 embeddings through transformers.js
 *
 * Image vectors feed the training head, near-duplicate search, and the label check.
 * Text vectors of class names are the zero-shot side of the label check.
 * Both are L2-normalized, so a dot product is cosine similarity.
 * Image vectors are cached under .sorty/emb-<backbone>/ and reused while the image
 * file is older than its cached vector
 */

import type * as HF from "@huggingface/transformers";
import { join, readFile, writeFile } from "./fs";
import { webGpuSupport } from "./gpu";
import { yieldToUi, type Progress } from "./jobs";
import { MANIFEST_DIR, type DatasetItem } from "./store";

export const BACKBONE = "mobileclip_s0";
const MODEL_ID = "Xenova/mobileclip_s0";
export const EMBED_DIM = 512;
const BATCH = 16;

// fp32, the dtype the model's config sets for the vision encoder
export const VISION_ONNX_URL = `https://huggingface.co/${MODEL_ID}/resolve/main/onnx/vision_model.onnx`;

interface Vision {
  RawImage: typeof HF.RawImage;
  processor: HF.Processor;
  model: HF.PreTrainedModel;
}

interface Text {
  tokenizer: HF.PreTrainedTokenizer;
  model: HF.PreTrainedModel;
}

let vision: Promise<Vision> | null = null;
let text: Promise<Text> | null = null;

function onDownload(p: Progress, what: string): HF.ProgressCallback {
  return (info) => {
    if (info.status === "progress_total") {
      p.set(
        `Downloading the ${what} model, ${Math.round(info.progress)}% (cached after the first time)`,
      );
    }
  };
}

// loaded on first use, transformers.js is large and browsing the grid doesn't need it
function loadVision(p: Progress): Promise<Vision> {
  if (!vision) {
    const pending = (async () => {
      const hf = await import("@huggingface/transformers");
      const gpu = await webGpuSupport();
      const [processor, model] = await Promise.all([
        hf.AutoProcessor.from_pretrained(MODEL_ID),
        hf.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
          device: gpu ? "webgpu" : "wasm",
          dtype: "fp32",
          progress_callback: onDownload(p, "image"),
        }),
      ]);
      return { RawImage: hf.RawImage, processor, model };
    })();
    vision = pending;
    // a failed load shouldn't stick, let the next job retry
    pending.catch(() => (vision = null));
  }
  return vision;
}

// runs a handful of class names per check, so wasm and int8 weights are fast enough
function loadText(p: Progress): Promise<Text> {
  if (!text) {
    const pending = (async () => {
      const hf = await import("@huggingface/transformers");
      const [tokenizer, model] = await Promise.all([
        hf.AutoTokenizer.from_pretrained(MODEL_ID),
        hf.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, {
          device: "wasm",
          dtype: "q8",
          progress_callback: onDownload(p, "text"),
        }),
      ]);
      return { tokenizer, model };
    })();
    text = pending;
    pending.catch(() => (text = null));
  }
  return text;
}

function rows(tensor: HF.Tensor, n: number): Float32Array<ArrayBuffer>[] {
  const data = tensor.normalize().data as Float32Array<ArrayBuffer>;
  return Array.from({ length: n }, (_, i) =>
    data.slice(i * EMBED_DIM, (i + 1) * EMBED_DIM),
  );
}

export async function embedTexts(
  texts: string[],
  p: Progress,
): Promise<Float32Array[]> {
  p.set("Loading the text model");
  const { tokenizer, model } = await loadText(p);
  const inputs = tokenizer(texts, { padding: "max_length", truncation: true });
  const { text_embeds } = await model(inputs);
  return rows(text_embeds, texts.length);
}

const cachePath = (root: string, id: string) =>
  join(root, MANIFEST_DIR, `emb-${BACKBONE}`, `${id}.f32`);

/** Vectors keyed by item id, computing only the ones not cached. Unreadable images are left out */
export async function embedItems(
  root: string,
  items: DatasetItem[],
  p: Progress,
): Promise<Map<string, Float32Array>> {
  const out = new Map<string, Float32Array>();
  const todo: { item: DatasetItem; file: File }[] = [];
  for (const item of items) {
    const file = await readFile(join(root, item.local_path));
    if (!file) continue;
    const cached = await readFile(cachePath(root, item.item_id));
    if (cached && cached.lastModified >= file.lastModified) {
      out.set(item.item_id, new Float32Array(await cached.arrayBuffer()));
    } else {
      todo.push({ item, file });
    }
  }

  p.start(items.length, "Embedding images");
  p.advance(`Embedded ${out.size}/${items.length}`, out.size);
  if (!todo.length) return out;

  p.set("Loading the image model");
  const { RawImage, processor, model } = await loadVision(p);
  for (let start = 0; start < todo.length; start += BATCH) {
    const batch = todo.slice(start, start + BATCH);
    const images = await Promise.all(
      batch.map(({ file }) => RawImage.fromBlob(file).catch(() => null)),
    );
    const readable = batch.filter((_, i) => images[i]);
    if (readable.length) {
      const inputs = await processor(images.filter((im) => im !== null));
      const { image_embeds } = await model(inputs);
      const vecs = rows(image_embeds, readable.length);
      for (const [i, { item }] of readable.entries()) {
        out.set(item.item_id, vecs[i]);
        await writeFile(cachePath(root, item.item_id), vecs[i]);
      }
    }
    p.advance(`Embedded ${out.size}/${items.length}`, batch.length);
    await yieldToUi();
  }
  return out;
}
