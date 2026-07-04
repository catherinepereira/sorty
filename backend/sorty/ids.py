"""Re-export the core slugifier so the folder layout matches what the store writes and reads."""

from __future__ import annotations

from sorty.core import slugify

__all__ = ["slugify"]
