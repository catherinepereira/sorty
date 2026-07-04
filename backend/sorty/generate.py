"""Generate images into a dataset via prompt2dataset's public API.

Subject resolution and the fetch/download/prune pipeline both live in p2d. Sorty adds a
friendly Ollama-down error and bridges p2d's progress callback to its own Progress.
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
from sorty.core import generate as p2d_generate
from sorty.core.progress import Progress as P2DProgress

from sorty.jobs import JobProgress
from sorty.recyclebin import is_binned

__all__ = ["source_names", "resolve", "generate", "OllamaUnavailable"]


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


def generate(
    root: Path,
    subjects: list[str],
    sources: list[str],
    limit: int,
    progress: JobProgress,
) -> GenerateResult:
    """Fetch and download images for the subjects into the dataset at root.

    Delegates to p2d's headless generate, which merges new subjects, downloads, and
    prunes failed downloads. Binned items are kept through the prune.
    """
    ds = load_dataset(root)

    def on_progress(p: P2DProgress) -> None:
        progress.sync(p.total, p.done, p.message)

    result = p2d_generate(
        ds, root, subjects, sources, limit,
        on_progress=on_progress, keep_on_prune=is_binned,
    )
    save_dataset(ds, root)
    return result
