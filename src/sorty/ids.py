"""Slugify labels and names the same way prompt2dataset does, so Sorty's folder
layout matches what p2d writes and reads."""

from __future__ import annotations

from prompt2dataset.ingest import _slug


def slugify(text: str) -> str:
    return _slug(text)
