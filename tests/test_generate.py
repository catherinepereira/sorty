from __future__ import annotations

import asyncio
from unittest import mock

from prompt2dataset import GenerateResult, load_dataset
from sorty import generate
from sorty.tasks import Progress


def test_resolve_caps_to_count():
    with mock.patch.object(
        generate, "resolve_subjects", return_value=["a", "b", "c", "d", "e"]
    ):
        assert generate.resolve("x", count=3) == ["a", "b", "c"]


def test_resolve_passes_count_and_exclude_through():
    with mock.patch.object(generate, "resolve_subjects", return_value=["new"]) as m:
        generate.resolve("x", count=4, exclude=["old"])
        _, kwargs = m.call_args
        assert kwargs["count"] == 4 and kwargs["exclude"] == ["old"]


def test_resolve_maps_ollama_failure():
    import httpx

    with mock.patch.object(
        generate, "resolve_subjects", side_effect=httpx.ConnectError("refused")
    ):
        try:
            generate.resolve("x")
            assert False, "expected OllamaUnavailable"
        except generate.OllamaUnavailable:
            pass


def _progress():
    return Progress(_loop=asyncio.new_event_loop())


def test_generate_delegates_to_p2d(dataset):
    """Sorty's generate is a thin wrapper: it loads the dataset, calls p2d.generate with
    the recycle-bin keep predicate, and returns the result."""
    ds, root = dataset
    sentinel = GenerateResult(records=4, added=4, saved=4, failed=0, dropped=0)

    with mock.patch.object(generate, "p2d_generate", return_value=sentinel) as m:
        result = generate.generate(root, ["otter"], ["duckduckgo"], 5, _progress())

    assert result is sentinel
    (args, kwargs) = m.call_args
    assert args[2] == ["otter"] and args[3] == ["duckduckgo"] and args[4] == 5
    assert kwargs["keep_on_prune"] is generate.is_binned


def test_generate_end_to_end_through_p2d(dataset):
    """With p2d's fetch and download mocked, the whole path produces a saved manifest."""
    ds, root = dataset

    async def fake_fetch(subjects, sources, limit):
        return {s: {sources[0]: [{"source": sources[0], "url": f"https://x/{s}.jpg"}]} for s in subjects}

    def ok_download(url, dest, client=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"x")
        return True

    from prompt2dataset import pipeline

    with mock.patch.object(pipeline, "fetch_all", fake_fetch), mock.patch.object(
        pipeline, "download_file", ok_download
    ):
        result = generate.generate(root, ["otter"], ["duckduckgo"], 3, _progress())

    assert result.saved == 1
    assert "otter" in load_dataset(root).subjects
