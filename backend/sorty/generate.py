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
    source_names,
)
from sorty.core import add_images as core_add_images
from sorty.core import generate as core_generate
from sorty.core.progress import Progress as CoreProgress

from sorty.jobs import JobProgress
from sorty.recyclebin import is_binned

__all__ = [
    "source_names",
    "resolve",
    "generate",
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


def _bridge(progress: JobProgress):
    def on_progress(p: CoreProgress) -> None:
        progress.sync(p.total, p.done, p.message)

    return on_progress


def generate(
    root: Path,
    subjects: list[str],
    sources: list[str],
    limit: int,
    progress: JobProgress,
) -> GenerateResult:
    """Fetch and download images for the subjects into the dataset at root.

    Merges new subjects, downloads, and prunes failed downloads. Binned items are kept
    through the prune. Skips subjects already in the dataset.
    """
    ds = load_dataset(root)
    result = core_generate(
        ds, root, subjects, sources, limit,
        on_progress=_bridge(progress), keep_on_prune=is_binned,
    )
    save_dataset(ds, root)
    return result


def add_images(
    root: Path,
    subjects: list[str],
    sources: list[str],
    per_subject: int,
    progress: JobProgress,
) -> GenerateResult:
    """Add more images to existing subjects, pulling URLs not already downloaded.

    Unlike generate, this does not skip known subjects. subjects empty means every
    subject in the dataset.
    """
    ds = load_dataset(root)
    targets = subjects or list(ds.subjects)
    result = core_add_images(
        ds, root, targets, sources or list(ds.sources), per_subject,
        on_progress=_bridge(progress), keep_on_prune=is_binned,
    )
    save_dataset(ds, root)
    return result


def set_subjects(root: Path, subjects: list[str]) -> list[str]:
    """Save a class list on the dataset without fetching images, deduped in order."""
    ds = load_dataset(root)
    seen: set[str] = set()
    ordered: list[str] = []
    for s in (s.strip() for s in subjects):
        key = s.lower()
        if s and key not in seen:
            seen.add(key)
            ordered.append(s)
    ds.subjects = ordered
    save_dataset(ds, root)
    return ordered
