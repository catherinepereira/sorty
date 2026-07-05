from __future__ import annotations

import json
from pathlib import Path

from sorty.core import load_dataset, save_dataset
from sorty.core.paths import manifest_path


def test_load_migrates_pretty_subjects_to_deduped_slugs(dataset):
    """An older manifest with a display name and its slug for the same class collapses to
    one slug on load, fixing the "Boat Pose" + "boat-pose" duplication a rename left."""
    ds, root = dataset
    save_dataset(ds, root)

    # simulate a pre-slug manifest: pretty names plus a leftover slug entry
    raw = json.loads(manifest_path(root).read_text(encoding="utf-8"))
    raw["subjects"] = ["Robin", "robin", "Sparrow"]
    manifest_path(root).write_text(json.dumps(raw), encoding="utf-8")

    reloaded = load_dataset(root)
    assert reloaded.subjects == ["robin", "sparrow"]


def test_load_ignores_legacy_subject_field_on_items(dataset):
    """Items from an older manifest carry a subject field that the model no longer has.
    Loading drops it instead of failing."""
    ds, root = dataset
    save_dataset(ds, root)

    raw = json.loads(manifest_path(root).read_text(encoding="utf-8"))
    raw["items"][0]["subject"] = "Robin"  # legacy field
    manifest_path(root).write_text(json.dumps(raw), encoding="utf-8")

    reloaded = load_dataset(root)
    assert not hasattr(reloaded.items[0], "subject")
