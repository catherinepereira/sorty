"""Build public/demo/pnw-birds.zip, the dataset new visitors start with

Research-grade iNaturalist photos from Washington, Oregon, and British Columbia,
limited to licenses that allow redistribution. Each item's title credits the
photographer. Ids and paths follow src/local/generate.ts, so the zip imports
like any Sorty export.

    python scripts/build_demo.py
"""

import hashlib
import io
import json
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

SPECIES = {
    "Steller's Jay": "Cyanocitta stelleri",
    "Varied Thrush": "Ixoreus naevius",
    "Spotted Towhee": "Pipilo maculatus",
    "Dark-eyed Junco": "Junco hyemalis",
    "Chestnut-backed Chickadee": "Poecile rufescens",
    "Anna's Hummingbird": "Calypte anna",
    "Northern Flicker": "Colaptes auratus",
    "Bald Eagle": "Haliaeetus leucocephalus",
}
PER_CLASS = 12
MAX_SIDE = 480
PLACES = "46,10,7085"  # Washington, Oregon, British Columbia
LICENSES = {"cc0": "CC0", "cc-by": "CC BY", "cc-by-sa": "CC BY-SA"}
OUT = Path(__file__).resolve().parents[1] / "public" / "demo" / "pnw-birds.zip"
HEADERS = {"User-Agent": "sorty-demo-builder (github.com/catherinepereira/sorty)"}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS)) as resp:
        return resp.read()


def shrink(data: bytes) -> bytes:
    """Re-encode to a 480 px JPEG, about a quarter of iNaturalist's medium size in bytes"""
    image = Image.open(io.BytesIO(data)).convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    image.save(out, "JPEG", quality=80, optimize=True)
    return out.getvalue()


def slugify(text: str) -> str:
    # the subset of src/local/ids.ts slugify these names need
    s = "".join(c for c in text.lower() if c.isalnum() or c in " -")
    return "-".join(s.split())


def observations(taxon: str) -> list[dict]:
    query = urllib.parse.urlencode(
        {
            "taxon_name": taxon,
            "place_id": PLACES,
            "quality_grade": "research",
            "photos": "true",
            "photo_license": ",".join(sorted(LICENSES)),
            "order_by": "votes",
            "per_page": 60,
        }
    )
    return json.loads(get(f"https://api.inaturalist.org/v1/observations?{query}"))["results"]


def main() -> None:
    now = time.time()
    items = []
    files: dict[str, bytes] = {}
    for name, taxon in SPECIES.items():
        label = slugify(name)
        kept = 0
        for obs in observations(taxon):
            photo = next(
                (p for p in obs.get("photos", []) if p.get("license_code") in LICENSES), None
            )
            if not photo:
                continue
            url = photo["url"].replace("/square.", "/medium.")
            item_id = hashlib.sha1(url.encode()).hexdigest()[:12]
            local_path = f"{label}/{label}_{item_id}.jpg"
            if local_path in files:
                continue
            files[local_path] = shrink(get(url))
            user = obs.get("user") or {}
            photographer = user.get("name") or user.get("login") or "an iNaturalist user"
            items.append(
                {
                    "item_id": item_id,
                    "label": label,
                    "local_path": local_path,
                    "source": "inaturalist",
                    "source_url": url,
                    "title": f"{name}, photo by {photographer} ({LICENSES[photo['license_code']]})",
                    "review_status": "pending",
                    "deleted_at": None,
                    "predicted_label": None,
                    "predicted_score": None,
                    "boxes": [],
                }
            )
            kept += 1
            # iNaturalist asks API clients to stay around one request per second
            time.sleep(1)
            if kept == PER_CLASS:
                break
        print(f"{name}: {kept}")

    manifest = {
        "dataset_id": "pnw-birds",
        "prompt": "Common birds of the Pacific Northwest",
        "subjects": [slugify(n) for n in SPECIES],
        "sources": ["inaturalist"],
        "items": items,
        "lock_splits": False,
        "lock_review": False,
        "created_at": now,
        "updated_at": now,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        for path, data in files.items():
            z.writestr(path, data)
        z.writestr(".sorty/manifest.json", json.dumps(manifest, indent=2))
    OUT.write_bytes(buf.getvalue())
    print(f"{len(items)} images, {len(buf.getvalue()) / 1e6:.1f} MB -> {OUT}")


if __name__ == "__main__":
    main()
