# Sorty Web

Browser build of [Sorty](../sorty), the image classification dataset tool. The desktop
FastAPI backend is reimplemented in TypeScript and runs in the page, with datasets
stored in the browser's origin private file system (OPFS). It's a static site with no
server code.

The React frontend started from Sorty's and has its own utilitarian layout: one toolbar,
class chips, filter dropdowns, and a grid or table view with inline relabeling.
`src/api.ts` keeps the desktop API's method signatures and response shapes and calls
`src/local/` instead of `fetch`.

## How it maps to desktop Sorty

| Desktop                             | Browser                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `datasets/<name>/` on disk          | The same layout in OPFS, per browser profile                                    |
| `manifest.json`                     | Same schema and item ids, so exports open in desktop Sorty                      |
| Thread-pool jobs polled over HTTP   | Async jobs in the tab, polled the same way                                      |
| PIL crop and flip                   | `createImageBitmap` and `OffscreenCanvas`                                       |
| Pixel-hash dedup                    | Near-duplicate search across classes, see below                                 |
| Fine-tune mobilenet/resnet on a GPU | Softmax head on frozen MobileCLIP S0 features (transformers.js, WebGPU or wasm) |
| Ollama class resolution             | In-browser Gemma 3 1B, or copy-paste into any assistant                         |
| Images dropped into class folders   | Add images from files or folders, or import a zip as a new dataset              |
| Recycle bin and OS trash            | Recycle bin kept. Deleting a class or dataset is permanent                      |

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5048.

## Generating classes

Turning a description like "common ducks of North America" into class names has two
options, picked in the dialog and remembered per browser. Neither needs an account or key.

| Method          | How                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------- |
| In this browser | Gemma 3 1B through transformers.js, about 760 MB on first use, then cached. WebGPU when available |
| Copy prompt     | Copies the prompt for any chat assistant, then parses the pasted reply                            |

## Finding bad images

The tools below run on [MobileCLIP S0](https://huggingface.co/Xenova/mobileclip_s0)
through transformers.js. The image encoder (46 MB) downloads on first use, the text encoder
(43 MB) only for Check labels. Image vectors are cached per item in
`.sorty/emb-mobileclip_s0/`.

| Tool                    | What it does                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Check labels            | Scores each image against "a photo of a <class>" and predicts the best match. No training needed |
| Cross-validate          | Out-of-fold predictions from the trained head, with a probability per image                      |
| Sort: Likely mislabeled | Disagreements first by model confidence, then agreements the model was unsure of                 |
| Find duplicates         | Groups copies across classes, by difference hash (resized, recompressed) or similarity (cropped) |

On 160 noisy iNaturalist birds, Check labels flagged 21 images and cross-validation
reached 89% (MobileNetV2 features gave 87%). Duplicate thresholds are in
`src/local/clean.ts` with the numbers they were calibrated on.

## Adding your own images

Add images takes files, a folder, or a drop anywhere on the dataset page. A folder's
subfolders become classes, loose files go into a class picked in the dialog. Files
already in the dataset under the same class and name are skipped.

Import zip on the home page makes a new dataset from a Sorty export (desktop or browser)
or any zip with one folder per class, optionally inside `train/`, `test/`, or `valid/`.

## Deploy

Vercel, or any static host, serves `dist/`. Pushes to `main` deploy to production.

The build uses `base: "./"` and hash routes (`#/d/<name>`), so the same build works at a
domain root and under a path such as `reflect.cv/sorty/` with no rewrite rules. Datasets
are stored in OPFS per origin, so data saved on the app's own domain doesn't show up under
reflect.cv and the other way around.

## Known limitations

- Sources are iNaturalist, Openverse, and Wikimedia Commons. Bing and DuckDuckGo have no
  CORS headers, so a browser can't fetch them.
- iNaturalist results are limited to openly licensed photos, the all-rights-reserved ones
  are hosted without CORS headers.
- Openverse images come from its 600 px thumbnail endpoint, most origin hosts block
  cross-origin reads.
- Training uses frozen features, so accuracy trails a full fine-tune. Exported models are
  the head as JSON plus the MobileCLIP S0 vision ONNX, not TorchScript.
- Predictions and their probabilities are browser-only fields. Desktop Sorty keeps
  `predicted_label` and drops `predicted_score` when it saves.
- Zip import reads the whole archive into memory.
- Reloading the page stops running jobs. The page asks before leaving while one runs.
- Seeded splits match within the browser build but not desktop Sorty, which uses Python's
  RNG.
- The in-browser model makes up a name now and then ("Mergansium" among real ducks).
  Results come back as checkboxes so they can be reviewed before adding.
- transformers.js fetches its onnxruntime wasm from jsDelivr and the models from Hugging
  Face.
- Tested in headless Chromium and Edge. Firefox and Safari support OPFS writes differently
  and are untested.
