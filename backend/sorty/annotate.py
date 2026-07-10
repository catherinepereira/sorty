"""Per-image annotation: status and relabel.

These are thin writes over a DatasetItem. Relabeling also moves the file into the new
label's folder and rewrites local_path so disk and manifest stay in step with the
<label>/<label>_<id>.<ext> layout. Callers save the manifest afterward.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageOps

from sorty.core import Dataset, DatasetItem, ReviewStatus, slugify
from sorty.core.paths import SPLIT_DIRS


def find_item(ds: Dataset, item_id: str) -> DatasetItem:
    for item in ds.items:
        if item.item_id == item_id:
            return item
    raise KeyError(item_id)


def _split_prefix(local_path: str) -> Path:
    """The item's train/test dir when it sits in a <split>/<class>/ layout, else empty."""
    parts = Path(local_path).parts
    if len(parts) >= 3 and parts[0].lower() in SPLIT_DIRS:
        return Path(parts[0])
    return Path()


def item_split(local_path: str) -> str | None:
    """The item's split, normalized so val/, valid/, and validation/ all read as "valid"."""
    prefix = str(_split_prefix(local_path)).lower()
    if not prefix or prefix == ".":
        return None
    return "valid" if prefix in {"val", "validation"} else prefix


def move_items_to_split(
    ds: Dataset, root: Path, item_ids: list[str], split: str | None
) -> int:
    """Move items into a <split>/<class>/ dir, or back to flat <class>/ for None.

    Returns how many moved. Missing ids are skipped so a stale selection does not
    abort the batch.
    """
    if split is not None and split not in {"train", "test", "valid"}:
        raise ValueError(f"Unknown split {split!r}. Choose train, test, or valid.")
    wanted = set(item_ids)
    moved = 0
    for item in ds.items:
        if item.item_id not in wanted or item_split(item.local_path) == split:
            continue
        old_path = root / item.local_path
        new_rel = (Path(split) if split else Path()) / item.label / old_path.name
        new_path = root / new_rel
        new_path.parent.mkdir(parents=True, exist_ok=True)
        if old_path.exists():
            old_path.replace(new_path)
        item.local_path = str(new_rel)
        moved += 1
    if moved:
        ds.touch()
    return moved


def move_item_to_label(root: Path, item: DatasetItem, label: str) -> None:
    """Point an item at a class: move its file into <label>/ and rewrite label + local_path

    The file move and the manifest rewrite happen together so the two never drift. A
    missing source file still gets its label and path rewritten, refresh reconciles later.
    An item under a train/ or test/ dir stays in that split.
    """
    old_path = root / item.local_path
    new_rel = _split_prefix(item.local_path) / label / f"{label}_{item.item_id}{old_path.suffix}"
    new_path = root / new_rel
    new_path.parent.mkdir(parents=True, exist_ok=True)
    if old_path.exists():
        old_path.replace(new_path)
    item.label = label
    item.local_path = str(new_rel)


def duplicate_item(ds: Dataset, root: Path, item_id: str) -> DatasetItem:
    """Copy an item and its file under a new id, e.g. to crop two regions of one photo.

    The copy sits next to the original in the manifest and keeps its class, source,
    status, and prediction. The new id is derived from the original's, salted until it
    collides with nothing.
    """
    source = find_item(ds, item_id)
    src_path = root / source.local_path
    if not src_path.exists():
        raise ValueError("The image file is missing on disk.")

    existing = {i.item_id for i in ds.items}
    n = 1
    while (new_id := DatasetItem.make_id(f"{source.item_id}:copy{n}")) in existing:
        n += 1

    new_rel = (
        _split_prefix(source.local_path)
        / source.label
        / f"{source.label}_{new_id}{src_path.suffix}"
    )
    shutil.copy2(src_path, root / new_rel)
    copy = source.model_copy(
        update={"item_id": new_id, "local_path": str(new_rel), "deleted_at": None}
    )
    ds.items.insert(ds.items.index(source) + 1, copy)
    ds.touch()
    return copy


