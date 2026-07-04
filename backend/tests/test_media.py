from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi import HTTPException

from sorty import media, workspace


@pytest.fixture
def served(ws_root: Path, dataset, monkeypatch):
    _, ds_root = dataset
    shutil.copytree(ds_root, workspace.datasets_dir(ws_root) / "smoke")
    monkeypatch.setenv("SORTY_WORKSPACE", str(ws_root))
    media._base_cache.clear()
    # a genuinely nested image, to prove a legitimate subdir path is accepted
    nested = ws_root / "datasets" / "smoke" / "robin" / "sub"
    nested.mkdir(parents=True)
    from PIL import Image

    Image.new("RGB", (4, 4), (0, 0, 0)).save(nested / "deep.png")
    return ws_root


def test_serves_an_image(served):
    rel = "smoke/robin/" + next(
        (served / "datasets" / "smoke" / "robin").glob("*.png")
    ).name
    resolved = media.resolve_image(rel)
    assert resolved.exists() and resolved.suffix == ".png"


def test_serves_nested_subdir_image(served):
    resolved = media.resolve_image("smoke/robin/sub/deep.png")
    assert resolved.is_file()


# Every one of these must be refused. This is the security-critical surface, so the
# battery covers POSIX and Windows traversal, absolute/drive/UNC paths, the base dir
# itself, and non-image files
REJECTED = [
    "smoke/.p2d/manifest.json",     # non-image file inside a dataset
    "smoke/.p2d/labels.csv",        # ditto
    "../pyproject.toml",            # POSIX traversal out of datasets/
    "..\\..\\Windows\\win.ini",     # Windows backslash traversal
    "smoke/robin/../../../README.md",  # traversal back through a valid prefix
    "C:/Windows/win.ini",           # absolute drive path
    "C:\\Windows\\win.ini",         # absolute drive path, backslashes
    "\\\\?\\C:\\Windows\\win.ini",  # extended-length prefix
    "\\\\localhost\\c$\\x.png",     # UNC path
    "",                             # the base dir itself
    ".",                            # the base dir itself
    "smoke/robin",                  # a directory, not a file
]


@pytest.mark.parametrize("rel", REJECTED)
def test_rejects_hostile_paths(served, rel):
    with pytest.raises(HTTPException):
        media.resolve_image(rel)


def test_media_url_rejects_outside_path(served, tmp_path):
    assert media.media_url(tmp_path / "elsewhere.png") == ""
