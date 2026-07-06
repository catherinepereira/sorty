"""Serve the Sorty API on localhost:8047."""

from __future__ import annotations

import os

import uvicorn

from sorty.config import BACKEND_PORT

if __name__ == "__main__":
    # watchfiles' native change notifications never fire on this setup, so the reloader
    # silently serves stale code. Polling detects edits reliably
    os.environ.setdefault("WATCHFILES_FORCE_POLLING", "true")
    uvicorn.run("sorty.api:app", host="127.0.0.1", port=BACKEND_PORT, reload=True)
