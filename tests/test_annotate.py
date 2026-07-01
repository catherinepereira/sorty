from __future__ import annotations

import pytest

from prompt2dataset.models import ReviewStatus
from sorty import annotate


def test_set_status(dataset):
    ds, root = dataset
    item = ds.items[0]
    annotate.set_status(ds, item.item_id, ReviewStatus.valid)
    assert item.review_status == ReviewStatus.valid


def test_set_note_add_and_clear(dataset):
    ds, root = dataset
    item = ds.items[0]
    annotate.set_note(ds, item.item_id, "  blurry  ")
    assert item.meta["note"] == "blurry"
    annotate.set_note(ds, item.item_id, "   ")
    assert "note" not in item.meta


def test_relabel_moves_file_and_updates_manifest(dataset):
    ds, root = dataset
    item = ds.items[0]
    old_path = root / item.local_path
    assert old_path.exists()

    annotate.set_label(ds, root, item.item_id, "Blue Jay")

    assert item.label == "blue-jay"
    assert item.subject == "Blue Jay"
    new_path = root / item.local_path
    assert new_path.exists()
    assert not old_path.exists()
    assert "blue-jay" in ds.subjects
    # id is preserved so the manifest item is still addressable
    assert item.item_id in item.local_path


def test_relabel_same_slug_updates_subject_without_moving(dataset):
    ds, root = dataset
    item = ds.items[0]
    before = item.local_path
    # a casing edit reslugs to the same label, so the file stays put
    annotate.set_label(ds, root, item.item_id, "ROBIN")
    assert item.local_path == before
    assert item.label == "robin"
    assert item.subject == "ROBIN"


def test_missing_item_raises(dataset):
    ds, root = dataset
    with pytest.raises(KeyError):
        annotate.set_status(ds, "nope", ReviewStatus.valid)
