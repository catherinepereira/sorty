"""Sorty's look: a soft palette, rounded cards, and an inline SVG robot mascot.

The mascot is an inline SVG so there's no binary asset to ship. mascot() returns
markup for a given mood, used in headers and progress panels.
"""

from __future__ import annotations

from nicegui import ui

# Soft palette. Sky blue primary, warm accents, muted slate text
PALETTE = {
    "primary": "#5b8def",
    "primary_soft": "#e8f0fe",
    "accent": "#ffb454",
    "bg": "#f6f8fc",
    "card": "#ffffff",
    "text": "#334155",
    "muted": "#94a3b8",
    "good": "#34d399",
    "bad": "#f87171",
    "pending": "#cbd5e1",
}

MOODS = ("idle", "working", "happy", "trash")


def apply_base_style() -> None:
    """Set page background and register Quasar brand colors. Call once per page."""
    ui.colors(primary=PALETTE["primary"], accent=PALETTE["accent"])
    ui.query("body").style(f'background-color: {PALETTE["bg"]}')


def _eyes(mood: str) -> str:
    if mood == "happy":
        # closed, upturned eyes
        return (
            '<path d="M20 27 q4 -5 8 0" stroke="#334155" stroke-width="2.5" '
            'fill="none" stroke-linecap="round"/>'
            '<path d="M36 27 q4 -5 8 0" stroke="#334155" stroke-width="2.5" '
            'fill="none" stroke-linecap="round"/>'
        )
    if mood == "working":
        # narrowed, focused eyes
        return (
            '<rect x="20" y="25" width="8" height="4" rx="2" fill="#334155"/>'
            '<rect x="36" y="25" width="8" height="4" rx="2" fill="#334155"/>'
        )
    if mood == "trash":
        # x_x eyes for the recycle bin
        return (
            '<path d="M21 24 l6 6 M27 24 l-6 6" stroke="#334155" stroke-width="2.5" '
            'stroke-linecap="round"/>'
            '<path d="M37 24 l6 6 M43 24 l-6 6" stroke="#334155" stroke-width="2.5" '
            'stroke-linecap="round"/>'
        )
    # idle: round eyes with a highlight
    return (
        '<circle cx="24" cy="27" r="4.5" fill="#334155"/>'
        '<circle cx="40" cy="27" r="4.5" fill="#334155"/>'
        '<circle cx="25.5" cy="25.5" r="1.5" fill="#ffffff"/>'
        '<circle cx="41.5" cy="25.5" r="1.5" fill="#ffffff"/>'
    )


def mascot_svg(mood: str = "idle", size: int = 64) -> str:
    """Inline SVG for the robot buddy in one of the moods in MOODS."""
    if mood not in MOODS:
        mood = "idle"
    primary = PALETTE["primary"]
    accent = PALETTE["accent"]
    return f"""
<svg width="{size}" height="{size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sorty robot ({mood})">
  <line x1="32" y1="6" x2="32" y2="14" stroke="{primary}" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="32" cy="5" r="3" fill="{accent}"/>
  <rect x="12" y="14" width="40" height="34" rx="12" fill="{primary}"/>
  <rect x="17" y="19" width="30" height="20" rx="9" fill="#ffffff"/>
  {_eyes(mood)}
  <rect x="26" y="48" width="12" height="8" rx="3" fill="{primary}"/>
  <rect x="8" y="26" width="4" height="12" rx="2" fill="{primary}"/>
  <rect x="52" y="26" width="4" height="12" rx="2" fill="{primary}"/>
</svg>
"""


def mascot(mood: str = "idle", size: int = 64) -> ui.html:
    """Render the mascot. The SVG is app-authored, so sanitizing is unnecessary."""
    return ui.html(mascot_svg(mood, size), sanitize=False)


def card() -> ui.card:
    """A rounded, soft-shadow card matching Sorty's theme."""
    c = ui.card().classes("rounded-2xl shadow-sm").style(
        f'background-color: {PALETTE["card"]}'
    )
    return c


STATUS_COLORS = {
    "valid": PALETTE["good"],
    "invalid": PALETTE["bad"],
    "pending": PALETTE["pending"],
}
