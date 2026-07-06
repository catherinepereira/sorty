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
    find_duplicate_groups,
    find_outliers,
    has_manifest,
    load_dataset,
    save_dataset,
)

from sorty import annotate, classes, classify, generate, recyclebin, refresh, summary, workspace
from sorty.config import APP_NAME, workspace_root
from sorty.jobs import JobManager, JobProgress
from sorty.media import MEDIA_PREFIX, media_url, resolve_image
from sorty.recyclebin import is_binned

app = FastAPI(title=APP_NAME)
jobs = JobManager()


# ----- serialization -----

def _item_view(item: DatasetItem, root: Path) -> dict[str, Any]:
    local = Path(item.local_path)
    return {
        "id": item.item_id,
        "label": item.label,
        "status": item.review_status.value,
        "url": media_url(root / item.local_path),
        "binned": is_binned(item),
        "source": item.source,
        "source_url": item.source_url,
        "title": item.title,
        "local_path": item.local_path,
        "directory": str(local.parent),
        "filename": local.name,
    }


def _prediction_view(p: classify.Prediction, root: Path) -> dict[str, Any]:
    return {
        "id": p.item_id,
        "label": p.label,
        "predicted": p.predicted,
        "url": media_url(root / p.local_path),
    }


# ----- dataset resolution -----

def _root(name: str) -> Path:
    """The dataset dir for a name, 404 if it has no manifest."""
    root = workspace.dataset_root(workspace_root(), name)
    if not has_manifest(root):
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
    # subjects to fetch for; empty or omitted means every class in the dataset
    subjects: list[str] | None = None
    # optional prompt to resolve brand-new classes via the LLM before fetching
    prompt: str | None = None
    # how many classes the prompt should resolve to
    class_count: int | None = None
    sources: list[str]
    # images per class: added on top when target_total is false, else the target total
    count: int = 20
    target_total: bool = False


class LabelBody(BaseModel):
    subject: str


class MoveToClassBody(BaseModel):
    item_ids: list[str]
    subject: str


class StatusBody(BaseModel):
    status: ReviewStatus


class StatusManyBody(BaseModel):
    item_ids: list[str]
    status: ReviewStatus


class IdsBody(BaseModel):
    item_ids: list[str]


class DedupBody(BaseModel):
    mode: str  # "exact" or "outliers"


class TrainBody(BaseModel):
    model: str = "mobilenet_v2"
    epochs: int = 8
    val_split: float = 0.2
    img_size: int = 224


class RenameBody(BaseModel):
    name: str


class SubjectsBody(BaseModel):
    subjects: list[str]


class DeleteClassBody(BaseModel):
    class_name: str


class RenameClassBody(BaseModel):
    old_name: str
    new_name: str


class MergeClassesBody(BaseModel):
    sources: list[str]
    target: str


class ResolveBody(BaseModel):
    prompt: str
    count: int | None = None
    exclude: list[str] | None = None


class SourceBody(BaseModel):
    source: str


# ----- capability probes -----

@app.get("/api/sources")
def list_sources() -> dict[str, list[str]]:
    return {"sources": generate.source_names()}


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


@app.patch("/api/datasets/{name}")
def rename_dataset(name: str, body: RenameBody) -> dict[str, str]:
    try:
        root = workspace.rename_dataset(workspace_root(), name, body.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"name": root.name}


@app.delete("/api/datasets/{name}")
def delete_dataset(name: str) -> dict[str, bool]:
    try:
        workspace.delete_dataset(workspace_root(), name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"deleted": True}


@app.get("/api/datasets/{name}")
def get_dataset(name: str) -> dict[str, Any]:
    ds, root = _load(name)
    live = [i for i in ds.items if not is_binned(i)]
    return {
        "name": ds.dataset_id,
        "prompt": ds.prompt,
        "subjects": ds.subjects,
        "sources": ds.sources,
        # stats over live items only, so the count matches the grid and the files on disk
        # rather than including binned items that live under the recycle bin
        "stats": _live_stats(live),
        "items": [_item_view(i, root) for i in live],
    }


def _live_stats(live: list[DatasetItem]) -> dict[str, int]:
    counts = {"total": len(live), "pending": 0, "valid": 0, "invalid": 0}
    for item in live:
        counts[item.review_status.value] += 1
    return counts


@app.get("/api/datasets/{name}/bin")
def get_bin(name: str) -> dict[str, Any]:
    ds, root = _load(name)
    return {"items": [_item_view(i, root) for i in recyclebin.list_bin(ds)]}


@app.get("/api/datasets/{name}/summary")
def dataset_summary(name: str) -> dict[str, Any]:
    ds, root = _load(name)
    return summary.summarize(ds, root)


