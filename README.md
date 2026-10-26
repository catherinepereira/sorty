# Sorty

Image classification dataset tool that runs entirely in the browser. Build a dataset from a
plain-English description, find the mislabeled and duplicate images, train a classifier,
and export it all as a zip. It's a static site: no server, no account, no API keys. Datasets
are stored in the browser's origin private file system (OPFS) and models run on the device,
with WebGPU when available.

Sorty 2.0, the successor to the desktop [Sorty](https://github.com/catherinepereira/sorty).

## Features

### Build a dataset

- Classes typed by hand, or generated from a description like "common ducks of North
  America" (see [Generating classes](#generating-classes))
- Fetch images per class from iNaturalist, Openverse, and Wikimedia Commons, as a count
  per class or topped up to a target
- Add your own images from files, a folder, or a drop anywhere on the dataset page. A
  folder's subfolders become classes
- Import a zip as a new dataset: a Sorty export, or any zip with one folder per class,
  optionally inside `train/`, `test/`, or `valid/`

### Review

- Grid or table view with thumbnail sizes and pagination
- Class chips with counts, plus filters for review status, model prediction, source, and
  split, and a search over ids, titles, and source URLs
- Change an image's class inline, mark it reviewed, or select many (drag across cards)
  and apply status, class, split, and flips in one go
- Image view with crop, flip, bounding boxes, duplicate, and keyboard shortcuts
- Deleted images go to a recycle bin and can be restored

### Find bad images

These run on [MobileCLIP S0](https://huggingface.co/Xenova/mobileclip_s0) through
transformers.js. The image encoder (46 MB) downloads on first use, the text encoder
(43 MB) only for Check labels. Image vectors are cached per image.

| Tool                    | What it does                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Check labels            | Scores each image against "a photo of a <class>" and predicts the best match. No training needed |
| Cross-validate          | Out-of-fold predictions from a trained classifier, with a probability per image                  |
| Sort: Likely mislabeled | Disagreements first by model confidence, then agreements the model was unsure of                 |
| Find duplicates         | Groups copies across classes, by difference hash (resized, recompressed) or similarity (cropped) |

A prediction that disagrees with an image's class shows on its card with a confidence bar.
Clicking the predicted class accepts it.

On 160 noisy iNaturalist birds, Check labels flagged 21 images and cross-validation
reached 89%. The duplicate thresholds are in `src/local/clean.ts` with the numbers they
were calibrated on.

### Train and export

- Train a classifier on MobileCLIP features, on every image or only reviewed ones. The
  report has accuracy, per-class precision and recall, a confusion matrix, and a history
  of runs
- Seeded train/test/valid splits per class, with locks for splits and review
- Export the dataset as a zip in class folders, or split into `train/` and `test/`
- Export the trained model: the classifier head as JSON plus the image encoder as ONNX

## Generating classes

Two options, picked in the dialog and remembered per browser. Neither needs an account or
key.

| Method          | How                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------- |
| In this browser | Gemma 3 1B through transformers.js, about 760 MB on first use, then cached. WebGPU when available |
| Copy prompt     | Copies the prompt for any chat assistant, then parses the pasted reply                            |

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5048.

Built with React, TypeScript, Vite, and Tailwind v4. `src/local/` holds the dataset logic
(storage, sources, jobs, embeddings, training, export) and `src/api.ts` is the interface the
pages call.

## Deploy

Vercel, or any static host, serves `dist/`. Pushes to `main` deploy to production.

The build uses `base: "./"` and hash routes (`#/d/<name>`), so the same build works at a
domain root and under a path such as `reflect.cv/sorty/` with no rewrite rules. Datasets
are stored in OPFS per origin, so data saved on the app's own domain doesn't show up under
reflect.cv and the other way around.

## Known limitations

- Image sources are limited to ones that allow cross-origin reads. Bing and DuckDuckGo
  don't, so they aren't offered.
- iNaturalist results are limited to openly licensed photos, the all-rights-reserved ones
  are hosted without CORS headers.
- Openverse images come from its 600 px thumbnail endpoint, most origin hosts block
  cross-origin reads.
- Training uses frozen features, so accuracy trails a full fine-tune.
- Zip import reads the whole archive into memory.
- Reloading the page stops running jobs. The page asks before leaving while one runs.
- The in-browser model makes up a name now and then ("Mergansium" among real ducks).
  Results come back as checkboxes so they can be reviewed before adding.
- transformers.js fetches its onnxruntime wasm from jsDelivr and the models from Hugging
  Face.
- Tested in headless Chromium and Edge. Firefox and Safari support OPFS writes differently
  and are untested.
