/**
 * Turn a dataset description into image-search class names, two ways, neither of which
 * sends anything through a Sorty server: a small model running in this browser, or a
 * prompt the visitor copies into their own assistant.
 * Same prompt as desktop Sorty's resolver (sorty/core/resolver.py)
 */

import { ApiError } from "./errors";
import { webGpuSupport } from "./gpu";
import { prettyClass } from "../classname";

export type Method = "browser" | "copy";

// Gemma 3 1B lists real species and objects where Qwen3 0.6B and Qwen2.5 0.5B made
// them up, and its weights ship as external data, which loads where the single-file
// Qwen3 1.7B ran out of memory. The size is the q4f16 download used on WebGPU
export const BROWSER_MODEL = {
  id: "onnx-community/gemma-3-1b-it-ONNX",
  label: "Gemma 3 1B",
  size: "760 MB",
};

const PREFS_KEY = "sorty.resolve";

export function getMethod(): Method {
  try {
    const { method } = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return method === "copy" ? "copy" : "browser";
  } catch {
    return "browser";
  }
}

export function setMethod(method: Method) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ method }));
  } catch {
    // storage blocked, the choice lasts only for this visit
  }
}

const MAX_PROMPT_CHARS = 2000;
const MAX_COUNT = 100;

const SYSTEM = `You are a dataset subject extractor. Read a dataset description and return a
JSON array of subject names that image search engines can find lots of photos for.

Rules:
- Return ONLY a JSON array of strings, no commentary or markdown
- Use the common name people would type into an image search, not a scientific or
  taxonomic one: "American Robin" not "Turdus migratorius", "Golden Retriever" not
  "Canis lupus familiaris"
- Make each name specific enough to be one class, but no more formal than a search
  needs: "American Robin" over both "robin" and "Turdus migratorius"
- Remove duplicates. Keep the ordering logical (alphabetical or by theme)`;

const SMALL_SYSTEM =
  "You write lists for image datasets. Reply with only a JSON array of strings, no explanations.";

function userMessage(prompt: string, count?: number, exclude: string[] = []) {
  const text = prompt.trim();
  if (!text) throw new ApiError(400, "Describe the dataset first.");
  if (text.length > MAX_PROMPT_CHARS) {
    throw new ApiError(400, "That description is too long.");
  }
  let user = text;
  const n = count && count > 0 ? Math.min(count, MAX_COUNT) : undefined;
  if (n) user += `\nReturn about ${n} subjects.`;
  if (exclude.length) {
    // display names, a model shown slugs ("blue-jay") echoes slugs back
    const names = exclude.map((s) => (s.includes(" ") ? s : prettyClass(s)));
    user += `\nDo not include any of these, they are already chosen: ${names.join(", ")}.`;
  }
  return user;
}

