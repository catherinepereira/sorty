from __future__ import annotations

from sorty import summary


def test_per_class_includes_empty_classes(dataset):
    """A declared class with no images shows up at count 0, so the per-class list length
    matches the subjects count instead of dropping empty classes."""
    ds, root = dataset
    ds.subjects = [*ds.subjects, "owl"]  # declared but never fetched

    out = summary.summarize(ds, root)

    names = {c["name"]: c["count"] for c in out["per_class"]}
    assert names == {"robin": 3, "sparrow": 3, "owl": 0}
    assert out["subjects"] == len(out["per_class"]) == 3
