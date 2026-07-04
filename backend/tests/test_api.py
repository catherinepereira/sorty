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
    assert with_dataset.get("/media/birds/.sorty/manifest.json").status_code == 404


# ----- new feature routes -----

def test_item_view_carries_detail_fields(with_dataset):
    item = with_dataset.get("/api/datasets/birds").json()["items"][0]
    assert item["source"] == "test"
    assert item["source_url"].startswith("https://")
    assert item["filename"].endswith(".png")
    assert item["directory"] in ("robin", "sparrow")
    assert item["local_path"].endswith(item["filename"])


def test_item_detail_reads_dimensions_from_file(with_dataset):
    listed = with_dataset.get("/api/datasets/birds").json()["items"][0]
    detail = with_dataset.get(f"/api/datasets/birds/items/{listed['id']}").json()
    # conftest images are 8x8 PNGs, dimensions come from the file, not the manifest
    assert detail["width"] == 8 and detail["height"] == 8
    assert detail["bytes"] > 0
    assert detail["source"] == "test"


def test_item_detail_404(with_dataset):
    assert with_dataset.get("/api/datasets/birds/items/nope").status_code == 404


def test_item_detail_refuses_tampered_local_path(with_dataset, ws_root):
    """A hand-edited manifest local_path pointing outside the dataset leaks nothing."""
    from sorty.core import load_dataset, save_dataset

    root = workspace.datasets_dir(ws_root) / "birds"
    # a secret file above the dataset the traversal would target
    (ws_root / "secret.txt").write_text("classified")
    ds = load_dataset(root)
    ds.items[0].local_path = "..\\..\\secret.txt"
    save_dataset(ds, root)

    detail = with_dataset.get(
        f"/api/datasets/birds/items/{ds.items[0].item_id}"
    ).json()
    # the guard nulls the out-of-tree read, no size or dimensions leak
    assert detail["bytes"] is None
    assert detail["width"] is None and detail["height"] is None
    # summary skips it too, so bytes_total does not count the secret file
    summ = with_dataset.get("/api/datasets/birds/summary").json()
    assert summ["total"] == 6


def test_refresh_adds_orphan_and_prunes_missing(with_dataset, ws_root):
    from PIL import Image

    root = workspace.datasets_dir(ws_root) / "birds"
    # drop a new image into an existing class folder, not in the manifest
    Image.new("RGB", (8, 8), (0, 255, 0)).save(root / "robin" / "manual_add.png")
    # and delete a file that the manifest still lists
    victim = with_dataset.get("/api/datasets/birds").json()["items"][0]
    (root / victim["local_path"]).unlink()

    r = with_dataset.post("/api/datasets/birds/refresh").json()
    assert r["added"] == 1
    assert r["pruned"] == 1

    items = with_dataset.get("/api/datasets/birds").json()["items"]
    filenames = {i["filename"] for i in items}
    assert "manual_add.png" in filenames
    added = next(i for i in items if i["filename"] == "manual_add.png")
    assert added["source"] == "unknown"
    assert victim["id"] not in {i["id"] for i in items}


def test_rename_dataset(with_dataset):
    r = with_dataset.patch("/api/datasets/birds", json={"name": "Waterfowl"})
    assert r.status_code == 200 and r.json()["name"] == "waterfowl"
    assert with_dataset.get("/api/datasets/birds").status_code == 404
    assert with_dataset.get("/api/datasets/waterfowl").status_code == 200


def test_rename_rejects_collision(with_dataset, ws_root):
    workspace.create_dataset(ws_root, "Other")
    r = with_dataset.patch("/api/datasets/birds", json={"name": "Other"})
    assert r.status_code == 400


def test_delete_dataset_removes_it(with_dataset):
    assert with_dataset.delete("/api/datasets/birds").json() == {"deleted": True}
    assert with_dataset.get("/api/datasets/birds").status_code == 404


def test_delete_missing_dataset_404(client):
    assert client.delete("/api/datasets/ghost").status_code == 404


def test_set_subjects(with_dataset):
    r = with_dataset.post(
        "/api/datasets/birds/subjects", json={"subjects": ["Owl", "owl", "Hawk"]}
    )
    assert r.status_code == 200
    assert r.json()["subjects"] == ["Owl", "Hawk"]
    assert with_dataset.get("/api/datasets/birds").json()["subjects"] == ["Owl", "Hawk"]


def test_delete_by_source_bins_items(with_dataset):
    before = with_dataset.get("/api/datasets/birds").json()["stats"]["total"]
    r = with_dataset.post("/api/datasets/birds/delete-source", json={"source": "test"})
    assert r.json()["binned"] == before
    # all live items came from 'test', so the live grid is now empty and the bin holds them
    assert with_dataset.get("/api/datasets/birds").json()["items"] == []
    assert len(with_dataset.get("/api/datasets/birds/bin").json()["items"]) == before


def test_delete_by_unknown_source_bins_nothing(with_dataset):
    r = with_dataset.post("/api/datasets/birds/delete-source", json={"source": "nope"})
    assert r.json()["binned"] == 0


def test_summary_reports_per_class_and_sizes(with_dataset):
    s = with_dataset.get("/api/datasets/birds/summary").json()
    assert s["total"] == 6
    names = {c["name"] for c in s["per_class"]}
    assert names == {"robin", "sparrow"}
    assert all(c["count"] == 3 for c in s["per_class"])
    assert s["per_source"] == [{"name": "test", "count": 6}]
    # conftest images are 8x8 PNGs with no recorded meta size, read from the file
    assert s["image_sizes"]["max_width"] == 8


def test_add_images_job(with_dataset):
    from sorty.core import GenerateResult
    from sorty import generate

    sentinel = GenerateResult(records=2, added=2, saved=2, failed=0, dropped=0)
    with mock.patch.object(generate, "add_images", return_value=sentinel):
        r = with_dataset.post(
            "/api/datasets/birds/add-images",
            json={"subjects": ["robin"], "sources": ["duckduckgo"], "per_subject": 2},
        )
        body = _poll(with_dataset, r.json()["job_id"])
    assert body["status"] == "done"
    assert body["result"]["saved"] == 2