// compare names ignoring case, spaces, and punctuation, so "bluejay" matches "blue-jay"
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The whole prompt as one block of text, for pasting into any chat assistant */
export function copyablePrompt(
  prompt: string,
  count?: number,
  exclude?: string[],
) {
  return `${SYSTEM}\n\nDataset description:\n${userMessage(prompt, count, exclude)}`;
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Names from a plain-text list: bullet or numbered lines when there are any, else a
 * single comma-separated line. Prose lines ("**Habitat:** forests") are rejected
 */
function listLines(body: string): string[] {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const bulleted = lines.filter((l) => BULLET.test(l));
  const raw =
    bulleted.length > 0
      ? bulleted.map((l) => l.replace(BULLET, ""))
      : lines.length === 1
        ? lines[0].split(",")
        : lines;
  return raw
    .map((n) => n.replace(/^["'*]+|["'*.]+$/g, "").trim())
    .filter((n) => !n.includes(":") && n.split(/\s+/).length <= 6);
}

/**
 * Pull class names out of a model's reply: a JSON array, a {"subjects": [...]} object,
 * or failing both, a plain-text list
 */
export function parseSubjects(
  reply: string,
  exclude: string[] = [],
  count?: number,
): string[] {
  const body = reply
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```(?:json)?/g, "")
    .trim();
  let names: unknown[] | null = null;
  // the first list only, a small model sometimes keeps writing more lists after it
  const start = body.indexOf("[");
  const end = body.indexOf("]", start);
  if (start >= 0 && end > start) {
    const inner = body.slice(start, end + 1);
    try {
      const parsed = JSON.parse(inner);
      if (Array.isArray(parsed)) names = parsed;
    } catch {
      // a bracketed list without quotes, as small models write it
      names = listLines(inner.slice(1, -1).replace(/\n/g, ","));
    }
  }
  names ??= listLines(body);

  const seen = new Set(exclude.map(nameKey));
  const out: string[] = [];
  for (const raw of names) {
    const name = typeof raw === "string" ? raw.trim() : "";
    const key = nameKey(name);
    if (!key || name.length > 80 || seen.has(key)) continue;
    seen.add(key);
    // slugs back to display names, the class list shows titles
    out.push(/^[a-z0-9]+(-[a-z0-9]+)+$/.test(name) ? prettyClass(name) : name);
  }
  return count && count > 0 ? out.slice(0, count) : out;
}

export type LoadProgress = { message: string; fraction: number | null };

type Generator = (
  messages: { role: string; content: string }[],
  options: { max_new_tokens: number; do_sample: boolean },
) => Promise<{ generated_text: { role: string; content: string }[] }[]>;

let loaded: Promise<Generator> | null = null;

function loadGenerator(
  onProgress: (p: LoadProgress) => void,
): Promise<Generator> {
  if (!loaded) {
    const pending = (async () => {
      onProgress({ message: "Loading the model runtime", fraction: null });
      // loaded on first use, the runtime is large and most visits never need it
      const { pipeline } = await import("@huggingface/transformers");
      const gpu = await webGpuSupport();
      // q4f16 needs WebGPU with f16 shaders, q4 runs everywhere else
      const generator = await pipeline("text-generation", BROWSER_MODEL.id, {
        device: gpu ? "webgpu" : "wasm",
        dtype: gpu === "f16" ? "q4f16" : "q4",
        progress_callback: (info) => {
          if (info.status === "progress_total") {
            onProgress({
              message: "Downloading the model (cached after the first time)",
              fraction: info.total ? info.loaded / info.total : null,
            });
          }
        },
      });
      return generator as unknown as Generator;
    })();
    loaded = pending;
    // a failed load shouldn't stick, let the next click retry
    pending.catch(() => (loaded = null));
  }
  return loaded;
}

export async function resolveInBrowser(
  prompt: string,
  count: number | undefined,
  exclude: string[],
  onProgress: (p: LoadProgress) => void,
): Promise<string[]> {
  // validates the description the same way Copy prompt does
  userMessage(prompt, count, exclude);
  const n = count && count > 0 ? Math.min(count, MAX_COUNT) : 8;
  let user = `Give ${n} specific examples of: ${prompt.trim()}.`;
  if (exclude.length) {
    const names = exclude.map((s) => (s.includes(" ") ? s : prettyClass(s)));
    user += ` Skip these: ${names.join(", ")}.`;
  }
  user += " Reply with only a JSON array of short common names.";
  let generator: Generator;
  try {
    generator = await loadGenerator(onProgress);
  } catch (e) {
    console.error(e);
    throw new ApiError(
      503,
      "Could not load the in-browser model. Try Copy prompt instead.",
    );
  }
  onProgress({ message: "Generating", fraction: null });
  // a small model gets a short request with no example names. It copies any names it
  // sees in the prompt, so the full SYSTEM text (and a tried few-shot exchange) leaked
  // "Golden Retriever" and "American Robin" into unrelated lists
  const output = await generator(
    [
      { role: "system", content: SMALL_SYSTEM },
      { role: "user", content: user },
    ],
    { max_new_tokens: 256, do_sample: false },
  );
  const reply = output[0]?.generated_text.at(-1)?.content ?? "";
  const subjects = parseSubjects(reply, exclude, count);
  if (!subjects.length) {
    throw new ApiError(
      502,
      "The model's reply had no class names. Try rewording the description.",
    );
  }
  return subjects;
}
