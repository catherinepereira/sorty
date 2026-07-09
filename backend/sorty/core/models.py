from __future__ import annotations

import hashlib
import time
from enum import Enum

from pydantic import BaseModel, Field

# Length of the hex item id. 12 hex chars = 48 bits, enough that collisions across a
# single dataset are vanishingly unlikely.
ID_LENGTH = 12

UNKNOWN_SOURCE = "unknown"


class ReviewStatus(str, Enum):
    pending = "pending"
    valid = "valid"
    invalid = "invalid"


class DatasetItem(BaseModel):
    item_id: str
    # the class this image belongs to, a slug (e.g. "boat-pose"). the UI prettifies it
    label: str
    local_path: str
    source: str = UNKNOWN_SOURCE
    source_url: str = ""
    # the original title the source gave the image, empty for manual or untitled images
    title: str = ""
    review_status: ReviewStatus = ReviewStatus.pending
    # deleted_at is set when an item is in the recycle bin, absent otherwise
    deleted_at: float | None = None
    # the class the cross-validated model predicted, None until a model has run
    predicted_label: str | None = None

    @classmethod
    def make_id(cls, key: str) -> str:
        """A stable id from a source URL or, for manual images, the local path."""
        return hashlib.sha1(key.encode()).hexdigest()[:ID_LENGTH]


class Dataset(BaseModel):
    dataset_id: str
    prompt: str
    # class slugs (e.g. "boat-pose"), the single identity for a class
    subjects: list[str]
    sources: list[str]
    items: list[DatasetItem] = Field(default_factory=list)
    # guard rails: refuse split moves / review-status changes while locked
    lock_splits: bool = False
    lock_review: bool = False
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)

    def touch(self) -> None:
        self.updated_at = time.time()

    def add_items(self, new_items: list[DatasetItem]) -> list[str]:
        """Append items not already present by id, returning the ids actually added."""
        existing = {item.item_id for item in self.items}
        added: list[str] = []
        for item in new_items:
            if item.item_id not in existing:
                self.items.append(item)
                existing.add(item.item_id)
                added.append(item.item_id)
        self.touch()
        return added

    def stats(self) -> dict[str, int]:
        counts: dict[str, int] = {"total": len(self.items), "pending": 0, "valid": 0, "invalid": 0}
        for item in self.items:
            counts[item.review_status.value] += 1
        return counts
