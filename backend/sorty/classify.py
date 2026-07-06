"""Cross-validate a classifier over the dataset and map its judgments back to items.

The training itself lives in sorty.core. This filters out recycle-bin items, bridges
progress to the job's progress, and returns Prediction objects keyed by item id. Torch
is imported lazily in the core, so this module loads without it.
"""

from __future__ import annotations

from pathlib import Path

from sorty.core import (
    SUPPORTED_MODELS,
    Dataset,
    DatasetItem,
    Prediction,
    crossval as core_crossval,
    model_exists,
    torch_available,
)
from sorty.core import find_mismatches as core_find_mismatches
from sorty.core import train as core_train
from sorty.core.models import ReviewStatus

from sorty.jobs import JobProgress, bridge
from sorty.recyclebin import is_binned

__all__ = [
    "Prediction",
    "SUPPORTED_MODELS",
    "model_exists",
    "torch_available",
    "crossval",
    "train_full",
    "find_mismatches",
]

# re-exported so the API and tests can build predictions without a torch dependency
find_mismatches = core_find_mismatches


def _candidates(ds: Dataset, root: Path, valid_only: bool = False) -> list[DatasetItem]:
    """Live items with a file on disk, skipping ones already in the recycle bin."""
    items = [i for i in ds.items if not is_binned(i) and (root / i.local_path).exists()]
    if valid_only:
        items = [i for i in items if i.review_status is ReviewStatus.valid]
    return items


def train_full(
    root: Path,
    ds: Dataset,
    epochs: int,
    progress: JobProgress,
    *,
    model: str = "mobilenet_v2",
    valid_only: bool = False,
) -> dict:
    """One training run over the whole dataset, saving model.pt for export."""
    items = _candidates(ds, root, valid_only)
    return core_train(
        root, items, model=model, epochs=epochs, on_progress=bridge(progress)
    )


def crossval(
    root: Path,
    ds: Dataset,
    folds: int,
    epochs: int,
    progress: JobProgress,
    *,
    model: str = "mobilenet_v2",
    valid_only: bool = False,
) -> list[Prediction]:
    """Out-of-fold cross-validation, mapping every predicted path back to a Prediction.

    Every image is predicted by a model that never trained on it, so correct predictions
    mean as much as the disagreements. valid_only trains and predicts on reviewed-valid
    images only.
    """
    items = _candidates(ds, root, valid_only)
    predicted = core_crossval(
        root, items, model=model, folds=folds, epochs=epochs, on_progress=bridge(progress)
    )
    by_path = {str((root / i.local_path).resolve()): i for i in items}
    out: list[Prediction] = []
    for entry in predicted:
        item = by_path.get(entry["path"])
        if item is None:
            continue
        out.append(Prediction(
            item_id=item.item_id, label=item.label,
            predicted=entry["predicted"], local_path=item.local_path,
        ))
    return out
