"""Reconcile the manifest with the image files actually on disk.

Images a user drops straight into a <label>/ folder are added as unknown-source items.
Manifest items whose file has vanished are dropped. Binned items are left alone, their
files live under the recycle bin, not the class folders.
"""

from __future__ import annotations

from pathlib import Path

from sorty.core import MANIFEST_DIR, Dataset, DatasetItem, prune_missing, save_dataset
from sorty.core.download import IMAGE_EXTS
from sorty.recyclebin import is_binned


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
        label = child.name
        for file in sorted(child.rglob("*")):
            if not file.is_file() or file.suffix.lower() not in IMAGE_EXTS:
                continue
            rel = file.relative_to(root).as_posix()
            if rel in known_paths:
                continue
            item_id = DatasetItem.make_id(rel)
            ds.items.append(DatasetItem(
                item_id=item_id,
                label=label,
                source="unknown",
                source_url="",
                local_path=rel,
            ))
            known_paths.add(rel)
            added += 1
            if label not in ds.subjects:
                ds.subjects.append(label)

    pruned = prune_missing(ds, root, keep=is_binned)

    if added or pruned:
        ds.touch()
        save_dataset(ds, root)
    return {"added": added, "pruned": pruned}
