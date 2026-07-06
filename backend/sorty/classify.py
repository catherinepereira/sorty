"""Cross-validate a classifier over the dataset and map its judgments back to items.

The training itself lives in sorty.core. This filters out recycle-bin items, bridges
progress to the job's progress, and returns Prediction objects keyed by item id. Torch
is imported lazily in the core, so this module loads without it.
"""

from __future__ import annotations

from pathlib import Path

from sorty.core import (
    Dataset,
    DatasetItem,
    Prediction,
    crossval as core_crossval,
    torch_available,
)
from sorty.core import find_mismatches as core_find_mismatches

from sorty.jobs import JobProgress, bridge
from sorty.recyclebin import is_binned

__all__ = [
    "Prediction",
    "torch_available",
    "crossval",
    "find_mismatches",
]

# re-exported so the API and tests can build predictions without a torch dependency
find_mismatches = core_find_mismatches


def _candidates(ds: Dataset, root: Path) -> list[DatasetItem]:
    """Live items with a file on disk, skipping ones already in the recycle bin."""
    return [i for i in ds.items if not is_binned(i) and (root / i.local_path).exists()]


def crossval(root: Path, ds: Dataset, folds: int, epochs: int, progress: JobProgress) -> list[Prediction]:
    """Out-of-fold cross-validation, mapping every predicted path back to a Prediction.

    Every image is predicted by a model that never trained on it, so correct predictions
    mean as much as the disagreements.
    """
    items = _candidates(ds, root)
    predicted = core_crossval(
        root, items, folds=folds, epochs=epochs, on_progress=bridge(progress)
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
