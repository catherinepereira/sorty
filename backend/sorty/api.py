"""The Sorty HTTP API.

Thin routes over the reusable core (workspace, recyclebin, annotate, generate,
classify). Heavy work (generate, dedup, train, infer) is submitted to the JobManager and
polled through /api/jobs/{id}. Images are served by the traversal-safe media route.
"""

from __future__ import annotations

import io
import json
import os
import random
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from starlette.background import BackgroundTask

from sorty.core import (
    MANIFEST_DIR,
    Dataset,
    DatasetItem,
    ReviewStatus,
    find_duplicate_groups,
    has_manifest,
    load_dataset,
    manifest_path,
    meta_dir,
    save_dataset,
)

from sorty import annotate, classes, classify, generate, recyclebin, refresh, summary, workspace
from sorty.config import APP_NAME, contact_email, set_contact_email, workspace_root
from sorty.core.sources import REGISTRY
from sorty.jobs import JobManager, JobProgress, bridge
from sorty.media import MEDIA_PREFIX, media_url, resolve_image
from sorty.recyclebin import bin_path, is_binned

app = FastAPI(title=APP_NAME)
jobs = JobManager()


# ----- serialization -----

def _item_view(item: DatasetItem, root: Path) -> dict[str, Any]:
    local = Path(item.local_path)
    # a binned item's file sits under .sorty/recyclebin/, not its class folder
    file_path = bin_path(root, item) if is_binned(item) else root / item.local_path
    return {
        "id": item.item_id,
        "label": item.label,
        "status": item.review_status.value,
        "url": media_url(file_path),
        "binned": is_binned(item),
        "source": item.source,
        "source_url": item.source_url,
        "title": item.title,
        "local_path": item.local_path,
        "directory": str(local.parent),
        "filename": local.name,
        "predicted": item.predicted_label,
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


class CropBody(BaseModel):
    # the box to keep, in pixels of the original image
    left: int
    top: int
    width: int
    height: int


class IdsBody(BaseModel):
    item_ids: list[str]


class TrainBody(BaseModel):
    model: str = "mobilenet_v2"
    epochs: int = 8
    valid_only: bool = False


class CrossvalBody(TrainBody):
    folds: int = 5


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
def list_sources() -> dict[str, Any]:
    """The source list, each flagged if its API policy wants a contact email."""
    return {
        "sources": [
            {"name": a.name, "requires_contact": a.requires_contact}
            for a in REGISTRY.values()
        ],
        "contact_set": bool(contact_email()),
    }


class ContactBody(BaseModel):
    email: str


@app.post("/api/contact")
def set_contact(body: ContactBody) -> dict[str, bool]:
    """Save the contact email sources send in their User-Agent, persisted to .env."""
    email = body.email.strip()
    if "@" not in email or " " in email or len(email) < 3:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    set_contact_email(email)
    return {"contact_set": True}


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


@app.post("/api/datasets/{name}/items/{item_id}/duplicate")
def duplicate_item(name: str, item_id: str) -> dict[str, Any]:
    """Copy an image under a new id, so two crops of one photo can coexist."""
    ds, root = _load(name)
    try:
        copy = annotate.duplicate_item(ds, root, item_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such item")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_dataset(ds, root)
    return {"item": _item_view(copy, root)}


@app.post("/api/datasets/{name}/items/{item_id}/crop")
def crop_item(name: str, item_id: str, body: CropBody) -> dict[str, Any]:
    """Crop the item's image in place and return the item with its new dimensions."""
    ds, root = _load(name)
    try:
        annotate.crop_item(
            ds, root, item_id, body.left, body.top, body.width, body.height
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="No such item")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_dataset(ds, root)
    item = annotate.find_item(ds, item_id)
    view = _item_view(item, root)
    view.update(summary.file_info(root, item.local_path))
    return {"item": view}


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


# ----- jobs: generate, dedup, train -----

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
def start_dedup(name: str) -> dict[str, str]:
    """Flag pixel-identical duplicates without touching them, for review in the grid.

    Returns the flagged item ids. Nothing is binned, the frontend filters the grid to
    the flagged set so the user decides what to delete.
    """
    root = _root(name)

    def work(p: JobProgress):
        ds = load_dataset(root)
        live = [i for i in ds.items if not is_binned(i)]
        # keep the group structure so the grid can put each duplicate set on its own
        # row, plus a flat id list for the filter that hides everything else
        found = find_duplicate_groups(live, root, on_progress=bridge(p))
        groups = [[i.item_id for i in g] for g in found]
        ids = [item_id for g in groups for item_id in g]
        p.sync(max(len(live), 1), len(live), f"Flagged {len(ids)}")
        return {"flagged": ids, "groups": groups}

    return {"job_id": jobs.submit(work)}


def _check_train_body(body: TrainBody | CrossvalBody) -> None:
    if not classify.torch_available():
        raise HTTPException(status_code=503, detail="Training needs PyTorch")
    if body.model not in classify.SUPPORTED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model {body.model!r}. Choose from {classify.SUPPORTED_MODELS}",
        )
    if not 1 <= body.epochs <= 50:
        raise HTTPException(status_code=400, detail="Epochs must be between 1 and 50.")


@app.post("/api/datasets/{name}/crossval")
def start_crossval(name: str, body: CrossvalBody) -> dict[str, str]:
    """Cross-validate a model over the dataset and store each item's predicted class.

    Every image is predicted by a fold model that never trained on it. The prediction
    lands on the item as predicted_label, which the grid filters on.
    """
    root = _root(name)
    _check_train_body(body)
    if not 2 <= body.folds <= 10:
        raise HTTPException(status_code=400, detail="Folds must be between 2 and 10.")

    def work(p: JobProgress):
        ds = load_dataset(root)
        preds = classify.crossval(
            root, ds, body.folds, body.epochs, p,
            model=body.model, valid_only=body.valid_only,
        )
        by_id = {pred.item_id: pred.predicted for pred in preds}
        for item in ds.items:
            item.predicted_label = by_id.get(item.item_id)
        ds.touch()
        save_dataset(ds, root)
        mismatched = sum(
            1 for i in ds.items
            if i.predicted_label is not None and i.predicted_label != i.label
        )
        return {"predicted": len(by_id), "mismatched": mismatched}

    return {"job_id": jobs.submit(work)}


def _runs_path(root: Path) -> Path:
    return meta_dir(root) / "runs.json"


def _load_runs(root: Path) -> list[dict]:
    path = _runs_path(root)
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


@app.post("/api/datasets/{name}/train")
def start_train(name: str, body: TrainBody) -> dict[str, str]:
    """Train one model on the whole dataset and save it under .sorty/ for export.

    Every run's report is appended to runs.json so settings can be compared across
    runs. model.pt itself holds only the latest run's weights.
    """
    root = _root(name)
    _check_train_body(body)

    def work(p: JobProgress):
        ds = load_dataset(root)
        report = classify.train_full(
            root, ds, body.epochs, p, model=body.model, valid_only=body.valid_only
        )
        report["valid_only"] = body.valid_only
        runs = _load_runs(root)
        runs.append(report)
        _runs_path(root).write_text(json.dumps(runs, indent=2), encoding="utf-8")
        return report

    return {"job_id": jobs.submit(work)}


@app.get("/api/datasets/{name}/model")
def model_info(name: str) -> dict[str, Any]:
    """Whether a saved model exists, its training report, and the full run history."""
    root = _root(name)
    report_path = meta_dir(root) / "report.json"
    report = None
    if report_path.exists():
        report = json.loads(report_path.read_text(encoding="utf-8"))
    runs = sorted(
        _load_runs(root), key=lambda r: r.get("trained_at", 0), reverse=True
    )
    return {"trained": classify.model_exists(root), "report": report, "runs": runs}


@app.get("/api/datasets/{name}/model/export")
def export_model(name: str) -> Response:
    """The saved model as a zip: TorchScript weights, class order, training report."""
    root = _root(name)
    if not classify.model_exists(root):
        raise HTTPException(status_code=404, detail="No trained model to export")
    md = meta_dir(root)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for filename in ("model.pt", "labels.json", "report.json"):
            path = md / filename
            if path.exists():
                z.write(path, filename)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{name}-model.zip"'
        },
    )


