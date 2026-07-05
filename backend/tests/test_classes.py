from __future__ import annotations

from pathlib import Path

from sorty import classes
from sorty.core import load_dataset


def test_delete_class_removes_items_and_folder(dataset):
    ds, root = dataset
    assert (root / "robin").exists()

    removed = classes.delete_class(ds, root, "robin")

    assert removed == 3
    assert "robin" not in [c for c in ds.subjects]
    assert all(i.label != "robin" for i in ds.items)
    # the folder is trashed, so it no longer sits in the dataset
    assert not (root / "robin").exists()
    # the other class is untouched
    assert sum(1 for i in ds.items if i.label == "sparrow") == 3


def test_delete_missing_class_is_a_noop(dataset):
    ds, root = dataset
    before = len(ds.items)
    removed = classes.delete_class(ds, root, "penguin")
    assert removed == 0
    assert len(ds.items) == before


def test_merge_folds_source_into_target(dataset):
    ds, root = dataset

    moved = classes.merge_classes(ds, root, ["sparrow"], "robin")

    assert moved == 3
    # every item now belongs to robin, on disk and in the manifest
    assert all(i.label == "robin" for i in ds.items)
    assert len([i for i in ds.items if i.label == "robin"]) == 6
    assert "sparrow" not in ds.subjects
    assert not (root / "sparrow").exists()
    for item in ds.items:
        assert (root / item.local_path).exists()
        assert item.local_path.startswith("robin")


def test_merge_into_a_new_target_class(dataset):
    ds, root = dataset

    moved = classes.merge_classes(ds, root, ["robin", "sparrow"], "bird")

    assert moved == 6
    assert "bird" in ds.subjects
    assert "robin" not in ds.subjects and "sparrow" not in ds.subjects
    assert all(i.label == "bird" for i in ds.items)
    assert len(ds.items) == 6


def test_merge_survives_a_reload(dataset):
    """The manifest written after a merge reloads with the moved items intact."""
    ds, root = dataset
    from sorty.core import save_dataset

    classes.merge_classes(ds, root, ["sparrow"], "robin")
    save_dataset(ds, root)

    reloaded = load_dataset(root)
    assert len([i for i in reloaded.items if i.label == "robin"]) == 6
    assert "sparrow" not in reloaded.subjects


def test_rename_class_moves_folder_and_relabels(dataset):
    ds, root = dataset

    moved = classes.rename_class(ds, root, "robin", "American Robin")

    assert moved == 3
    assert "American Robin" in ds.subjects and "robin" not in ds.subjects
    assert not (root / "robin").exists()
    robins = [i for i in ds.items if i.label == "american-robin"]
    assert len(robins) == 3
    for item in robins:
        assert item.subject == "American Robin"
        assert (root / item.local_path).exists()


def test_rename_class_casing_only_keeps_folder(dataset):
    """Renaming to the same slug updates the display name without moving files."""
    ds, root = dataset
    paths_before = {i.item_id: i.local_path for i in ds.items if i.label == "robin"}

    classes.rename_class(ds, root, "robin", "Robin")

    assert "Robin" in ds.subjects
    for i in ds.items:
        if i.item_id in paths_before:
            assert i.local_path == paths_before[i.item_id]
            assert i.subject == "Robin"


def test_rename_onto_existing_class_is_rejected(dataset):
    ds, root = dataset
    try:
        classes.rename_class(ds, root, "robin", "sparrow")
        assert False, "expected ValueError"
    except ValueError:
        pass
    # nothing moved
    assert len([i for i in ds.items if i.label == "robin"]) == 3
    assert len([i for i in ds.items if i.label == "sparrow"]) == 3


def test_delete_class_refuses_path_escape(dataset):
    """A crafted class name that slugifies to an escaping path never trashes outside root."""
    ds, root = dataset
    outside = root.parent / "outside"
    outside.mkdir()
    marker = outside / "keep.txt"
    marker.write_text("x")

    # slugify neutralizes traversal, so this simply matches nothing and touches no files
    classes.delete_class(ds, root, "../outside")

    assert marker.exists()
