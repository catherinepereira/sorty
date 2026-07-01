"""Shared fixtures: a temporary prompt2dataset dataset with generated images.

No network and no torch. Images are tiny solid-color PNGs written with PIL, and the
manifest is built straight from the p2d models.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from prompt2dataset import Dataset, DatasetItem, save_dataset


def _write_png(path: Path, color: tuple[int, int, int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color).save(path)


def _item(label: str, n: int, color: tuple[int, int, int]) -> DatasetItem:
    url = f"https://example.test/{label}/{n}.png"
    item_id = DatasetItem.make_id(url)
    return DatasetItem(
        item_id=item_id,
        label=label,
        source_url=url,
        local_path=str(Path(label) / f"{label}_{item_id}.png"),
        meta={"source": "test"},
    )


@pytest.fixture
def ws_root(tmp_path: Path) -> Path:
    """An empty Sorty workspace root."""
    return tmp_path / "ws"


@pytest.fixture
def dataset(tmp_path: Path) -> tuple[Dataset, Path]:
    """A populated dataset: two labels, three images each, files on disk."""
    root = tmp_path / "ds"
    palette = {
        "robin": (200, 40, 40),
        "sparrow": (40, 120, 200),
    }
    items: list[DatasetItem] = []
    for label, color in palette.items():
        for n in range(3):
            it = _item(label, n, color)
            _write_png(root / it.local_path, color)
            items.append(it)
    ds = Dataset(
        dataset_id="ds",
        prompt="birds",
        subjects=list(palette),
        sources=["test"],
        items=items,
    )
    save_dataset(ds, root)
    return ds, root
