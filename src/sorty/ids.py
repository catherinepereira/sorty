"""Slugify labels and names via prompt2dataset, so Sorty's folder layout matches what
p2d writes and reads."""

from __future__ import annotations

from prompt2dataset import slugify

__all__ = ["slugify"]
