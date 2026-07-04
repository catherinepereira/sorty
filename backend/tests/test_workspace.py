from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from sorty.core import load_dataset
from sorty import workspace


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
