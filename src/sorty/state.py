"""App-wide paths and image serving.

The workspace root defaults to the Sorty project folder (so datasets/ sits beside
run.py), overridable with SORTY_WORKSPACE. Dataset images live outside the package and
are served through a route that resolves each request under datasets/ and serves only
image files, so a manifest or a crafted path can't be fetched through it.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException
from fastapi.responses import FileResponse

from sorty.workspace import datasets_path

_MEDIA_PREFIX = "/media"
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def workspace_root() -> Path:
    env = os.environ.get("SORTY_WORKSPACE")
    if env:
        return Path(env)
    # project root is two levels up from this file (src/sorty/state.py)
    return Path(__file__).resolve().parents[2]


def _datasets_base() -> Path:
    """Resolved datasets/ path, cached per workspace root so a grid render doesn't
    realpath the same constant base once per image."""
    root = workspace_root()
    cached = _datasets_base_cache.get(root)
    if cached is None:
        cached = datasets_path(root).resolve()
        _datasets_base_cache[root] = cached
    return cached


_datasets_base_cache: dict[Path, Path] = {}


def media_url(path: Path) -> str:
    """URL for an image under datasets/. Empty string for anything outside it."""
    base = _datasets_base()
    try:
        rel = path.resolve().relative_to(base)
    except ValueError:
        return ""
    return f"{_MEDIA_PREFIX}/{quote(rel.as_posix())}"


def _resolve_image(rel: str) -> Path:
    """Map a media request to a file, refusing traversal and non-image paths."""
    base = _datasets_base()
    target = (base / rel).resolve()
    if base not in target.parents:
        raise HTTPException(status_code=404)
    if target.suffix.lower() not in _IMAGE_EXTS or not target.is_file():
        raise HTTPException(status_code=404)
    return target


def register_media(app) -> None:
    """Register the /media/{path} route that serves dataset images."""

    @app.get(_MEDIA_PREFIX + "/{rel:path}")
    def _serve(rel: str) -> FileResponse:
        return FileResponse(_resolve_image(rel))
