from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from sorty.core import load_dataset
from sorty import workspace


def test_rename_dataset(ws_root: Path):
    workspace.create_dataset(ws_root, "Birds")
    new_root = workspace.rename_dataset(ws_root, "birds", "Waterfowl")
    assert new_root.name == "waterfowl"
    assert load_dataset(new_root).dataset_id == "waterfowl"
    names = [s.name for s in workspace.list_datasets(ws_root)]
    assert names == ["waterfowl"]


def test_rename_refuses_traversal_source(ws_root: Path):
    """A crafted old_name with separators can't escape datasets/, it slugifies first."""
    workspace.create_dataset(ws_root, "Birds")  # ensures datasets/ exists
    # a sibling folder outside datasets/ with a manifest, the traversal target
    outside = ws_root / "secret"
    (outside / ".sorty").mkdir(parents=True)
    (outside / ".sorty" / "manifest.json").write_text("{}")

    with pytest.raises(ValueError):
        workspace.rename_dataset(ws_root, "..\\secret", "stolen")
    with pytest.raises(ValueError):
        workspace.rename_dataset(ws_root, "../secret", "stolen")
    # the outside folder was not moved into datasets/
    assert outside.exists()
    assert not (workspace.datasets_dir(ws_root) / "stolen").exists()


def test_delete_stays_inside_workspace(ws_root: Path):
    """A traversal name slugifies to a plain slug, so it can only ever hit datasets/.

    slugify strips separators, so "../secret" becomes "secret", which the manifest check
    then rejects unless a real dataset by that slug exists. Nothing outside datasets/ is
    reachable.
    """
    outside = ws_root / "secret"
    (outside / ".sorty").mkdir(parents=True)
    (outside / ".sorty" / "manifest.json").write_text("{}")
    with pytest.raises(ValueError):
        workspace.delete_dataset(ws_root, "..\\secret")
    assert outside.exists()  # the real outside folder was never touched


def test_create_and_list(ws_root: Path):
    assert workspace.list_datasets(ws_root) == []

    root = workspace.create_dataset(ws_root, "Pacific NW Birds")
    assert root.name == "pacific-nw-birds"
    assert load_dataset(root).dataset_id == "pacific-nw-birds"

    summaries = workspace.list_datasets(ws_root)
    assert [s.name for s in summaries] == ["pacific-nw-birds"]
    assert summaries[0].total == 0
    assert summaries[0].thumbnail is None


def test_create_rejects_duplicate(ws_root: Path):
    workspace.create_dataset(ws_root, "birds")
    with pytest.raises(ValueError):
        workspace.create_dataset(ws_root, "Birds")  # same slug


def test_create_rejects_blank(ws_root: Path):
    with pytest.raises(ValueError):
        workspace.create_dataset(ws_root, "!!!")


def test_summary_counts_and_thumbnail(ws_root: Path, dataset):
    _, ds_root = dataset
    target = workspace.datasets_dir(ws_root) / "birds"
    shutil.copytree(ds_root, target)

    (summary,) = workspace.list_datasets(ws_root)
    assert summary.total == 6
    assert summary.pending == 6
    assert summary.subjects == 2
    assert summary.thumbnail is not None and summary.thumbnail.exists()
