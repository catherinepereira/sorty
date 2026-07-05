from __future__ import annotations

import threading
from unittest import mock

from sorty import classify
from sorty.jobs import JobProgress


def _progress():
    return JobProgress(_lock=threading.Lock())


def test_crossval_maps_flagged_paths_to_predictions(dataset):
    ds, root = dataset
    flagged_item = ds.items[0]

    def fake_crossval(r, items, *, folds, epochs, on_progress):
        return [
            {
                "path": str((r / flagged_item.local_path).resolve()),
                "true_label": flagged_item.label,
                "predicted": "sparrow",
            }
        ]

    with mock.patch.object(classify, "core_crossval", fake_crossval):
        result = classify.crossval(root, ds, 3, 2, _progress())

    assert len(result) == 1
    m = result[0]
    assert m.item_id == flagged_item.item_id
    assert m.label == flagged_item.label
    assert m.predicted == "sparrow"


def test_crossval_drops_paths_not_in_manifest(dataset):
    ds, root = dataset

    def fake_crossval(r, items, *, folds, epochs, on_progress):
        return [{"path": "C:/nowhere/ghost.png", "true_label": "x", "predicted": "y"}]

    with mock.patch.object(classify, "core_crossval", fake_crossval):
        result = classify.crossval(root, ds, 3, 2, _progress())

    assert result == []