def _assign_test_ids(items: list[DatasetItem], test_percent: int, seed: int) -> set[str]:
    """Item ids that land in test/, split per class so every class covers both sides.

    Items are sorted before the seeded shuffle, so the same seed always produces the
    same split. A class with at least two images keeps at least one on each side no
    matter the percentage. A single-image class stays in train.
    """
    by_label: dict[str, list[DatasetItem]] = defaultdict(list)
    for item in items:
        by_label[item.label].append(item)

    rng = random.Random(seed)
    test_ids: set[str] = set()
    for label in sorted(by_label):
        group = sorted(by_label[label], key=lambda i: i.item_id)
        rng.shuffle(group)
        n_test = round(len(group) * test_percent / 100)
        if len(group) >= 2:
            n_test = min(max(n_test, 1), len(group) - 1)
        else:
            n_test = 0
        test_ids.update(i.item_id for i in group[:n_test])
    return test_ids


@app.get("/api/datasets/{name}/export")
def export_dataset(
    name: str, test_percent: int | None = None, seed: int = 42
) -> FileResponse:
    """The dataset as a zip, flat class folders or a seeded train/test split.

    Flat exports keep each item's path and include the manifest. With test_percent set,
    images land in train/<class>/ and test/<class>/ instead, and the manifest is left
    out since its paths describe the flat layout. Built as a temp file rather than in
    memory, a dataset can run to hundreds of MB. Images are stored uncompressed since
    they already are.
    """
    root = _root(name)
    if test_percent is not None and not 1 <= test_percent <= 90:
        raise HTTPException(
            status_code=400, detail="Test share must be between 1 and 90 percent."
        )
    ds = load_dataset(root)
    live = [
        i for i in ds.items if not is_binned(i) and (root / i.local_path).exists()
    ]
    test_ids = (
        _assign_test_ids(live, test_percent, seed) if test_percent is not None else None
    )

    fd, tmp = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as z:
        for item in live:
            path = root / item.local_path
            if test_ids is None:
                arcname = item.local_path.replace("\\", "/")
            else:
                split = "test" if item.item_id in test_ids else "train"
                arcname = f"{split}/{item.label}/{Path(item.local_path).name}"
            z.write(path, arcname)
        if test_ids is None:
            mp = manifest_path(root)
            if mp.exists():
                z.write(mp, f"{MANIFEST_DIR}/{mp.name}")
    return FileResponse(
        tmp,
        media_type="application/zip",
        filename=f"{name}.zip",
        background=BackgroundTask(os.remove, tmp),
    )


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such job")
    return job.view()


# ----- media -----

@app.get(MEDIA_PREFIX + "/{rel:path}")
def serve_media(rel: str) -> FileResponse:
    # no-cache forces revalidation, so an image edited in place (crop) shows its new
    # pixels after a reload instead of the browser's cached copy. Unchanged files still
    # answer 304 via the ETag, so the grid stays cheap
    return FileResponse(resolve_image(rel), headers={"Cache-Control": "no-cache"})
