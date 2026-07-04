"""The workspace: named datasets living under a single datasets/ folder.

Each dataset is a <name>/ folder with a .sorty/ manifest inside. Sorty manages which
folders exist, summarizes them, and handles rename and delete.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from send2trash import send2trash

from sorty.core import Dataset, has_manifest, load_dataset, save_dataset
from sorty.core.ids import FALLBACK_SLUG

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
        if child.is_dir() and has_manifest(child):
            out.append(_summarize(child.name, child))
    return out


def dataset_root(workspace_root: Path, name: str) -> Path:
    """The folder for a dataset name. Does not create it."""
    return datasets_dir(workspace_root) / slugify(name)


def create_dataset(workspace_root: Path, name: str, prompt: str = "") -> Path:
    """Create an empty dataset and write its initial manifest.

    Raises ValueError on a name with no usable characters or one that collides with an
    existing dataset.
    """
    slug = slugify(name)
    # slugify falls back to a placeholder when a name has no slug-able ASCII characters,
    # a dataset needs a real name, though typing "unlabeled" outright is still allowed
    if slug == FALLBACK_SLUG and name.strip().lower() != FALLBACK_SLUG:
        raise ValueError("Dataset name has no usable characters.")
    root = datasets_dir(workspace_root) / slug
    if has_manifest(root):
        raise ValueError(f"A dataset named {slug!r} already exists.")
    root.mkdir(parents=True, exist_ok=True)
    ds = Dataset(dataset_id=slug, prompt=prompt, subjects=[], sources=[])
    save_dataset(ds, root)
    return root


def rename_dataset(workspace_root: Path, old_name: str, new_name: str) -> Path:
    """Rename a dataset, moving its folder and rewriting dataset_id in the manifest.

    Raises ValueError on a blank new name, a missing source, or a name collision.
    """
    base = datasets_dir(workspace_root).resolve()
    # slugify old_name, the folder on disk is always a slug, and this stops a crafted
    # name (e.g. one with a backslash that survives URL routing) from escaping datasets/
    old_slug = slugify(old_name)
    old_root = (base / old_slug).resolve()
    if base not in old_root.parents or not has_manifest(old_root):
        raise ValueError(f"No dataset named {old_name!r}.")

    new_slug = slugify(new_name)
    if new_slug == FALLBACK_SLUG and new_name.strip().lower() != FALLBACK_SLUG:
        raise ValueError("Dataset name has no usable characters.")
    if new_slug == old_slug:
        return old_root

    new_root = (base / new_slug).resolve()
    if has_manifest(new_root):
        raise ValueError(f"A dataset named {new_slug!r} already exists.")

    old_root.rename(new_root)
    ds = load_dataset(new_root)
    ds.dataset_id = new_slug
    save_dataset(ds, new_root)
    return new_root


def delete_dataset(workspace_root: Path, name: str) -> None:
    """Send a dataset folder to the OS recycle bin. Raises ValueError if it's missing.

    The path is resolved under datasets/ before trashing, so a crafted name can't reach
    a folder outside the workspace.
    """
    base = datasets_dir(workspace_root).resolve()
    root = (base / slugify(name)).resolve()
    if base not in root.parents:
        raise ValueError("Refusing to delete a path outside the workspace.")
    if not has_manifest(root):
        raise ValueError(f"No dataset named {name!r}.")
    send2trash(str(root))
