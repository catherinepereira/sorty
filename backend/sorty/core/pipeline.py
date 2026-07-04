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

# Seconds between downloads, a courtesy to the hosts we fetch from
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
                    subject=subject,
                    source=rec.get("source", "unknown"),
                    source_url=url,
                    title=rec.get("title", ""),
                    local_path=str(Path(label) / f"{label}_{item_id}{ext}"),
                ))
    return items


# How many extra pages add_images scans past the first before giving up on a subject
MAX_ADD_PAGES = 4


async def _gather_fresh(
    subjects: list[str],
    sources: list[str],
    per_subject: int,
    known_urls: set[str],
) -> list[DatasetItem]:
    """Collect up to per_subject new items per subject, paging until each fills or dries.

    One event loop drives every subject. Each page calls fetch_all for all still-hungry
    subjects at once, so subjects and sources fan out concurrently rather than serially.
    """
    seen = set(known_urls)
    found: dict[str, list[DatasetItem]] = {s: [] for s in subjects}
    hungry = list(subjects)

    for page in range(MAX_ADD_PAGES + 1):
        if not hungry:
            break
        offset = page * per_subject
        raw = await fetch_all(hungry, sources, per_subject, offset)
        still_hungry = []
        for subject in hungry:
            page_items = records_to_items({subject: raw.get(subject, {})})
            page_new = [i for i in page_items if i.source_url not in seen]
            if not page_new and page > 0:
                continue  # this subject is dry, drop it from future pages
            for item in page_new:
                if len(found[subject]) >= per_subject:
                    break
                seen.add(item.source_url)
                found[subject].append(item)
            if len(found[subject]) < per_subject:
                still_hungry.append(subject)
        hungry = still_hungry

    fresh: list[DatasetItem] = []
    for subject in subjects:
        fresh.extend(found[subject])
    return fresh


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
            reporter.advance(f"Saved {saved}/{total_target}")
            time.sleep(DOWNLOAD_RATE_LIMIT)
    return saved, failed


def add_images(
    ds: Dataset,
    dataset_root: Path,
    subjects: list[str],
    sources: list[str],
    per_subject: int,
    *,
    on_progress: OnProgress = None,
    keep_on_prune=None,
) -> GenerateResult:
    """Add up to per_subject new images for subjects already in the dataset.

    Unlike generate, this does not skip known subjects. It pages through each source with
    a rising offset, keeps only URLs not already in ds, and downloads until per_subject
    new images land or the sources run dry. subjects not in ds are added first.
    """
    reporter = Reporter(on_progress)
    for s in subjects:
        if s not in ds.subjects:
            ds.subjects.append(s)
    for s in sources:
        if s not in ds.sources:
            ds.sources.append(s)
    for subject in subjects:
        (dataset_root / slugify(subject)).mkdir(parents=True, exist_ok=True)

    known_urls = {i.source_url for i in ds.items}
    reporter.set_message("Searching sources for more images")
    fresh = asyncio.run(
        _gather_fresh(subjects, sources, per_subject, known_urls)
    )

    records = len(fresh)
    reporter.start(max(records, 1), "Downloading new images")
    saved, failed = _download_new(ds, dataset_root, fresh, reporter, records)
    added = saved + failed
    dropped = prune_missing(ds, dataset_root, keep=keep_on_prune)
    save_dataset(ds, dataset_root)
    return GenerateResult(records, added, saved, failed, dropped)


def generate(
    ds: Dataset,
    dataset_root: Path,
    subjects: list[str],
    sources: list[str],
    limit: int,
    *,
    on_progress: OnProgress = None,
    keep_on_prune=None,
) -> GenerateResult:
    """Fetch and download images for subjects into ds, merging into its manifest.

    Only subjects not already in ds are fetched. Items whose download fails are pruned
    so the manifest lists only images on disk. keep_on_prune retains items whose file is
    intentionally elsewhere (a recycle bin). Saves the dataset before returning.
    """
    reporter = Reporter(on_progress)

    new_subjects = [s for s in subjects if s not in ds.subjects]
    ds.subjects += new_subjects
    for s in sources:
        if s not in ds.sources:
            ds.sources.append(s)
    for subject in new_subjects:
        (dataset_root / slugify(subject)).mkdir(parents=True, exist_ok=True)

    if not new_subjects:
        return GenerateResult(0, 0, 0, 0, 0)

    # fetch every subject in one event loop, so fetch_all fans them out concurrently
    reporter.start(1, "Searching sources")
    raw_results = asyncio.run(fetch_all(new_subjects, sources, limit))
    reporter.advance(f"Searched {len(new_subjects)} subjects")

    records = sum(
        len(recs) for src_map in raw_results.values() for recs in src_map.values()
    )
    new_items = records_to_items(raw_results)
    added_ids = set(ds.add_items(new_items))
    added = len(added_ids)

    # only the newly added items need downloading, existing ones are already on disk
    pending = [i for i in ds.items if i.item_id in added_ids]
    reporter.start(max(len(pending), 1), "Downloading images")
    saved = failed = 0
    with httpx.Client(timeout=DOWNLOAD_TIMEOUT) as client:
        for item in pending:
            if download_file(item.source_url, dataset_root / item.local_path, client=client):
                saved += 1
            else:
                failed += 1
            reporter.advance(f"Saved {saved}/{len(pending)}")
            time.sleep(DOWNLOAD_RATE_LIMIT)

    dropped = prune_missing(ds, dataset_root, keep=keep_on_prune)
    save_dataset(ds, dataset_root)
    return GenerateResult(records, added, saved, failed, dropped)
