"""Serve dataset images without exposing anything else under the workspace.

Images live outside the package under datasets/. resolve_image maps a request path to a
file, refusing traversal, absolute/UNC paths, non-image files, and the base dir itself,
so a manifest or a crafted path can't be read through the media route.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException

from sorty.config import workspace_root
from sorty.workspace import datasets_path

MEDIA_PREFIX = "/media"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

_base_cache: dict[Path, Path] = {}


def datasets_base() -> Path:
    """Resolved datasets/ path, cached per workspace root so a grid render doesn't
    realpath the same base once per image."""
    root = workspace_root()
    cached = _base_cache.get(root)
    if cached is None:
        cached = datasets_path(root).resolve()
        _base_cache[root] = cached
    return cached


def media_url(path: Path) -> str:
    """URL for an image under datasets/. Empty string for anything outside it."""
    base = datasets_base()
    try:
        rel = path.resolve().relative_to(base)
    except ValueError:
        return ""
    return f"{MEDIA_PREFIX}/{quote(rel.as_posix())}"


def resolve_image(rel: str) -> Path:
    """Map a media request to a file, refusing traversal and non-image paths."""
    base = datasets_base()
    target = (base / rel).resolve()
    if base not in target.parents:
        raise HTTPException(status_code=404)
    if target.suffix.lower() not in IMAGE_EXTS or not target.is_file():
        raise HTTPException(status_code=404)
    return target
