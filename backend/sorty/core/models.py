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
    label: str
    local_path: str
    # the class name the label was slugified from, shown in the UI
    subject: str = ""
    source: str = UNKNOWN_SOURCE
    source_url: str = ""
    # the original title the source gave the image, empty for manual or untitled images
    title: str = ""
    review_status: ReviewStatus = ReviewStatus.pending
    # user-written note, kept out of the derived fields since it can't be recomputed
    note: str = ""
    # deleted_at is set when an item is in the recycle bin, absent otherwise
    deleted_at: float | None = None

    @classmethod
    def make_id(cls, key: str) -> str:
        """A stable id from a source URL or, for manual images, the local path."""
        return hashlib.sha1(key.encode()).hexdigest()[:ID_LENGTH]


class Dataset(BaseModel):
    dataset_id: str
    prompt: str
    subjects: list[str]
    sources: list[str]
    items: list[DatasetItem] = Field(default_factory=list)
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

    def pending_review(self) -> list[DatasetItem]:
        return [i for i in self.items if i.review_status == ReviewStatus.pending]

    def stats(self) -> dict[str, int]:
        counts: dict[str, int] = {"total": len(self.items), "pending": 0, "valid": 0, "invalid": 0}
        for item in self.items:
            counts[item.review_status.value] += 1
        return counts
