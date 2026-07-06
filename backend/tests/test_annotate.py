from __future__ import annotations

import pytest

from sorty.core import ReviewStatus
from sorty import annotate


def test_set_status(dataset):
    ds, root = dataset
    item = ds.items[0]
    annotate.set_status(ds, item.item_id, ReviewStatus.valid)
    assert item.review_status == ReviewStatus.valid


def test_set_status_many(dataset):
    ds, root = dataset
    ids = [i.item_id for i in ds.items[:2]]
    changed = annotate.set_status_many(ds, ids, ReviewStatus.valid)
    assert changed == 2
    assert all(
        i.review_status == ReviewStatus.valid for i in ds.items if i.item_id in ids
    )


def test_relabel_moves_file_and_updates_manifest(dataset):
    ds, root = dataset
    item = ds.items[0]
    old_path = root / item.local_path
    assert old_path.exists()

    annotate.set_label(ds, root, item.item_id, "Blue Jay")

    assert item.label == "blue-jay"
    new_path = root / item.local_path
    assert new_path.exists()
    assert not old_path.exists()
    assert "blue-jay" in ds.subjects
    # id is preserved so the manifest item is still addressable
    assert item.item_id in item.local_path


def test_relabel_same_slug_keeps_file(dataset):
    ds, root = dataset
    item = ds.items[0]
    before = item.local_path
    # a casing edit reslugs to the same label, so the file stays put
    annotate.set_label(ds, root, item.item_id, "ROBIN")
    assert item.local_path == before
    assert item.label == "robin"


def test_missing_item_raises(dataset):
    ds, root = dataset
    with pytest.raises(KeyError):
        annotate.set_status(ds, "nope", ReviewStatus.valid)


def test_crop_rewrites_file_in_place(dataset):
    from PIL import Image

    ds, root = dataset
    item = ds.items[0]
    path = root / item.local_path

    annotate.crop_item(ds, root, item.item_id, 2, 1, 4, 3)

    with Image.open(path) as img:
        assert (img.width, img.height) == (4, 3)
    # the crop touches only pixels, not identity
    assert item.item_id in item.local_path
    assert item.label == "robin"


def test_crop_rejects_box_outside_image(dataset):
    ds, root = dataset
    item = ds.items[0]
    # fixture images are 8x8
    with pytest.raises(ValueError):
        annotate.crop_item(ds, root, item.item_id, 4, 4, 8, 8)
    with pytest.raises(ValueError):
        annotate.crop_item(ds, root, item.item_id, 0, 0, 0, 5)


def test_duplicate_creates_new_id_and_file(dataset):
    ds, root = dataset
    source = ds.items[0]
    before = len(ds.items)

    copy = annotate.duplicate_item(ds, root, source.item_id)

    assert copy.item_id != source.item_id
    assert copy.label == source.label
    assert copy.source_url == source.source_url
    assert (root / copy.local_path).exists()
    assert (root / source.local_path).exists()
    assert len(ds.items) == before + 1
    # the copy sits right after the original, so the grid shows them together
    assert ds.items.index(copy) == ds.items.index(source) + 1

    # duplicating again picks yet another id
    second = annotate.duplicate_item(ds, root, source.item_id)
    assert second.item_id not in {source.item_id, copy.item_id}


def test_crop_respects_exif_orientation(dataset):
    """A rotated JPEG is cropped in the orientation the browser showed it in."""
    from PIL import Image

    ds, root = dataset
    item = ds.items[0]
    path = (root / item.local_path).with_suffix(".jpg")
    (root / item.local_path).unlink()
    item.local_path = str(path.relative_to(root))
    # stored 8x6, EXIF orientation 6 (90° CW), so the browser shows it as 6x8
    exif = Image.Exif()
    exif[274] = 6
    Image.new("RGB", (8, 6), (200, 40, 40)).save(path, format="JPEG", exif=exif.tobytes())

    # this box only fits the displayed (6x8) orientation, not the raw 8x6 pixels
    annotate.crop_item(ds, root, item.item_id, 1, 1, 4, 6)

    with Image.open(path) as img:
        assert (img.width, img.height) == (4, 6)
