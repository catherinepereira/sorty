"""Train a classifier and run it over the whole dataset to find label mismatches.

Training delegates to prompt2dataset's _train, which writes model.pt and labels.json
into .p2d/. Inference loads that TorchScript model and predicts every image with the
same preprocessing p2d uses for validation, so a prediction here matches what training
saw. Torch is imported lazily so the rest of Sorty works without the [train] extra.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from prompt2dataset.models import Dataset, DatasetItem
from prompt2dataset.utils import meta_dir

from sorty.recyclebin import is_binned
from sorty.tasks import Progress

# Images per forward pass during inference. Batching amortizes per-call torch overhead,
# the same reason p2d's embedder batches
BATCH_SIZE = 32


def torch_available() -> bool:
    from importlib.util import find_spec

    return find_spec("torch") is not None and find_spec("torchvision") is not None


def model_exists(root: Path) -> bool:
    return (meta_dir(root) / "model.pt").exists()


@dataclass(frozen=True)
class Mismatch:
    item_id: str
    label: str
    subject: str
    predicted: str
    local_path: str


def _candidates(ds: Dataset, root: Path) -> list[DatasetItem]:
    """Live items with a file on disk, skipping ones already in the recycle bin."""
    return [
        i for i in ds.items if not is_binned(i) and (root / i.local_path).exists()
    ]


def find_mismatches(
    items: list[DatasetItem], predictions: dict[str, str]
) -> list[Mismatch]:
    """Items whose predicted class differs from their manifest label.

    predictions maps item_id to predicted label. Items without a prediction are
    skipped. Kept torch-free so it can be unit-tested with a stub.
    """
    out: list[Mismatch] = []
    for item in items:
        predicted = predictions.get(item.item_id)
        if predicted is None or predicted == item.label:
            continue
        out.append(
            Mismatch(
                item_id=item.item_id,
                label=item.label,
                subject=item.subject or item.label,
                predicted=predicted,
                local_path=item.local_path,
            )
        )
    return out


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
    from prompt2dataset.train import _train

    progress.start(total=1, message=f"Training {model_name} for {epochs} epochs...")
    report, _misclassified = _train(
        root, items, model_name, epochs, val_split, img_size
    )
    progress.advance(message="Training complete")
    return report


def _predict_labels(root: Path, items: list[DatasetItem], progress: Progress) -> dict[str, str]:
    """Predicted label per item_id, using the saved TorchScript model."""
    import torch
    import torchvision.transforms as T
    from PIL import Image, UnidentifiedImageError

    from prompt2dataset.train import IMAGENET_MEAN, IMAGENET_STD

    md = meta_dir(root)
    labels: list[str] = json.loads((md / "labels.json").read_text(encoding="utf-8"))
    # jit.load runs the model's code, so it trusts this local model.pt, written by our
    # own Train action. Importing a dataset from an untrusted source would change that
    model = torch.jit.load(str(md / "model.pt"))
    model.eval()

    img_size = 224
    tf = T.Compose(
        [
            T.Resize(int(img_size * 1.14)),
            T.CenterCrop(img_size),
            T.ToTensor(),
            T.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )

    progress.start(total=max(len(items), 1), message="Running classifier")
    predictions: dict[str, str] = {}
    with torch.no_grad():
        for start in range(0, len(items), BATCH_SIZE):
            chunk = items[start : start + BATCH_SIZE]
            tensors: list = []
            ids: list[str] = []
            for item in chunk:
                try:
                    img = Image.open(root / item.local_path).convert("RGB")
                except (UnidentifiedImageError, OSError):
                    continue
                tensors.append(tf(img))
                ids.append(item.item_id)
            if tensors:
                preds = model(torch.stack(tensors)).argmax(dim=1).tolist()
                for item_id, idx in zip(ids, preds):
                    if 0 <= idx < len(labels):
                        predictions[item_id] = labels[idx]
            progress.advance(
                step=len(chunk),
                message=f"Classified {min(start + BATCH_SIZE, len(items))}/{len(items)}",
            )
    return predictions


def infer_all(root: Path, ds: Dataset, progress: Progress) -> list[Mismatch]:
    """Predict every image and return the ones that disagree with their label.

    This uses the single trained model, so images it trained on look artificially
    correct. crossval judges every image with a model that never saw it.
    """
    items = _candidates(ds, root)
    predictions = _predict_labels(root, items, progress)
    return find_mismatches(items, predictions)


def crossval(root: Path, ds: Dataset, folds: int, epochs: int, progress: Progress) -> list[Mismatch]:
    """Out-of-fold cross-validation over the whole dataset.

    Delegates to p2d's crossval, which trains one model per fold and predicts the
    held-out fold, so every image is judged by a model that never saw it. Returns the
    flagged items as Mismatches, mapping p2d's absolute paths back to manifest items.
    """
    from prompt2dataset.crossval import _crossval

    items = _candidates(ds, root)
    progress.start(total=1, message=f"Cross-validating ({folds} folds)...")
    flagged = _crossval(root, items, folds, epochs, img_size=224)

    by_path = {str((root / i.local_path).resolve()): i for i in items}
    out: list[Mismatch] = []
    for entry in flagged:
        item = by_path.get(entry["path"])
        if item is None:
            continue
        out.append(
            Mismatch(
                item_id=item.item_id,
                label=item.label,
                subject=item.subject or item.label,
                predicted=entry["predicted"],
                local_path=item.local_path,
            )
        )
    progress.advance(message="Done")
    return out
