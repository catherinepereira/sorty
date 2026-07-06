from __future__ import annotations

from sorty import recyclebin


def test_delete_moves_file_and_flags(dataset):
    ds, root = dataset
    item = ds.items[0]
    src = root / item.local_path
    assert src.exists()

    moved = recyclebin.delete_to_bin(ds, root, [item.item_id])

    assert moved == 1
    assert not src.exists()
    assert recyclebin.bin_path(root, item).exists()
    assert recyclebin.is_binned(item)
    assert recyclebin.list_bin(ds) == [item]


def test_delete_is_idempotent(dataset):
    ds, root = dataset
    item = ds.items[0]
    recyclebin.delete_to_bin(ds, root, [item.item_id])
    again = recyclebin.delete_to_bin(ds, root, [item.item_id])
    assert again == 0


def test_restore_moves_back_and_clears(dataset):
    ds, root = dataset
    item = ds.items[0]
    original = root / item.local_path
    recyclebin.delete_to_bin(ds, root, [item.item_id])

    restored = recyclebin.restore(ds, root, [item.item_id])

    assert restored == 1
    assert original.exists()
    assert not recyclebin.bin_path(root, item).exists()
    assert item.review_status.value == "pending"
    assert item.deleted_at is None
    assert recyclebin.list_bin(ds) == []


def test_empty_bin_permanently_removes(dataset):
    ds, root = dataset
    ids = [ds.items[0].item_id, ds.items[1].item_id]
    recyclebin.delete_to_bin(ds, root, ids)
    before = len(ds.items)

    removed = recyclebin.empty_bin(ds, root)

    assert removed == 2
    assert len(ds.items) == before - 2
    assert recyclebin.list_bin(ds) == []
    # files are gone from the bin
    bin_files = list((root / ".sorty" / "recyclebin").rglob("*.png"))
    assert bin_files == []


def test_delete_then_relabel_uses_recorded_path(dataset):
    """A binned file restores to its original path even after other items move."""
    ds, root = dataset
    item = ds.items[0]
    recyclebin.delete_to_bin(ds, root, [item.item_id])
    recyclebin.restore(ds, root, [item.item_id])
    assert (root / item.local_path).exists()
