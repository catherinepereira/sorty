from __future__ import annotations

import threading
from unittest import mock

from sorty.core import GenerateResult, load_dataset
from sorty import generate
from sorty.jobs import JobProgress


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
    return JobProgress(_lock=threading.Lock())


def test_add_images_delegates_to_core(dataset):
    """Sorty's add_images loads the dataset, calls core.add_images with the recycle-bin
    keep predicate and target_total, and returns the result."""
    ds, root = dataset
    sentinel = GenerateResult(records=4, added=4, saved=4, failed=0, dropped=0)

    with mock.patch.object(generate, "core_add_images", return_value=sentinel) as m:
        result = generate.add_images(
            root, ["otter"], ["duckduckgo"], 5, _progress(), target_total=True
        )

    assert result is sentinel
    (args, kwargs) = m.call_args
    assert args[2] == ["otter"] and args[3] == ["duckduckgo"] and args[4] == 5
    assert kwargs["target_total"] is True
    assert kwargs["keep_on_prune"] is generate.is_binned


def test_add_images_fetches_known_subject(dataset):
    """A subject already in the dataset still fetches new images, unlike the old generate
    which skipped known subjects. Pages are deduped against URLs already downloaded."""
    ds, root = dataset

    async def fake_fetch(subjects, sources, limit, offset=0):
        # a fresh URL per page so paging keeps finding new images
        return {
            s: {sources[0]: [{"source": sources[0], "url": f"https://x/{s}/{offset}.jpg"}]}
            for s in subjects
        }

    def ok_download(url, dest, client=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"x")
        return True

    from sorty.core import pipeline

    with mock.patch.object(pipeline, "fetch_all", fake_fetch), mock.patch.object(
        pipeline, "download_file", ok_download
    ):
        result = generate.add_images(root, ["robin"], ["duckduckgo"], 2, _progress())

    assert result.saved == 2  # robin was already a subject, still got 2 new images


def test_add_images_target_total_fetches_only_shortfall(dataset):
    """target_total tops a subject up to the total, fetching only what it lacks. The
    fixture gives robin 3 images, so a target of 5 fetches 2."""
    ds, root = dataset

    async def fake_fetch(subjects, sources, limit, offset=0):
        return {
            s: {sources[0]: [{"source": sources[0], "url": f"https://x/{s}/{offset}.jpg"}]}
            for s in subjects
        }

    def ok_download(url, dest, client=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"x")
        return True

    from sorty.core import pipeline

    with mock.patch.object(pipeline, "fetch_all", fake_fetch), mock.patch.object(
        pipeline, "download_file", ok_download
    ):
        result = generate.add_images(
            root, ["robin"], ["duckduckgo"], 5, _progress(), target_total=True
        )

    assert result.saved == 2


def test_set_subjects_saves_deduped_without_fetch(dataset):
    _, root = dataset
    out = generate.set_subjects(root, ["Owl", "owl ", " Hawk", "Owl"])
    assert out == ["Owl", "Hawk"]
    assert load_dataset(root).subjects == ["Owl", "Hawk"]


def test_set_subjects_creates_empty_folders(dataset):
    """A new class exists as an empty folder on disk even before any image is fetched."""
    from sorty.core import slugify

    _, root = dataset
    generate.set_subjects(root, ["Owl", "Snowy Egret"])
    assert (root / slugify("Owl")).is_dir()
    assert (root / slugify("Snowy Egret")).is_dir()


def test_add_images_defaults_to_all_subjects(dataset):
    """add_images with no subjects targets every subject already in the dataset."""
    _, root = dataset
    seen_targets = []

    def fake_core_add(ds, r, targets, sources, n, **kw):
        seen_targets.append(list(targets))
        return GenerateResult(0, 0, 0, 0, 0)

    with mock.patch.object(generate, "core_add_images", fake_core_add):
        generate.add_images(root, [], ["duckduckgo"], 5, _progress())

    assert set(seen_targets[0]) == {"robin", "sparrow"}
