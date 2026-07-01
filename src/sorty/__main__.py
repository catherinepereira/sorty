"""Entry point: python -m sorty."""

from __future__ import annotations


def main() -> None:
    from sorty.app import run

    run()


if __name__ in {"__main__", "__mp_main__"}:
    main()
