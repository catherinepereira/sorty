"""The headless generate pipeline: subjects to downloaded, manifested images.

generate() runs fetch, records-to-items, download, and prune with no terminal I/O,
reporting through an optional progress callback. The CLI and any other consumer call it.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from sorty.core.download import DOWNLOAD_TIMEOUT, download_file, extension_for
from sorty.core.ids import slugify
from sorty.core.models import Dataset, DatasetItem
from sorty.core.progress import OnProgress, Reporter
from sorty.core.sources import fetch_all
from sorty.core.store import prune_missing, save_dataset

# Seconds between downloads, a courtesy to the source hosts
DOWNLOAD_RATE_LIMIT = 0.1


@dataclass
class GenerateResult:
    records: int
    added: int
    saved: int
    failed: int
    dropped: int


def records_to_items(raw_results: dict) -> list[DatasetItem]:
    """Flatten fetch_all's nested results into dataset items."""
    items: list[DatasetItem] = []
    for subject, source_map in raw_results.items():
        label = slugify(subject)
        for records in source_map.values():
            for rec in records:
                url = rec.get("url", "")
                if not url:
                    continue
                item_id = DatasetItem.make_id(url)
                ext = extension_for(url)
                items.append(DatasetItem(
                    item_id=item_id,
                    label=label,
                    source=rec.get("source", "unknown"),
                    source_url=url,
                    title=rec.get("title", ""),
                    local_path=str(Path(label) / f"{label}_{item_id}{ext}"),
                ))
    return items


# How many extra pages add_images scans past the first before giving up on a subject
MAX_ADD_PAGES = 4


# cushion added to each fetch window so dedup against known URLs still leaves enough
PAGE_CUSHION = 10


async def _gather_fresh(
    targets: dict[str, int],
    sources: list[str],
    known_urls: set[str],
) -> list[DatasetItem]:
    """Collect up to targets[subject] new items per subject, paging until full or dry.

    Each subject carries its own offset, advanced by how many records it actually
    consumed, so a subject that dedups away most of a page does not skip the results it
    never saw. A target of 0 or less is skipped. Every page fetches all still-hungry
    subjects concurrently.
    """
    seen = set(known_urls)
    found: dict[str, list[DatasetItem]] = {s: [] for s in targets}
    offsets: dict[str, int] = {s: 0 for s in targets}
    hungry = [s for s, want in targets.items() if want > 0]

    for page in range(MAX_ADD_PAGES + 1):
        if not hungry:
            break
        # each subject fetches from its own offset, sized to what it still needs
        wants = {s: targets[s] - len(found[s]) + PAGE_CUSHION for s in hungry}
        raw = await _fetch_at_offsets(hungry, sources, wants, offsets)
        still_hungry = []
        for subject in hungry:
            want = targets[subject]
            page_items = records_to_items({subject: raw.get(subject, {})})
            offsets[subject] += len(page_items)
            if not page_items:
                continue  # the source returned nothing, this subject is exhausted
            for item in page_items:
                if len(found[subject]) >= want:
                    break
                if item.source_url in seen:
                    continue
                seen.add(item.source_url)
                found[subject].append(item)
            if len(found[subject]) < want:
                still_hungry.append(subject)
        hungry = still_hungry

    fresh: list[DatasetItem] = []
    for subject in targets:
        fresh.extend(found[subject])
    return fresh


async def _fetch_at_offsets(
    subjects: list[str],
    sources: list[str],
    wants: dict[str, int],
    offsets: dict[str, int],
) -> dict[str, dict[str, list[dict]]]:
    """fetch_all, but each subject uses its own limit and offset.

    fetch_all shares one limit and offset across subjects, which is wrong once subjects
    page independently. This fans out one fetch_all per subject concurrently and merges
    the nested results.
    """
    results = await asyncio.gather(
        *(fetch_all([s], sources, wants[s], offsets[s]) for s in subjects)
    )
    merged: dict[str, dict[str, list[dict]]] = {}
    for raw in results:
        merged.update(raw)
    return merged


def _live_count(ds: Dataset, subject: str) -> int:
    """Live (not binned) manifest items for a class, matched by slug."""
    label = slugify(subject)
    return sum(1 for i in ds.items if i.deleted_at is None and i.label == label)


def _download_new(
    ds: Dataset,
    dataset_root: Path,
    new_items: list[DatasetItem],
    reporter: Reporter,
    total_target: int,
) -> tuple[int, int]:
    """Add and download items not already in ds, returning (saved, failed)."""
    added_ids = set(ds.add_items(new_items))
    pending = [i for i in ds.items if i.item_id in added_ids]
    saved = failed = 0
    with httpx.Client(timeout=DOWNLOAD_TIMEOUT) as client:
        for item in pending:
            if download_file(item.source_url, dataset_root / item.local_path, client=client):
                saved += 1
            else:
                failed += 1
            note = f" ({failed} failed to download)" if failed else ""
            reporter.advance(f"Saved {saved}/{total_target}{note}")
            time.sleep(DOWNLOAD_RATE_LIMIT)
    return saved, failed


def add_images(
    ds: Dataset,
    dataset_root: Path,
    subjects: list[str],
    sources: list[str],
    count: int,
    *,
    target_total: bool = False,
    on_progress: OnProgress = None,
    keep_on_prune=None,
) -> GenerateResult:
    """Fetch images for the given subjects, adding any not already in the dataset.

    count means "add up to count new images per subject" by default. With target_total,
    it means "bring each subject up to count total", fetching only the shortfall and
    skipping subjects already at or above count. Either way it pages each source with a
    rising offset, keeps only URLs not already in ds, and stops when full or the sources
    run dry. Subjects not in ds are added first.
    """
    reporter = Reporter(on_progress)
    for s in subjects:
        label = slugify(s)
        if label not in ds.subjects:
            ds.subjects.append(label)
        (dataset_root / label).mkdir(parents=True, exist_ok=True)
    for s in sources:
        if s not in ds.sources:
            ds.sources.append(s)

    if target_total:
        targets = {s: max(0, count - _live_count(ds, s)) for s in subjects}
    else:
        targets = {s: count for s in subjects}

    # binned items keep their URL here so a rejected image is never re-suggested. They
    # are excluded from _live_count, so target_total tops up past them. Emptying the bin
    # drops the item, freeing the URL to be fetched again
    known_urls = {i.source_url for i in ds.items}
    reporter.set_message("Searching sources for more images")
    fresh = asyncio.run(_gather_fresh(targets, sources, known_urls))

    records = len(fresh)
    reporter.start(max(records, 1), "Downloading new images")
    saved, failed = _download_new(ds, dataset_root, fresh, reporter, records)
    added = saved + failed
    dropped = prune_missing(ds, dataset_root, keep=keep_on_prune)
    save_dataset(ds, dataset_root)
    return GenerateResult(records, added, saved, failed, dropped)
