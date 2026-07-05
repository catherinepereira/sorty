from __future__ import annotations

import asyncio
from pathlib import Path
from unittest import mock

import httpx

from sorty.core import Dataset, SourceAdapter, fetch_all, pipeline, register_source
from sorty.core import sources


def test_fetch_all_passes_offset_to_adapter():
    seen = {}

    async def fake(subject, limit, offset):
        seen["offset"] = offset
        return [{"source": "pg", "url": f"https://x/{subject}/{offset}.jpg"}]

    register_source(SourceAdapter(name="pg", description="t", fetch=fake))
    try:
        out = asyncio.run(fetch_all(["cat"], ["pg"], 5, offset=10))
        assert seen["offset"] == 10
        assert out["cat"]["pg"][0]["url"].endswith("/10.jpg")
    finally:
        from sorty.core.sources import REGISTRY

        del REGISTRY["pg"]


def test_openverse_offset_window_straddles_pages(monkeypatch):
    """A window that crosses an Openverse page boundary returns the full slice.

    Openverse caps page_size at 20. Requesting offset=15, limit=20 spans results 15..34,
    which crosses the page-1/page-2 boundary. The fetch must walk both pages.
    """
    PAGE = 20

    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params.get("page", "1"))
        base = (page - 1) * PAGE
        results = [{"url": f"https://img/{base + i}.jpg", "title": str(base + i)} for i in range(PAGE)]
        return httpx.Response(200, json={"results": results})

    transport = httpx.MockTransport(handler)

    class PatchedClient(httpx.AsyncClient):
        def __init__(self, *a, **k):
            k["transport"] = transport
            super().__init__(*a, **k)

    monkeypatch.setattr(sources.httpx, "AsyncClient", PatchedClient)
    out = asyncio.run(sources._fetch_openverse("cat", limit=20, offset=15))
    urls = [r["url"] for r in out]
    assert len(urls) == 20
    assert urls[0] == "https://img/15.jpg"
    assert urls[-1] == "https://img/34.jpg"


def _fresh(tmp_path: Path):
    root = tmp_path / "ds"
    return Dataset(dataset_id="ds", prompt="", subjects=["Otter"], sources=[]), root


def test_add_images_pages_until_enough_new(tmp_path: Path):
    """add_images keeps paging past a page of all-duplicates to reach fresh URLs."""
    ds, root = _fresh(tmp_path)

    # page 0 returns urls 0..2, page 1 returns 3..5, each call keyed by offset
    async def paged_fetch(subjects, sources, limit, offset=0):
        base = offset
        return {
            subjects[0]: {
                "web": [
                    {"source": "web", "url": f"https://x/{base + i}.jpg"}
                    for i in range(limit)
                ]
            }
        }

    def ok_download(url, dest, client=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"x")
        return True

    with mock.patch.object(pipeline, "fetch_all", paged_fetch), mock.patch.object(
        pipeline, "download_file", ok_download
    ):
        first = pipeline.add_images(ds, root, ["Otter"], ["web"], 3)
        assert first.saved == 3
        # a second add pulls the next page, not the same three
        second = pipeline.add_images(ds, root, ["Otter"], ["web"], 3)

    urls = sorted(i.source_url for i in ds.items)
    assert len(urls) == 6
    assert len(set(urls)) == 6
    assert second.saved == 3


def test_add_images_skips_already_known_urls(tmp_path: Path):
    ds, root = _fresh(tmp_path)

    async def same_page(subjects, sources, limit, offset=0):
        # always returns the same 3 urls regardless of offset
        return {
            subjects[0]: {
                "web": [{"source": "web", "url": f"https://x/{i}.jpg"} for i in range(3)]
            }
        }

    def ok_download(url, dest, client=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"x")
        return True

    with mock.patch.object(pipeline, "fetch_all", same_page), mock.patch.object(
        pipeline, "download_file", ok_download
    ):
        pipeline.add_images(ds, root, ["Otter"], ["web"], 3)
        result = pipeline.add_images(ds, root, ["Otter"], ["web"], 3)

    # the source has nothing new, so the second run adds zero
    assert result.saved == 0
    assert len({i.source_url for i in ds.items}) == 3


def test_mixed_targets_do_not_starve_a_small_want_subject(tmp_path: Path):
    """With per-subject targets, a subject whose early results are all duplicates still
    reaches its target from deeper offsets, and does not have its offset stepped by
    another subject's larger want."""

    async def paged_fetch(subjects, sources, limit, offset=0):
        s = subjects[0]
        return {
            s: {"web": [{"source": "web", "url": f"https://x/{s}/{offset + i}.jpg"} for i in range(limit)]}
        }

    # subject A's first 40 URLs are already downloaded, B starts empty
    known = {f"https://x/A/{i}.jpg" for i in range(40)}
    targets = {"A": 3, "B": 3}
    with mock.patch.object(pipeline, "fetch_all", paged_fetch):
        fresh = asyncio.run(pipeline._gather_fresh(targets, ["web"], known))

    from collections import Counter

    by = Counter(i.subject for i in fresh)
    assert by["A"] == 3 and by["B"] == 3


def test_add_images_target_total_tops_up_to_the_total(tmp_path: Path):
    """target_total fetches only the shortfall: a class with 2 images, target 5, gets 3."""
    ds, root = _fresh(tmp_path)

    async def paged_fetch(subjects, sources, limit, offset=0):
        s = subjects[0]
        return {s: {"web": [{"source": "web", "url": f"https://x/{s}/{offset + i}.jpg"} for i in range(limit)]}}

    def ok_download(url, dest, client=None):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"x")
        return True

    with mock.patch.object(pipeline, "fetch_all", paged_fetch), mock.patch.object(
        pipeline, "download_file", ok_download
    ):
        pipeline.add_images(ds, root, ["Otter"], ["web"], 2)  # seed 2
        result = pipeline.add_images(ds, root, ["Otter"], ["web"], 5, target_total=True)

    assert result.saved == 3
    live = [i for i in ds.items if i.deleted_at is None]
    assert len(live) == 5


def test_progress_notes_failed_downloads(tmp_path: Path):
    """When a download fails, the progress message appends the running failure count so
    the saved figure and the attempted figure no longer look out of sync."""
    ds, root = _fresh(tmp_path)

    async def paged_fetch(subjects, sources, limit, offset=0):
        s = subjects[0]
        return {s: {"web": [{"source": "web", "url": f"https://x/{s}/{offset + i}.jpg"} for i in range(limit)]}}

    # every other download fails
    calls = {"n": 0}

    def flaky_download(url, dest, client=None):
        calls["n"] += 1
        if calls["n"] % 2 == 0:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"x")
        return True

    messages: list[str] = []

    def on_progress(p):
        messages.append(p.message)

    with mock.patch.object(pipeline, "fetch_all", paged_fetch), mock.patch.object(
        pipeline, "download_file", flaky_download
    ):
        result = pipeline.add_images(
            ds, root, ["Otter"], ["web"], 4, on_progress=on_progress
        )

    assert result.failed > 0
    assert any("failed to download" in m for m in messages)
