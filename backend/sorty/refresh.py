"""Reconcile the manifest with the image files actually on disk.

Images a user drops straight into a <label>/ folder are added as unknown-source items.
A top-level train/ or test/ dir is treated as a split holder, its subdirs are the
classes, so both the flat <label>/ layout and the traditional <split>/<label>/ layout
ingest with the same class names. Manifest items whose file has vanished are dropped.
Binned items are left alone, their files sit under the recycle bin, not the class
folders.
"""

from __future__ import annotations

from pathlib import Path

from sorty.core import MANIFEST_DIR, Dataset, DatasetItem, prune_missing, save_dataset
from sorty.core.download import IMAGE_EXTS
from sorty.core.paths import SPLIT_DIRS
from sorty.recyclebin import is_binned


def _add_from_folder(ds: Dataset, root: Path, folder: Path, label: str,
                     known_paths: set[str]) -> int:
    added = 0
    for file in sorted(folder.rglob("*")):
        if not file.is_file() or file.suffix.lower() not in IMAGE_EXTS:
            continue
        rel = file.relative_to(root).as_posix()
        if rel in known_paths:
            continue
        ds.items.append(DatasetItem(
            item_id=DatasetItem.make_id(rel),
            label=label,
            source="unknown",
            source_url="",
            local_path=rel,
        ))
        known_paths.add(rel)
        added += 1
        if label not in ds.subjects:
            ds.subjects.append(label)
    return added


def refresh_manifest(ds: Dataset, root: Path) -> dict[str, int]:
    """Add on-disk images missing from the manifest, drop items whose file is gone.

    Returns counts of added and pruned items.
    """
    # normalize separators, local_path is stored with the OS separator (backslashes on
    # Windows) while rglob paths compare as posix
    known_paths = {i.local_path.replace("\\", "/") for i in ds.items}
    added = 0

    for child in sorted(root.iterdir()):
        if not child.is_dir() or child.name == MANIFEST_DIR:
            continue
        if child.name.lower() in SPLIT_DIRS:
            # class folders live one level down, loose files in the split dir have no
            # class to land in and are skipped
            for cls_dir in sorted(child.iterdir()):
                if cls_dir.is_dir():
                    added += _add_from_folder(ds, root, cls_dir, cls_dir.name, known_paths)
        else:
            added += _add_from_folder(ds, root, child, child.name, known_paths)

    pruned = prune_missing(ds, root, keep=is_binned)

    if added or pruned:
        ds.touch()
        save_dataset(ds, root)
    return {"added": added, "pruned": pruned}
