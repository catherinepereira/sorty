"""The workspace: named datasets living under a single datasets/ folder.

Each dataset is an ordinary prompt2dataset directory (a <name>/ folder with a .p2d/
manifest inside). Sorty only manages which folders exist and summarizes them. p2d
owns everything inside.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from prompt2dataset import Dataset, load_dataset, meta_dir, save_dataset

from sorty.ids import slugify
from sorty.recyclebin import is_binned


def datasets_path(workspace_root: Path) -> Path:
    """The datasets folder path, without creating it."""
    return workspace_root / "datasets"


def datasets_dir(workspace_root: Path) -> Path:
    """The datasets folder, created if missing."""
    d = datasets_path(workspace_root)
    d.mkdir(parents=True, exist_ok=True)
    return d


@dataclass(frozen=True)
class DatasetSummary:
    name: str
    root: Path
    total: int
    valid: int
    pending: int
    subjects: int
    thumbnail: Path | None


def _first_live_image(ds: Dataset, root: Path) -> Path | None:
    """A cover image: the first non-binned item whose file is on disk."""
    for item in ds.items:
        if is_binned(item):
            continue
        p = root / item.local_path
        if p.exists():
            return p
    return None


def _summarize(name: str, root: Path) -> DatasetSummary:
    ds = load_dataset(root)
    stats = ds.stats()
    return DatasetSummary(
        name=name,
        root=root,
        total=stats["total"],
        valid=stats["valid"],
        pending=stats["pending"],
        subjects=len(ds.subjects),
        thumbnail=_first_live_image(ds, root),
    )


def list_datasets(workspace_root: Path) -> list[DatasetSummary]:
    """Every dataset folder that has a manifest, sorted by name."""
    base = datasets_dir(workspace_root)
    out: list[DatasetSummary] = []
    for child in sorted(base.iterdir()):
        if child.is_dir() and (meta_dir(child) / "manifest.json").exists():
            out.append(_summarize(child.name, child))
    return out


def dataset_root(workspace_root: Path, name: str) -> Path:
    """The folder for a dataset name. Does not create it."""
    return datasets_dir(workspace_root) / slugify(name)


def create_dataset(workspace_root: Path, name: str, prompt: str = "") -> Path:
    """Create an empty dataset and write its initial manifest.

    Raises ValueError on a blank name or one that collides with an existing dataset.
    """
    slug = slugify(name)
    if not slug:
        raise ValueError("Dataset name is empty after slugifying.")
    root = datasets_dir(workspace_root) / slug
    if (root / ".p2d" / "manifest.json").exists():
        raise ValueError(f"A dataset named {slug!r} already exists.")
    root.mkdir(parents=True, exist_ok=True)
    ds = Dataset(dataset_id=slug, prompt=prompt, subjects=[], sources=[])
    save_dataset(ds, root)
    return root
