from __future__ import annotations

from pathlib import Path

from PIL import Image

from sorty.core import DatasetItem
from sorty.core.clean import find_duplicate_groups, find_exact_duplicates


def _item(label: str, name: str) -> DatasetItem:
    rel = str(Path(label) / name)
    return DatasetItem(item_id=DatasetItem.make_id(rel), label=label, local_path=rel)


def _write(root: Path, item: DatasetItem, color: tuple[int, int, int]) -> None:
    path = root / item.local_path
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 8), color).save(path)


def test_find_duplicate_groups_returns_whole_group(tmp_path: Path):
    """Two pixel-identical images plus a distinct one, all under the same label.

    find_exact_duplicates flags only the extra copy, but find_duplicate_groups returns
    both members of the identical pair so they can be reviewed together.
    """
    root = tmp_path / "ds"
    a = _item("cat", "a.png")
    b = _item("cat", "b.png")
    c = _item("cat", "c.png")
    _write(root, a, (10, 20, 30))
    _write(root, b, (10, 20, 30))  # identical to a
    _write(root, c, (200, 0, 0))  # distinct
    items = [a, b, c]

    flagged = find_exact_duplicates(items, root)
    assert {i.item_id for i in flagged} == {b.item_id}  # only the extra copy

    groups = find_duplicate_groups(items, root)
    assert len(groups) == 1
    assert {i.item_id for i in groups[0]} == {a.item_id, b.item_id}


def test_no_duplicates_yields_no_groups(tmp_path: Path):
    root = tmp_path / "ds"
    a = _item("cat", "a.png")
    b = _item("cat", "b.png")
    _write(root, a, (1, 2, 3))
    _write(root, b, (4, 5, 6))
    assert find_duplicate_groups([a, b], root) == []
