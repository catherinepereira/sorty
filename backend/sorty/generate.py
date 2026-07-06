"""Generate and add images into a dataset.

Class resolution and the fetch/download/prune pipeline live in sorty.core. This adds a
clear Ollama-down error and bridges the core progress callback to the job's progress.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from sorty.core import (
    GenerateResult,
    load_dataset,
    resolve_subjects,
    save_dataset,
    slugify,
    source_names,
)
from sorty.core import add_images as core_add_images

from sorty.jobs import JobProgress, bridge
from sorty.recyclebin import is_binned

__all__ = [
    "source_names",
    "resolve",
    "add_images",
    "set_subjects",
    "OllamaUnavailable",
]


class OllamaUnavailable(RuntimeError):
    """Subject resolution could not reach the local Ollama model."""


def resolve(
    prompt: str, count: int | None = None, exclude: list[str] | None = None
) -> list[str]:
    """Resolve a prompt to subjects, raising a clear error if Ollama can't be reached.

    count hints how many subjects to return, exclude lists ones already chosen so a
    follow-up call returns only new ones. Only connection and response-shape failures
    become OllamaUnavailable. Other errors propagate so a genuine bug isn't reported as
    a down service.
    """
    try:
        subjects = resolve_subjects(prompt, count=count, exclude=exclude)
    except (httpx.HTTPError, json.JSONDecodeError, ValueError) as exc:
        raise OllamaUnavailable(
            "Could not resolve subjects. Is Ollama running "
            f"(ollama pull qwen2.5:3b-instruct)? [{exc!r}]"
        ) from exc
    if count and count > 0:
        subjects = subjects[:count]
    return subjects


def add_images(
    root: Path,
    subjects: list[str],
    sources: list[str],
    count: int,
    progress: JobProgress,
    *,
    target_total: bool = False,
) -> GenerateResult:
    """Fetch images for the given subjects, adding any not already downloaded.

    count means "add up to count new per subject"; with target_total it means "bring
    each subject up to count total". Empty subjects means every subject in the dataset,
    empty sources means every source it already uses. Binned items survive the prune.
    """
    ds = load_dataset(root)
    targets = subjects or list(ds.subjects)
    result = core_add_images(
        ds, root, targets, sources or list(ds.sources), count,
        target_total=target_total,
        on_progress=bridge(progress), keep_on_prune=is_binned,
    )
    save_dataset(ds, root)
    return result


def set_subjects(root: Path, subjects: list[str]) -> list[str]:
    """Save a class list on the dataset without fetching images, as slugs deduped in order.

    Each class gets an empty folder on disk so it exists before any image is fetched,
    and the summary counts it as a class with zero images rather than dropping it.
    """
    ds = load_dataset(root)
    seen: set[str] = set()
    ordered: list[str] = []
    for s in subjects:
        label = slugify(s)
        if label and label not in seen:
            seen.add(label)
            ordered.append(label)
    ds.subjects = ordered
    for label in ordered:
        (root / label).mkdir(parents=True, exist_ok=True)
    save_dataset(ds, root)
    return ordered
