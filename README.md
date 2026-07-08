# 🤖 Sorty

A local tool for building and cleaning image classification datasets. A FastAPI backend
facilitates the dataset generation pipeline (resolve classes, fetch from image sources, download, dedup,
train, infer) and a React frontend gives you a grid to browse, annotate, and clean the
images.

Create a dataset, define its classes by hand or from a plain-English prompt, fetch images
from web sources, browse them as a grid that can be filtered, reclassify images, run duplicate and
outlier passes, train a classifier and run it over the whole set to identify label
mismatches, and delete invalid images into a restorable recycle bin.

## Layout

```text
sorty/
  backend/            FastAPI service
    sorty/            api, jobs, media, workspace, recyclebin, annotate, generate, summary, refresh
    sorty/core/       the dataset core: models, store, sources, download, resolver, pipeline, clean, classify
    tests/            pytest suite, no network or torch needed
    run.py            uvicorn entry point
  frontend/           React + TypeScript + Vite + Tailwind v4
  datasets/           datasets Sorty creates (gitignored)
```

Each dataset is a folder with a `.sorty/` metadata dir:

```text
datasets/<name>/
  <label>/<label>_<id>.jpg
  .sorty/
    manifest.json
    labels.csv
    recyclebin/<label>/...   images Sorty moved to the bin
```

The manifest stores each item's class, source, source URL, and title, which is displayed in the panel for each card.

## Setup

```bash
cd backend
python -m venv venv
venv/Scripts/pip install -e .
```

Class resolution from a prompt uses a local [Ollama](https://ollama.com) model, so start
Ollama and pull the model:

```bash
ollama pull qwen2.5:3b-instruct
```

Training and full-dataset inference use PyTorch, which installs with the base
dependencies. For a CUDA build, install torch from the PyTorch index first:

```bash
venv/Scripts/pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
```

The frontend:

```bash
cd frontend
npm install
```

## Running

Two terminals in dev. The Vite dev server proxies `/api` and `/media` to the backend, so
the frontend is same-origin.

```bash
# terminal 1
cd backend && venv/Scripts/python run.py

# terminal 2
cd frontend && npm run dev
```

Open http://localhost:5047. The backend runs on http://localhost:8047.

The workspace root defaults to the repo root, so `datasets/` sits beside `backend/`. Set
`SORTY_WORKSPACE` to point it elsewhere.
