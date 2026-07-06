"""Sorty's dataset core: models, storage, image sources, download, and classification.

Vendored from prompt2dataset and evolved in place. Import what you need from sorty.core.
"""

from __future__ import annotations

from sorty.core.classify import (
    SUPPORTED_MODELS,
    Prediction,
    crossval,
    find_mismatches,
    infer,
    model_exists,
    torch_available,
    train,
)
from sorty.core.clean import (
    find_duplicate_groups,
    find_exact_duplicates,
    find_outliers,
)
from sorty.core.download import download_file, extension_for, host_is_public
from sorty.core.ids import slugify
from sorty.core.images import DecodeError, open_rgb
from sorty.core.models import Dataset, DatasetItem, ReviewStatus
from sorty.core.paths import MANIFEST_DIR, has_manifest, manifest_path, meta_dir
from sorty.core.pipeline import GenerateResult, add_images, records_to_items
from sorty.core.progress import OnProgress, Progress, Reporter
from sorty.core.resolver import resolve_subjects
from sorty.core.sources import (
    REGISTRY,
    SourceAdapter,
    fetch_all,
    register_source,
    source_names,
)
from sorty.core.store import load_dataset, prune_missing, save_dataset

__all__ = [
    "Dataset", "DatasetItem", "ReviewStatus",
    "load_dataset", "save_dataset", "prune_missing",
    "slugify", "meta_dir", "has_manifest", "manifest_path", "MANIFEST_DIR",
    "resolve_subjects",
    "REGISTRY", "SourceAdapter", "register_source", "source_names", "fetch_all",
    "download_file", "extension_for", "host_is_public",
    "records_to_items", "add_images", "GenerateResult",
    "find_exact_duplicates", "find_duplicate_groups", "find_outliers",
    "train", "infer", "crossval", "find_mismatches", "Prediction",
    "SUPPORTED_MODELS", "model_exists", "torch_available",
    "DecodeError", "open_rgb",
    "Progress", "OnProgress", "Reporter",
]
