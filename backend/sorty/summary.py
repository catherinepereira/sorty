"""Dataset summary stats read from the manifest and image files.

Counts per class and per source come from the manifest. Image dimensions and byte sizes
come from the files on disk, since the manifest no longer stores them. Binned items are
excluded so the numbers reflect the live dataset.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from PIL import Image

from sorty.core import Dataset
from sorty.recyclebin import is_binned


def _dimensions(path: Path) -> tuple[int, int] | None:
    """Width and height read from the file header, None if unreadable."""
    try:
        with Image.open(path) as img:
            return img.width, img.height
    except (OSError, Image.DecompressionBombError, Image.UnidentifiedImageError):
        return None


def _size(path: Path) -> int | None:
    try:
        return path.stat().st_size
    except OSError:
        return None


def _safe_path(root: Path, local_path: str) -> Path | None:
    """Resolve local_path under root, None if it escapes the dataset (tampered manifest)."""
    base = root.resolve()
    target = (base / local_path).resolve()
    if base != target and base not in target.parents:
        return None
    return target


def _created_at(path: Path) -> float | None:
    """When the file landed on disk. st_ctime is creation time on Windows."""
    try:
        return path.stat().st_ctime
    except OSError:
        return None


def file_info(root: Path, local_path: str) -> dict:
    """Dimensions, byte size, and ingest time for one image, for the item detail view."""
    path = _safe_path(root, local_path)
    if path is None:
        return {"width": None, "height": None, "bytes": None, "ingested": None}
    dims = _dimensions(path)
    return {
        "width": dims[0] if dims else None,
        "height": dims[1] if dims else None,
        "bytes": _size(path),
        "ingested": _created_at(path),
    }


def summarize(ds: Dataset, root: Path) -> dict:
    """Per-class counts, per-source counts, and total bytes on disk for the live dataset."""
    live = [i for i in ds.items if not is_binned(i)]

    # start every declared class at zero so empty classes still appear, then count items
    per_class: Counter[str] = Counter({s: 0 for s in ds.subjects})
    per_class.update(i.label for i in live)
    per_source = Counter(i.source for i in live)

    bytes_total = 0
    for item in live:
        path = _safe_path(root, item.local_path)
        if path is None:
            continue
        size = _size(path)
        if size is not None:
            bytes_total += size

    return {
        "total": len(live),
        "subjects": len(ds.subjects),
        "per_class": [{"name": name, "count": n} for name, n in sorted(per_class.items())],
        "per_source": [{"name": name, "count": n} for name, n in sorted(per_source.items())],
        "bytes_total": bytes_total,
    }
