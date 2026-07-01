from __future__ import annotations

import asyncio
from unittest import mock

from sorty import classify
from sorty.tasks import Progress


def _progress():
    return Progress(_loop=asyncio.new_event_loop())


def test_crossval_maps_flagged_paths_to_mismatches(dataset):
    ds, root = dataset
    ds.items[0].subject = "American Robin"
    flagged_item = ds.items[0]

    def fake_crossval(r, items, folds, epochs, img_size):
        return [
            {
                "path": str((r / flagged_item.local_path).resolve()),
                "true_label": flagged_item.label,
                "predicted": "sparrow",
            }
        ]

    with mock.patch("prompt2dataset.crossval._crossval", fake_crossval):
        result = classify.crossval(root, ds, 3, 2, _progress())

    assert len(result) == 1
    m = result[0]
    assert m.item_id == flagged_item.item_id
    assert m.subject == "American Robin"
    assert m.predicted == "sparrow"


def test_crossval_drops_paths_not_in_manifest(dataset):
    ds, root = dataset

    def fake_crossval(r, items, folds, epochs, img_size):
        return [{"path": "C:/nowhere/ghost.png", "true_label": "x", "predicted": "y"}]

    with mock.patch("prompt2dataset.crossval._crossval", fake_crossval):
        result = classify.crossval(root, ds, 3, 2, _progress())

    assert result == []