@app.get("/api/datasets/{name}/items/{item_id}")
def get_item(name: str, item_id: str) -> dict[str, Any]:
    ds, root = _load(name)
    try:
        item = annotate.find_item(ds, item_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such item")
    view = _item_view(item, root)
    view.update(summary.file_info(root, item.local_path))
    return view


@app.post("/api/datasets/{name}/refresh")
def refresh_manifest(name: str) -> dict[str, int]:
    ds, root = _load(name)
    return refresh.refresh_manifest(ds, root)


# ----- classes (subjects) -----

@app.post("/api/datasets/{name}/subjects")
def set_subjects(name: str, body: SubjectsBody) -> dict[str, list[str]]:
    root = _root(name)
    return {"subjects": generate.set_subjects(root, body.subjects)}


@app.post("/api/datasets/{name}/delete-class")
def delete_class(name: str, body: DeleteClassBody) -> dict[str, int]:
    ds, root = _load(name)
    removed = classes.delete_class(ds, root, body.class_name)
    save_dataset(ds, root)
    return {"removed": removed}


@app.post("/api/datasets/{name}/rename-class")
def rename_class(name: str, body: RenameClassBody) -> dict[str, int]:
    ds, root = _load(name)
    try:
        moved = classes.rename_class(ds, root, body.old_name, body.new_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_dataset(ds, root)
    return {"moved": moved}


@app.post("/api/datasets/{name}/merge-classes")
def merge_classes(name: str, body: MergeClassesBody) -> dict[str, int]:
    ds, root = _load(name)
    try:
        moved = classes.merge_classes(ds, root, body.sources, body.target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_dataset(ds, root)
    return {"moved": moved}


@app.post("/api/datasets/{name}/resolve-subjects")
def resolve_subjects(name: str, body: ResolveBody) -> dict[str, list[str]]:
    _root(name)  # 404 if the dataset is missing
    try:
        subjects = generate.resolve(body.prompt, count=body.count, exclude=body.exclude)
    except generate.OllamaUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"subjects": subjects}


@app.post("/api/datasets/{name}/delete-source")
def delete_source(name: str, body: SourceBody) -> dict[str, int]:
    ds, root = _load(name)
    binned = recyclebin.delete_by_source(ds, root, body.source)
    save_dataset(ds, root)
    return {"binned": binned}


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
    return {"item": _item_view(annotate.find_item(ds, item_id), root)}


@app.post("/api/datasets/{name}/move-to-class")
def move_to_class(name: str, body: MoveToClassBody) -> dict[str, int]:
    ds, root = _load(name)
    try:
        moved = annotate.move_to_class(ds, root, body.item_ids, body.subject)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_dataset(ds, root)
    return {"moved": moved}


@app.post("/api/datasets/{name}/items/{item_id}/status")
def set_status(name: str, item_id: str, body: StatusBody) -> dict[str, Any]:
    ds, root = _load(name)
    try:
        annotate.set_status(ds, item_id, body.status)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such item")
    save_dataset(ds, root)
    return {"item": _item_view(annotate.find_item(ds, item_id), root)}


@app.post("/api/datasets/{name}/set-status")
def set_status_many(name: str, body: StatusManyBody) -> dict[str, int]:
    ds, root = _load(name)
    changed = annotate.set_status_many(ds, body.item_ids, body.status)
    save_dataset(ds, root)
    return {"changed": changed}


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
    """Fetch images for chosen classes, all classes, or classes resolved from a prompt.

    A prompt resolves new classes via the LLM and merges them with any explicit ones.
    With no subjects and no prompt, it targets every class already in the dataset. The
    fetch always adds images not already downloaded, so it never silently no-ops.
    """
    root = _root(name)
    subjects = list(body.subjects or [])
    if body.prompt:
        try:
            resolved = generate.resolve(body.prompt, count=body.class_count)
        except generate.OllamaUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        for s in resolved:
            if s not in subjects:
                subjects.append(s)

    def work(p: JobProgress):
        result = generate.add_images(
            root, subjects, body.sources, body.count, p,
            target_total=body.target_total,
        )
        return _result_view(result)

    return {"job_id": jobs.submit(work)}


def _result_view(result) -> dict[str, int]:
    return {
        "records": result.records, "added": result.added,
        "saved": result.saved, "failed": result.failed, "dropped": result.dropped,
    }


@app.post("/api/datasets/{name}/dedup")
def start_dedup(name: str, body: DedupBody) -> dict[str, str]:
    """Flag likely-bad images without touching them, for review in the grid.

    Returns the flagged item ids. Nothing is binned, the frontend filters the grid to
    the flagged set so the user decides what to delete.
    """
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
            # keep the group structure so the grid can put each duplicate set on its own
            # row, plus a flat id list for the filter that hides everything else
            groups = [[i.item_id for i in g] for g in find_duplicate_groups(live, root)]
            ids = [item_id for g in groups for item_id in g]
            p.sync(1, 1, f"Flagged {len(ids)}")
            return {"flagged": ids, "groups": groups}
        ids = [i.item_id for i in find_outliers(live, root)]
        p.sync(1, 1, f"Flagged {len(ids)}")
        return {"flagged": ids}

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
