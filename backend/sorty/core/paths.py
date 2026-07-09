"""Dataset on-disk layout.

A dataset is a directory holding <label>/ image folders and a .sorty metadata dir. The
metadata dir name is the single source of truth here so it can change in one place.
"""

from __future__ import annotations

from pathlib import Path

MANIFEST_DIR = ".sorty"

# top-level dirs treated as train/test splits rather than classes, so a dataset in the
# traditional <root>/<split>/<class>/ layout keeps its class names
SPLIT_DIRS = {"train", "test", "val", "valid", "validation"}


def meta_dir(dataset_root: Path) -> Path:
    d = dataset_root / MANIFEST_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d


def has_manifest(dataset_root: Path) -> bool:
    """True if the dataset has a manifest, without creating the metadata dir."""
    return (dataset_root / MANIFEST_DIR / "manifest.json").exists()


def manifest_path(dataset_root: Path) -> Path:
    return meta_dir(dataset_root) / "manifest.json"
