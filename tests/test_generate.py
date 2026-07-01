from __future__ import annotations

import asyncio
from unittest import mock

from prompt2dataset.ingest import load_dataset
from sorty import generate
from sorty.tasks import Progress


def _fake_fetch_factory(counter: list[str]):
    async def fake_fetch_all(subjects, sources, limit):
        counter.extend(subjects)
        return {
            s: {sources[0]: [{"source": sources[0], "url": f"https://example.test/{s}.jpg"}]}
            for s in subjects
        }

    return fake_fetch_all


def _fake_download(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(b"x")
    return True


def _progress():
    return Progress(_loop=asyncio.new_event_loop())


def test_generate_downloads_new_subjects(dataset):
    ds, root = dataset
    fetched: list[str] = []
    with mock.patch.object(generate, "fetch_all", _fake_fetch_factory(fetched)), mock.patch.object(
        generate, "_download_file", _fake_download
    ):
        result = generate.generate(root, ["otter", "seal"], ["duckduckgo"], 5, _progress())

    assert result["saved"] == 2
    assert sorted(fetched) == ["otter", "seal"]
    reloaded = load_dataset(root)
    assert "otter" in reloaded.subjects and "seal" in reloaded.subjects


def test_generate_rerun_skips_known_subjects(dataset):
    ds, root = dataset
    fetched: list[str] = []
    with mock.patch.object(generate, "fetch_all", _fake_fetch_factory(fetched)), mock.patch.object(
        generate, "_download_file", _fake_download
    ):
        generate.generate(root, ["otter"], ["duckduckgo"], 5, _progress())
        fetched.clear()
        # robin and sparrow already exist in the fixture; otter now exists too
        result = generate.generate(
            root, ["robin", "sparrow", "otter"], ["duckduckgo"], 5, _progress()
        )

    # nothing new -> no fetch calls, zero counts
    assert fetched == []
    assert result == {"records": 0, "added": 0, "saved": 0, "failed": 0}
