"""A restorable recycle bin over a dataset.

Deleting an image moves its file to .sorty/recyclebin/<label>/ and marks the manifest
item invalid with a deleted_at timestamp, so nothing is destroyed until the bin is
emptied. Restore moves the file back and clears the flag. Empty permanently removes the
binned files and drops their items from the manifest.
"""

from __future__ import annotations

import time
from pathlib import Path

from sorty.core import MANIFEST_DIR, Dataset, DatasetItem, ReviewStatus


def _bin_dir(root: Path) -> Path:
    """The bin root path. Pure, does not create the directory."""
    return root / MANIFEST_DIR / "recyclebin"


def is_binned(item: DatasetItem) -> bool:
    return item.review_status == ReviewStatus.invalid and item.deleted_at is not None


def list_bin(ds: Dataset) -> list[DatasetItem]:
    return [i for i in ds.items if is_binned(i)]


def _bin_path(root: Path, item: DatasetItem) -> Path:
    """Where a binned item's file lives, mirroring its <label>/<filename> layout."""
    return _bin_dir(root) / item.local_path


def delete_to_bin(ds: Dataset, root: Path, item_ids: list[str]) -> int:
    """Move each item's file into the bin and flag it. Returns how many were binned."""
    wanted = set(item_ids)
    moved = 0
    for item in ds.items:
        if item.item_id not in wanted or is_binned(item):
            continue
        src = root / item.local_path
        dest = _bin_path(root, item)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.exists():
            src.replace(dest)
        item.review_status = ReviewStatus.invalid
        item.deleted_at = time.time()
        moved += 1
    if moved:
        ds.touch()
    return moved


def restore(ds: Dataset, root: Path, item_ids: list[str]) -> int:
    """Move each item's file back and clear its bin flag. Returns how many were restored."""
    wanted = set(item_ids)
    restored = 0
    for item in ds.items:
        if item.item_id not in wanted or not is_binned(item):
            continue
        src = _bin_path(root, item)
        dest = root / item.local_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.exists():
            src.replace(dest)
        item.review_status = ReviewStatus.pending
        item.deleted_at = None
        restored += 1
    if restored:
        ds.touch()
    return restored


def delete_by_source(ds: Dataset, root: Path, source: str) -> int:
    """Move every live item fetched from source into the bin. Returns how many were binned."""
    ids = [
        i.item_id
        for i in ds.items
        if not is_binned(i) and i.source == source
    ]
    return delete_to_bin(ds, root, ids)


def empty_bin(ds: Dataset, root: Path) -> int:
    """Permanently delete every binned file and drop those items. Returns the count."""
    binned = list_bin(ds)
    for item in binned:
        _bin_path(root, item).unlink(missing_ok=True)
    binned_ids = {i.item_id for i in binned}
    ds.items = [i for i in ds.items if i.item_id not in binned_ids]
    if binned:
        ds.touch()
    return len(binned)
