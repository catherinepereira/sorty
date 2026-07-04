"""Serve the Sorty API on localhost:8047."""

from __future__ import annotations

import uvicorn

from sorty.config import BACKEND_PORT

if __name__ == "__main__":
    uvicorn.run("sorty.api:app", host="127.0.0.1", port=BACKEND_PORT, reload=True)
