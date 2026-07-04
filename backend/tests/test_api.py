from __future__ import annotations

import shutil
import time
from pathlib import Path
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from sorty import media, workspace


@pytest.fixture
def client(ws_root: Path, monkeypatch):
    monkeypatch.setenv("SORTY_WORKSPACE", str(ws_root))
    media._base_cache.clear()
    workspace.datasets_dir(ws_root)
    from sorty.api import app

    return TestClient(app)


@pytest.fixture
def with_dataset(client, ws_root, dataset):
    """Copy the fixture dataset in as 'birds' so it has real items and files."""
    _, ds_root = dataset
    shutil.copytree(ds_root, workspace.datasets_dir(ws_root) / "birds")
    return client


def _poll(client, job_id, timeout=2.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/api/jobs/{job_id}").json()
        if body["status"] != "running":
            return body
        time.sleep(0.01)
    raise AssertionError("job did not finish")


def test_create_and_list(client):
    assert client.get("/api/datasets").json()["datasets"] == []

    r = client.post("/api/datasets", json={"name": "Pacific NW Birds"})
    assert r.status_code == 201 and r.json()["name"] == "pacific-nw-birds"

    names = [d["name"] for d in client.get("/api/datasets").json()["datasets"]]
    assert names == ["pacific-nw-birds"]


def test_create_rejects_blank_name(client):
    assert client.post("/api/datasets", json={"name": "!!!"}).status_code == 400


def test_get_missing_dataset_404(client):
    assert client.get("/api/datasets/ghost").status_code == 404


def test_get_dataset_lists_live_items(with_dataset):
    body = with_dataset.get("/api/datasets/birds").json()
    assert body["stats"]["total"] == 6
    assert len(body["items"]) == 6
    assert all(i["url"].startswith("/media/") for i in body["items"])


def test_delete_restore_roundtrip(with_dataset):
    items = with_dataset.get("/api/datasets/birds").json()["items"]
    victim = items[0]["id"]

    assert with_dataset.post(
        "/api/datasets/birds/delete", json={"item_ids": [victim]}
    ).json() == {"binned": 1}

    live = with_dataset.get("/api/datasets/birds").json()["items"]
    assert victim not in {i["id"] for i in live}
    binned = with_dataset.get("/api/datasets/birds/bin").json()["items"]
    assert {i["id"] for i in binned} == {victim}

    assert with_dataset.post(
        "/api/datasets/birds/restore", json={"item_ids": [victim]}
    ).json() == {"restored": 1}
    assert with_dataset.get("/api/datasets/birds/bin").json()["items"] == []


def test_empty_bin_is_permanent(with_dataset):
    victim = with_dataset.get("/api/datasets/birds").json()["items"][0]["id"]
    with_dataset.post("/api/datasets/birds/delete", json={"item_ids": [victim]})
    assert with_dataset.post("/api/datasets/birds/empty-bin").json() == {"removed": 1}
    assert with_dataset.get("/api/datasets/birds/bin").json()["items"] == []
    # gone from the manifest entirely, not just the bin
    total = with_dataset.get("/api/datasets/birds").json()["stats"]["total"]
    assert total == 5


def test_relabel_moves_item(with_dataset):
    victim = with_dataset.get("/api/datasets/birds").json()["items"][0]["id"]
    r = with_dataset.post(
        f"/api/datasets/birds/items/{victim}/label", json={"subject": "Barn Owl"}
    )
    assert r.status_code == 200
    assert r.json()["item"]["label"] == "barn-owl"
    assert r.json()["item"]["subject"] == "Barn Owl"


def test_set_status_and_note(with_dataset):
    victim = with_dataset.get("/api/datasets/birds").json()["items"][0]["id"]
    r = with_dataset.post(
        f"/api/datasets/birds/items/{victim}/status", json={"status": "valid"}
    )
    assert r.json()["item"]["status"] == "valid"
    r = with_dataset.post(
        f"/api/datasets/birds/items/{victim}/note", json={"note": "  keep  "}
    )
    assert r.json()["item"]["note"] == "keep"


def test_annotate_missing_item_404(with_dataset):
    r = with_dataset.post(
        "/api/datasets/birds/items/nope/status", json={"status": "valid"}
    )
    assert r.status_code == 404


def test_generate_job_runs_and_reports(with_dataset):
    from sorty.core import GenerateResult
    from sorty import generate

    sentinel = GenerateResult(records=3, added=3, saved=2, failed=1, dropped=1)
    with mock.patch.object(generate, "generate", return_value=sentinel):
        r = with_dataset.post(
            "/api/datasets/birds/generate",
            json={"subjects": ["owl"], "sources": ["duckduckgo"], "limit": 3},
        )
        job_id = r.json()["job_id"]
        body = _poll(with_dataset, job_id)
    assert body["status"] == "done"
    assert body["result"]["saved"] == 2 and body["result"]["dropped"] == 1


def test_generate_needs_subjects_or_prompt(with_dataset):
    r = with_dataset.post(
        "/api/datasets/birds/generate", json={"sources": ["duckduckgo"]}
    )
    assert r.status_code == 400


def test_dedup_exact_runs(with_dataset):
    r = with_dataset.post("/api/datasets/birds/dedup", json={"mode": "exact"})
    body = _poll(with_dataset, r.json()["job_id"])
    assert body["status"] == "done"
    assert "binned" in body["result"]


def test_dedup_rejects_bad_mode(with_dataset):
    r = with_dataset.post("/api/datasets/birds/dedup", json={"mode": "wat"})
    assert r.status_code == 400


def test_infer_without_torch_or_model_errors(with_dataset):
    # no model.pt and torch may be absent; either way this must not 200
    r = with_dataset.post("/api/datasets/birds/infer")
    assert r.status_code == 503 or r.status_code == 400


def test_job_404(client):
    assert client.get("/api/jobs/nope").status_code == 404


def test_media_endpoint_serves_and_refuses(with_dataset):
    item = with_dataset.get("/api/datasets/birds").json()["items"][0]
    assert with_dataset.get(item["url"]).status_code == 200
    assert with_dataset.get("/media/birds/.p2d/manifest.json").status_code == 404
