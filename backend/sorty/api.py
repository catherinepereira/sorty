"""The Sorty HTTP API.

Thin routes over the reusable core (workspace, recyclebin, annotate, generate,
classify). Heavy work (generate, dedup, train, infer) is submitted to the JobManager and
polled through /api/jobs/{id}. Images are served by the traversal-safe media route.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from sorty.core import (
    Dataset,
    DatasetItem,
    ReviewStatus,
    find_exact_duplicates,
    find_outliers,
    load_dataset,
    save_dataset,
)

from sorty import annotate, classify, generate, recyclebin, workspace
from sorty.config import APP_NAME, workspace_root
from sorty.jobs import JobManager, JobProgress
from sorty.media import MEDIA_PREFIX, media_url, resolve_image
from sorty.recyclebin import is_binned

app = FastAPI(title=APP_NAME)
jobs = JobManager()


# ----- serialization -----

def _item_view(item: DatasetItem, root: Path) -> dict[str, Any]:
    return {
        "id": item.item_id,
        "label": item.label,
        "subject": item.subject or item.label,
        "status": item.review_status.value,
        "note": item.meta.get("note", ""),
        "url": media_url(root / item.local_path),
        "binned": is_binned(item),
    }


def _prediction_view(p: classify.Prediction, root: Path) -> dict[str, Any]:
    return {
        "id": p.item_id,
        "label": p.label,
        "subject": p.subject,
        "predicted": p.predicted,
        "url": media_url(root / p.local_path),
    }


# ----- dataset resolution -----

def _root(name: str) -> Path:
    """The dataset dir for a name, 404 if it has no manifest."""
    root = workspace.dataset_root(workspace_root(), name)
    if not (root / ".p2d" / "manifest.json").exists():
        raise HTTPException(status_code=404, detail=f"No dataset named {name!r}")
    return root


def _load(name: str) -> tuple[Dataset, Path]:
    root = _root(name)
    return load_dataset(root), root


# ----- request bodies -----

class CreateBody(BaseModel):
    name: str
    prompt: str = ""


class GenerateBody(BaseModel):
    subjects: list[str] | None = None
    prompt: str | None = None
    count: int | None = None
    sources: list[str]
    limit: int = 20


class LabelBody(BaseModel):
    subject: str


class StatusBody(BaseModel):
    status: ReviewStatus


class NoteBody(BaseModel):
    note: str


class IdsBody(BaseModel):
    item_ids: list[str]


class DedupBody(BaseModel):
    mode: str  # "exact" or "outliers"


class TrainBody(BaseModel):
    model: str = "mobilenet_v2"
    epochs: int = 8
    val_split: float = 0.2
    img_size: int = 224


# ----- capability probes -----

@app.get("/api/sources")
def list_sources() -> dict[str, list[str]]:
    return {"sources": generate.source_names()}


@app.get("/api/models")
def list_models() -> dict[str, list[str]]:
    return {"models": classify.SUPPORTED_MODELS}


@app.get("/api/torch")
def torch_probe() -> dict[str, bool]:
    return {"available": classify.torch_available()}


# ----- workspace -----

@app.get("/api/datasets")
def list_datasets() -> dict[str, list[dict[str, Any]]]:
    out = []
    for s in workspace.list_datasets(workspace_root()):
        out.append({
            "name": s.name,
            "total": s.total,
            "valid": s.valid,
            "pending": s.pending,
            "subjects": s.subjects,
            "thumbnail": media_url(s.thumbnail) if s.thumbnail else "",
        })
    return {"datasets": out}


@app.post("/api/datasets", status_code=201)
def create_dataset(body: CreateBody) -> dict[str, str]:
    try:
        root = workspace.create_dataset(workspace_root(), body.name, body.prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"name": root.name}


@app.get("/api/datasets/{name}")
def get_dataset(name: str) -> dict[str, Any]:
    ds, root = _load(name)
    live = [i for i in ds.items if not is_binned(i)]
    return {
        "name": ds.dataset_id,
        "prompt": ds.prompt,
        "subjects": ds.subjects,
        "sources": ds.sources,
        "stats": ds.stats(),
        "items": [_item_view(i, root) for i in live],
    }


@app.get("/api/datasets/{name}/bin")
def get_bin(name: str) -> dict[str, Any]:
    ds, root = _load(name)
    return {"items": [_item_view(i, root) for i in recyclebin.list_bin(ds)]}


# ----- annotation -----

@app.post("/api/datasets/{name}/items/{item_id}/label")
def set_label(name: str, item_id: str, body: LabelBody) -> dict[str, Any]:
    ds, root = _load(name)
    try:
        annotate.set_label(ds, root, item_id, body.subject)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such item")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_dataset(ds, root)
    return {"item": _item_view(annotate._find(ds, item_id), root)}


@app.post("/api/datasets/{name}/items/{item_id}/status")
def set_status(name: str, item_id: str, body: StatusBody) -> dict[str, Any]:
    ds, root = _load(name)
    try:
        annotate.set_status(ds, item_id, body.status)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such item")
    save_dataset(ds, root)
    return {"item": _item_view(annotate._find(ds, item_id), root)}


@app.post("/api/datasets/{name}/items/{item_id}/note")
def set_note(name: str, item_id: str, body: NoteBody) -> dict[str, Any]:
    ds, root = _load(name)
    try:
        annotate.set_note(ds, item_id, body.note)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such item")
    save_dataset(ds, root)
    return {"item": _item_view(annotate._find(ds, item_id), root)}


# ----- recycle bin -----

@app.post("/api/datasets/{name}/delete")
def delete_items(name: str, body: IdsBody) -> dict[str, int]:
    ds, root = _load(name)
    moved = recyclebin.delete_to_bin(ds, root, body.item_ids)
    save_dataset(ds, root)
    return {"binned": moved}


@app.post("/api/datasets/{name}/restore")
def restore_items(name: str, body: IdsBody) -> dict[str, int]:
    ds, root = _load(name)
    restored = recyclebin.restore(ds, root, body.item_ids)
    save_dataset(ds, root)
    return {"restored": restored}


@app.post("/api/datasets/{name}/empty-bin")
def empty_bin(name: str) -> dict[str, int]:
    ds, root = _load(name)
    removed = recyclebin.empty_bin(ds, root)
    save_dataset(ds, root)
    return {"removed": removed}


# ----- jobs: generate, dedup, train, infer -----

@app.post("/api/datasets/{name}/generate")
def start_generate(name: str, body: GenerateBody) -> dict[str, str]:
    root = _root(name)
    if body.subjects:
        subjects = body.subjects
    elif body.prompt:
        try:
            subjects = generate.resolve(body.prompt, count=body.count)
        except generate.OllamaUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    else:
        raise HTTPException(status_code=400, detail="Provide subjects or a prompt")

    sources, limit = body.sources, body.limit

    def work(p: JobProgress):
        result = generate.generate(root, subjects, sources, limit, p)
        return {
            "records": result.records, "added": result.added,
            "saved": result.saved, "failed": result.failed, "dropped": result.dropped,
        }

    return {"job_id": jobs.submit(work)}


def _bin_flagged(ds: Dataset, root: Path, flagged: list[DatasetItem]) -> int:
    """Route flagged items to the restorable bin instead of a hard invalid mark."""
    return recyclebin.delete_to_bin(ds, root, [i.item_id for i in flagged])


@app.post("/api/datasets/{name}/dedup")
def start_dedup(name: str, body: DedupBody) -> dict[str, str]:
    root = _root(name)
    if body.mode not in ("exact", "outliers"):
        raise HTTPException(status_code=400, detail="mode must be exact or outliers")
    if body.mode == "outliers" and not classify.torch_available():
        raise HTTPException(status_code=503, detail="Outlier detection needs PyTorch")

    def work(p: JobProgress):
        ds = load_dataset(root)
        live = [i for i in ds.items if not is_binned(i)]
        p.sync(1, 0, f"Scanning for {body.mode}")
        if body.mode == "exact":
            flagged = find_exact_duplicates(live, root)
        else:
            flagged = find_outliers(live, root)
        binned = _bin_flagged(ds, root, flagged)
        save_dataset(ds, root)
        p.sync(1, 1, f"Binned {binned}")
        return {"binned": binned}

    return {"job_id": jobs.submit(work)}


@app.post("/api/datasets/{name}/train")
def start_train(name: str, body: TrainBody) -> dict[str, str]:
    root = _root(name)
    if not classify.torch_available():
        raise HTTPException(status_code=503, detail="Training needs PyTorch")

    def work(p: JobProgress):
        ds = load_dataset(root)
        live = [i for i in ds.items if not is_binned(i)]
        return classify.train(
            root, live, body.model, body.epochs, body.val_split, body.img_size, p
        )

    return {"job_id": jobs.submit(work)}


@app.post("/api/datasets/{name}/infer")
def start_infer(name: str) -> dict[str, str]:
    root = _root(name)
    if not classify.torch_available():
        raise HTTPException(status_code=503, detail="Inference needs PyTorch")
    if not classify.model_exists(root):
        raise HTTPException(status_code=400, detail="Train a model first")

    def work(p: JobProgress):
        ds = load_dataset(root)
        preds = classify.infer_all(root, ds, p)
        return [_prediction_view(pred, root) for pred in preds]

    return {"job_id": jobs.submit(work)}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such job")
    return job.view()


# ----- media -----

@app.get(MEDIA_PREFIX + "/{rel:path}")
def serve_media(rel: str) -> FileResponse:
    return FileResponse(resolve_image(rel))
