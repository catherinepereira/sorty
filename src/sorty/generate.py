"""Generate images into a dataset, reusing prompt2dataset's pipeline.

resolve_subjects (Ollama) -> fetch_all (sources) -> records to items -> download.
The download step reuses p2d's SSRF-guarded _download_file so hostile or internal
URLs are refused the same way the CLI refuses them.
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

import httpx

from prompt2dataset.ingest import (
    DOWNLOAD_RATE_LIMIT,
    _download_file,
    _records_to_items,
    load_dataset,
    save_dataset,
)
from prompt2dataset.models import Dataset
from prompt2dataset.resolver import resolve_subjects
from prompt2dataset.sources import REGISTRY, fetch_all

from sorty.ids import slugify
from sorty.tasks import Progress


def source_names() -> list[str]:
    return list(REGISTRY.keys())


class OllamaUnavailable(RuntimeError):
    """Subject resolution could not reach the local Ollama model."""


def resolve(prompt: str) -> list[str]:
    """Resolve a prompt to subjects, raising a clear error if Ollama can't be reached.

    Only connection and response-shape failures become OllamaUnavailable. Other errors
    propagate so a genuine bug isn't reported as a down service.
    """
    try:
        return resolve_subjects(prompt)
    except (httpx.HTTPError, json.JSONDecodeError, ValueError) as exc:
        raise OllamaUnavailable(
            "Could not resolve subjects. Is Ollama running "
            f"(ollama pull qwen2.5:3b-instruct)? [{exc!r}]"
        ) from exc


def generate(
    root: Path,
    subjects: list[str],
    sources: list[str],
    limit: int,
    progress: Progress,
) -> dict[str, int]:
    """Fetch and download images for the given subjects into the dataset at root.

    Returns counts: {"records", "added", "saved", "failed"}. New subjects and sources
    are merged into the existing manifest; images already on disk are not re-fetched.
    """
    ds: Dataset = load_dataset(root)

    # Fetch only subjects not already in the dataset, matching p2d's _run_add.
    # A re-run with the same prompt then does no network work
    new_subjects = [s for s in subjects if s not in ds.subjects]
    ds.subjects += new_subjects
    for s in sources:
        if s not in ds.sources:
            ds.sources.append(s)
    for subject in new_subjects:
        (root / slugify(subject)).mkdir(parents=True, exist_ok=True)

    if not new_subjects:
        return {"records": 0, "added": 0, "saved": 0, "failed": 0}

    progress.start(total=len(new_subjects), message="Searching sources")
    raw_results: dict = {}
    for subject in new_subjects:
        partial = asyncio.run(fetch_all([subject], sources, limit))
        raw_results.update(partial)
        progress.advance(message=f"Searched {subject}")

    records = sum(
        len(recs) for src_map in raw_results.values() for recs in src_map.values()
    )
    new_items = _records_to_items(raw_results)
    added = ds.add_items(new_items)

    pending = [i for i in ds.items if not (root / i.local_path).exists()]
    progress.start(total=max(len(pending), 1), message="Downloading images")
    saved = failed = 0
    for item in pending:
        dest = root / item.local_path
        if _download_file(item.source_url, dest):
            saved += 1
        else:
            failed += 1
        progress.advance(message=f"Saved {saved}/{len(pending)}")
        time.sleep(DOWNLOAD_RATE_LIMIT)

    save_dataset(ds, root)
    return {"records": records, "added": added, "saved": saved, "failed": failed}