def crop_item(
    ds: Dataset, root: Path, item_id: str, left: int, top: int, width: int, height: int
) -> None:
    """Crop an item's image file in place to the given pixel box.

    The box must lie fully inside the image. The id, label, and path all stay the same,
    only the file's pixels change.
    """
    item = find_item(ds, item_id)
    path = root / item.local_path
    if not path.exists():
        raise ValueError("The image file is missing on disk.")
    if width < 1 or height < 1:
        raise ValueError("Crop box must be at least 1x1 pixels.")
    with Image.open(path) as raw:
        # browsers show JPEGs with EXIF orientation applied, so the box arrives in
        # rotated coordinates. Bake the rotation in before validating and cropping,
        # or a rotated photo rejects boxes that are visibly inside it
        img = ImageOps.exif_transpose(raw)
        if left < 0 or top < 0 or left + width > img.width or top + height > img.height:
            raise ValueError("Crop box is outside the image.")
        cropped = img.crop((left, top, left + width, top + height))
        cropped.load()
    # JPEG can't hold an alpha or palette mode the source may carry
    if cropped.mode != "RGB" and path.suffix.lower() in {".jpg", ".jpeg"}:
        cropped = cropped.convert("RGB")
    cropped.save(path)
    ds.touch()


def _flip_file(path: Path, axis: str) -> None:
    with Image.open(path) as raw:
        # bake the EXIF orientation in first, so the flip matches what the browser shows
        img = ImageOps.exif_transpose(raw)
        flipped = ImageOps.flip(img) if axis == "x" else ImageOps.mirror(img)
        flipped.load()
    # JPEG can't hold an alpha or palette mode the source may carry
    if flipped.mode != "RGB" and path.suffix.lower() in {".jpg", ".jpeg"}:
        flipped = flipped.convert("RGB")
    flipped.save(path)


def flip_item(ds: Dataset, root: Path, item_id: str, axis: str) -> None:
    """Mirror an item's image file in place.

    axis "y" mirrors left-right (across the vertical axis), "x" flips top-bottom.
    The id, label, and path all stay the same, only the file's pixels change.
    """
    if axis not in {"x", "y"}:
        raise ValueError(f"Unknown axis {axis!r}. Choose x or y.")
    item = find_item(ds, item_id)
    path = root / item.local_path
    if not path.exists():
        raise ValueError("The image file is missing on disk.")
    _flip_file(path, axis)
    ds.touch()


def flip_items(ds: Dataset, root: Path, item_ids: list[str], axis: str) -> int:
    """Mirror many items' image files in place. Returns how many were flipped.

    Missing ids and missing files are skipped rather than raising, so a stale
    selection does not abort the batch.
    """
    if axis not in {"x", "y"}:
        raise ValueError(f"Unknown axis {axis!r}. Choose x or y.")
    wanted = set(item_ids)
    flipped = 0
    for item in ds.items:
        if item.item_id not in wanted:
            continue
        path = root / item.local_path
        if not path.exists():
            continue
        _flip_file(path, axis)
        flipped += 1
    if flipped:
        ds.touch()
    return flipped


def set_status(ds: Dataset, item_id: str, status: ReviewStatus) -> None:
    find_item(ds, item_id).review_status = status
    ds.touch()


def set_status_many(ds: Dataset, item_ids: list[str], status: ReviewStatus) -> int:
    """Set the review status on many items at once. Returns how many were changed."""
    wanted = set(item_ids)
    changed = 0
    for item in ds.items:
        if item.item_id in wanted:
            item.review_status = status
            changed += 1
    if changed:
        ds.touch()
    return changed


def set_label(ds: Dataset, root: Path, item_id: str, new_class: str) -> None:
    """Move an item to a class, keeping the slug label and file layout in step.

    new_class is slugified to the label. When the slug changes, the file moves into the
    new label's folder and the slug joins the dataset's class list if absent.
    """
    item = find_item(ds, item_id)
    label = slugify(new_class.strip())
    if not label:
        raise ValueError("Class is empty after slugifying.")

    if label != item.label:
        move_item_to_label(root, item, label)
        if label not in ds.subjects:
            ds.subjects.append(label)
    ds.touch()


def move_to_class(ds: Dataset, root: Path, item_ids: list[str], subject: str) -> int:
    """Move many items to one class, moving their files. Returns how many moved.

    subject is slugified to the target label, which joins the class list if new. Missing
    ids are skipped rather than raising, so a stale selection does not abort the batch.
    """
    label = slugify(subject.strip())
    if not label:
        raise ValueError("Class is empty after slugifying.")
    if label not in ds.subjects:
        ds.subjects.append(label)

    wanted = set(item_ids)
    moved = 0
    for item in ds.items:
        if item.item_id not in wanted:
            continue
        if label != item.label:
            move_item_to_label(root, item, label)
        moved += 1
    if moved:
        ds.touch()
    return moved
