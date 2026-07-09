"""Serve the Sorty API on localhost:8047."""

from __future__ import annotations

import uvicorn

from sorty.api import app
from sorty.config import BACKEND_PORT

if __name__ == "__main__":
    # no reload: on this setup uvicorn's reloader spawns its worker with the anaconda
    # interpreter instead of the venv, which serves a stale sorty and never sees edits.
    # Serving the app in-process uses the right interpreter, restart after backend edits
    uvicorn.run(app, host="127.0.0.1", port=BACKEND_PORT)
