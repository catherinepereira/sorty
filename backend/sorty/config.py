"""Ports and the workspace root.

The workspace root defaults to the sorty repo root (so datasets/ sits beside backend/),
overridable with SORTY_WORKSPACE. Ports mirror frontend/src/config.ts.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_PORT = 8047
FRONTEND_PORT = 5047

APP_NAME = "Sorty"


def workspace_root() -> Path:
    env = os.environ.get("SORTY_WORKSPACE")
    if env:
        return Path(env)
    # repo root is two levels up from backend/sorty/config.py
    return Path(__file__).resolve().parents[2]
