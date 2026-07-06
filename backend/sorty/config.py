"""Ports, the workspace root, and the contact email.

The workspace root defaults to the sorty repo root (so datasets/ sits beside backend/),
overridable with SORTY_WORKSPACE. Ports mirror frontend/src/config.ts. A repo-root .env
is loaded on import, and the contact email set through the UI is written back to it.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_PORT = 8047
FRONTEND_PORT = 5047

APP_NAME = "Sorty"

CONTACT_ENV = "SORTY_CONTACT"


def workspace_root() -> Path:
    env = os.environ.get("SORTY_WORKSPACE")
    if env:
        return Path(env)
    # repo root is two levels up from backend/sorty/config.py
    return Path(__file__).resolve().parents[2]


def _env_path() -> Path:
    # the .env belongs to the app install, not the (overridable) workspace
    return Path(__file__).resolve().parents[2] / ".env"


def load_env() -> None:
    """Load KEY=VALUE lines from the repo-root .env, without overriding the process env."""
    path = _env_path()
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


def contact_email() -> str:
    """The contact email sources send in the User-Agent. Empty when unset."""
    email = os.environ.get(CONTACT_ENV, "").strip()
    return "" if email == "unknown" else email


def set_contact_email(email: str) -> None:
    """Set the contact email for this process and persist it to the .env file."""
    os.environ[CONTACT_ENV] = email
    path = _env_path()
    lines: list[str] = []
    if path.exists():
        lines = [
            line
            for line in path.read_text(encoding="utf-8").splitlines()
            if not line.strip().startswith(f"{CONTACT_ENV}=")
        ]
    lines.append(f"{CONTACT_ENV}={email}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


load_env()
