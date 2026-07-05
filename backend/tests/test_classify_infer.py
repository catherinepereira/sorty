from __future__ import annotations

from sorty import classify


def test_find_mismatches_flags_disagreements(dataset):
    ds, root = dataset
    items = ds.items
    # Predict the first robin as a sparrow, everything else correctly
    predictions = {i.item_id: i.label for i in items}
    predictions[items[0].item_id] = "sparrow"

    mismatches = classify.find_mismatches(items, predictions)

    assert len(mismatches) == 1
    m = mismatches[0]
    assert m.item_id == items[0].item_id
    assert m.label == "robin"
    assert m.predicted == "sparrow"


def test_find_mismatches_skips_missing_predictions(dataset):
    ds, root = dataset
    # No predictions at all -> nothing to compare, no mismatches
    assert classify.find_mismatches(ds.items, {}) == []


def test_candidates_exclude_binned(dataset):
    from sorty import recyclebin

    ds, root = dataset
    binned_id = ds.items[0].item_id
    recyclebin.delete_to_bin(ds, root, [binned_id])

    candidate_ids = {i.item_id for i in classify._candidates(ds, root)}
    assert binned_id not in candidate_ids
    assert len(candidate_ids) == 5
