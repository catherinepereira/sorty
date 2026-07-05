"""Delete and merge whole classes in a dataset.

Both operate on the class label (the slug of the class name), so they catch items
whether their subject field matches or only their label does. Files move through the OS
recycle bin, not a hard unlink, so a mistaken delete or merge is recoverable. Callers
save the dataset afterward.
"""

from __future__ import annotations

from pathlib import Path

from send2trash import send2trash

from sorty.core import Dataset, DatasetItem, slugify


def _class_root(root: Path, label: str) -> Path | None:
    """The class folder, resolved under root. None if label escapes the dataset."""
    base = root.resolve()
    target = (base / label).resolve()
    if base not in target.parents:
        return None
    return target


def _items_for(ds: Dataset, class_name: str) -> list[DatasetItem]:
    label = slugify(class_name)
    return [i for i in ds.items if i.subject == class_name or i.label == label]


def delete_class(ds: Dataset, root: Path, class_name: str) -> int:
    """Remove a class: drop its items from the manifest and trash its folder.

    Returns how many items were removed. The class folder goes to the OS recycle bin,
    so the images can be recovered from there.
    """
    label = slugify(class_name)
    doomed = {i.item_id for i in _items_for(ds, class_name)}
    ds.items = [i for i in ds.items if i.item_id not in doomed]
    ds.subjects = [s for s in ds.subjects if slugify(s) != label]

    folder = _class_root(root, label)
    if folder is not None and folder.exists():
        send2trash(str(folder))
    ds.touch()
    return len(doomed)


def rename_class(ds: Dataset, root: Path, old_name: str, new_name: str) -> int:
    """Rename a class: move its folder and relabel every item to the new name.

    Returns how many items were relabeled. A new name that slugifies to an existing
    different class is rejected, since that would silently merge them. A name that only
    changes casing or spacing (same slug) updates the display name without moving files.
    """
    new_name = new_name.strip()
    new_label = slugify(new_name)
    old_label = slugify(old_name)
    if not new_label:
        raise ValueError("New class name is empty after slugifying.")
    if new_label == old_label:
        # same folder, so update the display name on the subject and its items
        ds.subjects = [new_name if slugify(s) == old_label else s for s in ds.subjects]
        for item in _items_for(ds, old_name):
            item.subject = new_name
        ds.touch()
        return len(_items_for(ds, new_name))

    if any(slugify(s) == new_label for s in ds.subjects):
        raise ValueError(f"A class named {new_name!r} already exists. Merge instead.")

    new_dir = root / new_label
    new_dir.mkdir(parents=True, exist_ok=True)
    moved = 0
    for item in _items_for(ds, old_name):
        old_path = root / item.local_path
        ext = old_path.suffix
        new_rel = Path(new_label) / f"{new_label}_{item.item_id}{ext}"
        if old_path.exists():
            (root / new_rel).parent.mkdir(parents=True, exist_ok=True)
            old_path.replace(root / new_rel)
        item.label = new_label
        item.subject = new_name
        item.local_path = str(new_rel)
        moved += 1

    ds.subjects = [new_name if slugify(s) == old_label else s for s in ds.subjects]
    folder = _class_root(root, old_label)
    if folder is not None and folder.exists():
        send2trash(str(folder))
    ds.touch()
    return moved


def merge_classes(
    ds: Dataset, root: Path, source_names: list[str], target_name: str
) -> int:
    """Fold one or more classes into a target class, moving files and relabeling items.

    Each source item's file moves into the target's folder under a target-labeled name,
    its label and subject become the target's, and its local_path is rewritten. Items are
    deduped by id. Source classes are dropped from the subject list and their now-empty
    folders trashed. The target is created if it is not already a class. Returns how many
    items moved.
    """
    target_label = slugify(target_name)
    if not target_label:
        raise ValueError("Target class is empty after slugifying.")
    if target_name not in ds.subjects:
        ds.subjects.append(target_name)
    target_dir = root / target_label
    target_dir.mkdir(parents=True, exist_ok=True)

    moved = 0
    for source_name in source_names:
        source_label = slugify(source_name)
        if source_label == target_label:
            continue
        for item in _items_for(ds, source_name):
            old_path = root / item.local_path
            ext = old_path.suffix
            new_rel = Path(target_label) / f"{target_label}_{item.item_id}{ext}"
            new_path = root / new_rel
            if old_path.exists():
                new_path.parent.mkdir(parents=True, exist_ok=True)
                old_path.replace(new_path)
            item.label = target_label
            item.subject = target_name
            item.local_path = str(new_rel)
            moved += 1

        ds.subjects = [s for s in ds.subjects if slugify(s) != source_label]
        folder = _class_root(root, source_label)
        if folder is not None and folder.exists():
            send2trash(str(folder))

    # dedupe by id so a merge never leaves two manifest entries pointing at one file
    deduped: list[DatasetItem] = []
    kept: set[str] = set()
    for item in ds.items:
        if item.item_id in kept:
            continue
        kept.add(item.item_id)
        deduped.append(item)
    ds.items = deduped

    ds.touch()
    return moved
