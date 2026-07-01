"""Train a classifier and use it to find label mismatches, via prompt2dataset.

Training, full-dataset inference, and cross-validation all live in p2d. Sorty filters
out recycle-bin items, bridges progress to its own Progress, and returns p2d's
Prediction objects to the UI. Torch is imported lazily inside p2d, so this module loads
without the [train] extra.
"""

from __future__ import annotations

from pathlib import Path

from prompt2dataset import (
    Dataset,
    DatasetItem,
    Prediction,
    crossval as p2d_crossval,
    infer as p2d_infer,
    model_exists,
    torch_available,
    train as p2d_train,
)
from prompt2dataset import find_mismatches as p2d_find_mismatches
from prompt2dataset.progress import Progress as P2DProgress

from sorty.recyclebin import is_binned
from sorty.tasks import Progress

__all__ = [
    "Prediction",
    "torch_available",
    "model_exists",
    "train",
    "infer_all",
    "crossval",
    "find_mismatches",
]

# re-exported so app.py and tests can build predictions without a torch dependency
find_mismatches = p2d_find_mismatches


def _bridge(progress: Progress):
    def on_progress(p: P2DProgress) -> None:
        progress.sync(p.total, p.done, p.message)

    return on_progress


def _candidates(ds: Dataset, root: Path) -> list[DatasetItem]:
    """Live items with a file on disk, skipping ones already in the recycle bin."""
    return [i for i in ds.items if not is_binned(i) and (root / i.local_path).exists()]


def train(
    root: Path,
    items: list[DatasetItem],
    model_name: str,
    epochs: int,
    val_split: float,
    img_size: int,
    progress: Progress,
) -> dict:
    """Fine-tune a classifier on the dataset. Returns p2d's training report."""
    return p2d_train(
        root, items, model=model_name, epochs=epochs, val_split=val_split,
        img_size=img_size, on_progress=_bridge(progress),
    )


def infer_all(root: Path, ds: Dataset, progress: Progress) -> list[Prediction]:
    """Predict every image and return the ones that disagree with their label.

    Uses the single trained model, so images it trained on look artificially correct.
    crossval judges every image with a model that never saw it.
    """
    return p2d_infer(root, _candidates(ds, root), on_progress=_bridge(progress))


def crossval(root: Path, ds: Dataset, folds: int, epochs: int, progress: Progress) -> list[Prediction]:
    """Out-of-fold cross-validation, mapping p2d's flagged paths back to predictions."""
    items = _candidates(ds, root)
    flagged = p2d_crossval(
        root, items, folds=folds, epochs=epochs, on_progress=_bridge(progress)
    )
    by_path = {str((root / i.local_path).resolve()): i for i in items}
    out: list[Prediction] = []
    for entry in flagged:
        item = by_path.get(entry["path"])
        if item is None:
            continue
        out.append(Prediction(
            item_id=item.item_id, label=item.label,
            subject=item.subject or item.label, predicted=entry["predicted"],
            local_path=item.local_path,
        ))
    return out
